/**
 * Contexto de Inteligência IA + uso real de contas (razão/balancete) para regras de extrato.
 */
import type { VisionBalanceteRow } from '../../extratoVision/types/accounting';
import {
  contaCombinaComColigada,
  enrichColigadasComContasDoPlano,
  isContaColigadaNome,
  isContaFornecedorNome,
  resolveContaColigadaParaNatureza,
  listAiColigadasParaIa,
  listAiSociosParaIa,
  type AiColigada,
} from './aiInteligenciaStorage';
import { readManagerData, requireCompanyScope } from './companyWorkspace';
import { sanitizeCodigoReduzido } from './planoContasMapper';
import { buildPlanoHierarquiaSinteticasParaIa } from './planoContasAiContext';
import { buildPastasGruposContasParaIa, pastaConfigTemGrupos } from './aiInteligenciaPastaGrupos';
import { ALL_INTELIGENCIA_PASTAS } from './aiInteligenciaStorage';

export type RegrasContasInteligenciaContext = {
  /** Todos os textos para a IA — grupos de contas + docs por pasta. */
  anexosTexto: string[];
  /** Mapa de grupos sintéticos (entrada/saída) por pasta. */
  pastasGruposContas: string;
  /** Documentos da pasta coligadas. */
  inteligenciaColigadas: string[];
  /** Contratos / sócios. */
  inteligenciaContratos: string[];
  /** Honorários. */
  inteligenciaHonorarios: string[];
  /** Despesas e receitas financeiras. */
  inteligenciaFinanceiras: string[];
  /** Mapa estruturado: contas que a empresa já usa no razão/balancete. */
  balanceteUsoContas: string;
  /** Total de documentos com texto extraído. */
  docsComTexto: number;
  /** Pastas com grupo de contas configurado (sem documento). */
  pastasComGrupos: number;
};

type PlanoRowLike = {
  code?: string;
  codigo?: string;
  name?: string;
  nome?: string;
  codigoReduzido?: string;
  group?: string;
  grupo?: string;
};

function inferGrupoConta(
  reduzido: string,
  classificacao: string,
  plano: PlanoRowLike[],
): string {
  const red = sanitizeCodigoReduzido(reduzido) || '';
  const cls = String(classificacao ?? '').replace(/\./g, '').trim();

  for (const p of plano) {
    const pRed = sanitizeCodigoReduzido(p.codigoReduzido) || '';
    const pCode = String(p.code ?? p.codigo ?? '').replace(/\./g, '').trim();
    if ((red && pRed === red) || (cls && pCode && (pCode === cls || cls.startsWith(pCode)))) {
      const g = String(p.group ?? p.grupo ?? '').trim().toUpperCase();
      if (g) return g;
    }
  }

  const digits = (cls || red).replace(/\D/g, '');
  if (digits.startsWith('1')) return 'ATIVO';
  if (digits.startsWith('2')) return 'PASSIVO';
  if (digits.startsWith('3')) return 'DESPESA';
  if (digits.startsWith('4')) return 'RECEITA';
  if (digits.startsWith('5')) return 'CUSTO';
  return 'OUTROS';
}

/**
 * Resume o razão/balancete importado: quais contas (reduzido + nome) já têm movimento.
 * A IA usa isto para saber ONDE a empresa costuma lançar — não chutar conta aleatória.
 */
export function buildBalanceteUsoContasParaIa(company: string): string {
  const scoped = requireCompanyScope(company);
  const razao = readManagerData<VisionBalanceteRow>(scoped, 'razao');
  const plano = readManagerData<PlanoRowLike>(scoped, 'plano');
  if (!razao.length) return '';

  const byAccount = new Map<
    string,
    { reduzido: string; nome: string; grupo: string; deb: number; cred: number }
  >();

  for (const r of razao) {
    const red = sanitizeCodigoReduzido(r.codigo) || '';
    const nome = String(r.nome ?? '').trim();
    if (!red && !nome) continue;
    const key = `${red}|${nome}`;
    const grupo = inferGrupoConta(red, String(r.classificacao ?? ''), plano);
    const cur = byAccount.get(key) ?? { reduzido: red, nome, grupo, deb: 0, cred: 0 };
    cur.deb += Math.abs(r.debito ?? 0);
    cur.cred += Math.abs(r.credito ?? 0);
    byAccount.set(key, cur);
  }

  const ativas = [...byAccount.values()]
    .filter((a) => a.deb > 0.01 || a.cred > 0.01)
    .sort((a, b) => b.deb + b.cred - (a.deb + a.cred));

  if (!ativas.length) return '';

  const byGrupo = new Map<string, typeof ativas>();
  for (const a of ativas) {
    const g = a.grupo || 'OUTROS';
    if (!byGrupo.has(g)) byGrupo.set(g, []);
    byGrupo.get(g)!.push(a);
  }

  const ordemGrupo = [
    'ATIVO',
    'PASSIVO',
    'RECEITA',
    'DESPESA',
    'CUSTO',
    'PATRIMONIO_LIQUIDO',
    'OUTROS',
  ];
  const lines: string[] = [
    `=== MAPA DE USO DE CONTAS — EMPRESA: ${scoped} (dados EXCLUSIVOS desta empresa) ===`,
    'O analista sênior usa ESTE mapa para saber ONDE a empresa já classifica cada tipo de operação.',
    'PRIORIDADE MÁXIMA: mesma conta que já tem movimento no razão para operações equivalentes.',
    'Ex.: se rendimentos vão para reduzido 510 RECEITA FINANCEIRA aqui, use 510 — não fornecedor/cliente.',
    'Ex.: se aplicações usam reduzido 432 APLICACAO FINANCEIRA, use 432 no BB Rende débito.',
    '',
  ];

  for (const grupo of ordemGrupo) {
    const contas = byGrupo.get(grupo);
    if (!contas?.length) continue;
    lines.push(`--- GRUPO ${grupo} (${contas.length} conta(s) com movimento) ---`);
    for (const c of contas.slice(0, 30)) {
      const redLabel = c.reduzido ? `reduzido ${c.reduzido}` : 'sem reduzido';
      lines.push(
        `· ${redLabel} | ${c.nome} | débito R$ ${c.deb.toFixed(2)} | crédito R$ ${c.cred.toFixed(2)}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n').slice(0, 14_000);
}

/**
 * Mapa explícito coligada → contas no plano e no razão/balancete.
 * A IA cruza isto com o plano para achar a conta certa (não reavaliação, fornecedor etc.).
 */
export function buildColigadasContasPlanoBalanceteParaIa(
  company: string,
  coligadas: AiColigada[],
  plano: PlanoRowLike[],
): string {
  if (!coligadas.length) return '';
  const scoped = requireCompanyScope(company);

  const enriched = enrichColigadasComContasDoPlano(coligadas, plano);
  const razao = readManagerData<VisionBalanceteRow>(scoped, 'razao');
  const movimentoPorConta = new Map<string, { reduzido: string; nome: string; deb: number; cred: number }>();

  for (const r of razao) {
    const red = sanitizeCodigoReduzido(r.codigo) || '';
    const nome = String(r.nome ?? '').trim();
    if (!nome) continue;
    const key = `${red}|${nome}`;
    const cur = movimentoPorConta.get(key) ?? { reduzido: red, nome, deb: 0, cred: 0 };
    cur.deb += Math.abs(r.debito ?? 0);
    cur.cred += Math.abs(r.credito ?? 0);
    movimentoPorConta.set(key, cur);
  }

  const lines: string[] = [
    `=== MAPA COLIGADAS → CONTAS — EMPRESA: ${scoped} (plano/balancete DESTA empresa) ===`,
    'Cruze plano + razão/balancete: a conta da coligada é a que tem o NOME da empresa no plano',
    'e/ou movimento no razão. NUNCA fornecedor, cliente, reavaliação de ativos ou conta sem relação.',
    '',
  ];

  for (const c of enriched.slice(0, 50)) {
    const aliases = [c.nome, ...c.aliases].slice(0, 8).join(', ');
    lines.push(`· COLIGADA: ${c.nome} | aliases: ${aliases}`);

    const planoHits: string[] = [];
    for (const p of plano) {
      if (isContaFornecedorNome(p.name) || /\bCLIENTE/i.test(p.name)) continue;
      if (!contaCombinaComColigada(p.name, c) && !isContaColigadaNome(p.name)) continue;
      const red = sanitizeCodigoReduzido(p.codigoReduzido) || '';
      planoHits.push(`plano: reduzido ${red || '?'} — ${p.name}`);
    }

    const razaoHits: string[] = [];
    for (const m of movimentoPorConta.values()) {
      if (!contaCombinaComColigada(m.nome, c)) continue;
      if (m.deb < 0.01 && m.cred < 0.01) continue;
      razaoHits.push(
        `razão: reduzido ${m.reduzido || '?'} — ${m.nome} (D R$ ${m.deb.toFixed(2)} / C R$ ${m.cred.toFixed(2)})`,
      );
    }

    const contaD = resolveContaColigadaParaNatureza(c, 'D', plano);
    const contaC = resolveContaColigadaParaNatureza(c, 'C', plano);
    if (c.contaReduzida) lines.push(`  cadastro IA: reduzido ${c.contaReduzida}`);
    if (contaD) lines.push(`  saída (D) → reduzido ${contaD}`);
    if (contaC) lines.push(`  entrada (C) → reduzido ${contaC}`);
    for (const h of planoHits.slice(0, 4)) lines.push(`  ${h}`);
    for (const h of razaoHits.slice(0, 3)) lines.push(`  ${h}`);
    lines.push('');
  }

  return lines.join('\n').slice(0, 12_000);
}

/** Ordena docs + grupos sintéticos por pasta. */
export async function buildInteligenciaContextoParaRegrasIaAsync(
  company: string,
  coligadas: AiColigada[] = [],
): Promise<RegrasContasInteligenciaContext> {
  const scoped = requireCompanyScope(company);
  const { loadAiInteligenciaAsync } = await import('./aiInteligenciaStorage');
  const store = await loadAiInteligenciaAsync(scoped);
  const coligs = coligadas.length ? coligadas : store.coligadas;
  const plano = readManagerData<PlanoRowLike>(scoped, 'plano');

  const coligadasDocs: string[] = [];
  const contratosDocs: string[] = [];
  const honorariosDocs: string[] = [];
  const financeirasDocs: string[] = [];

  for (const d of store.docs) {
    const texto = d.textoExtraido.trim();
    if (!texto || texto.startsWith('[arquivo]')) continue;
    const block = `[${d.pasta.toUpperCase()} · ${d.nome}]\n${texto}`;
    if (d.pasta === 'coligadas') coligadasDocs.push(block);
    else if (d.pasta === 'contratos') contratosDocs.push(block);
    else if (d.pasta === 'honorarios') honorariosDocs.push(block);
    else if (d.pasta === 'financeiras') financeirasDocs.push(block);
  }

  const balanceteUsoContas = buildBalanceteUsoContasParaIa(scoped);
  const planoHierarquia = buildPlanoHierarquiaSinteticasParaIa(scoped);
  const coligadasMapa = buildColigadasContasPlanoBalanceteParaIa(scoped, coligs, plano);
  const pastasGruposContas = buildPastasGruposContasParaIa(scoped, store.pastaConfigs ?? {});

  const anexosTexto: string[] = [];
  if (planoHierarquia) anexosTexto.push(planoHierarquia);
  if (pastasGruposContas) anexosTexto.push(pastasGruposContas);
  if (balanceteUsoContas) anexosTexto.push(balanceteUsoContas);
  if (coligadasMapa) anexosTexto.push(coligadasMapa);
  anexosTexto.push(...coligadasDocs, ...contratosDocs, ...honorariosDocs, ...financeirasDocs);

  const docsComTexto =
    coligadasDocs.length + contratosDocs.length + honorariosDocs.length + financeirasDocs.length;
  const pastasComGrupos = ALL_INTELIGENCIA_PASTAS.filter((p) =>
    pastaConfigTemGrupos(store.pastaConfigs?.[p]),
  ).length;

  return {
    anexosTexto,
    pastasGruposContas,
    inteligenciaColigadas: coligadasDocs,
    inteligenciaContratos: contratosDocs,
    inteligenciaHonorarios: honorariosDocs,
    inteligenciaFinanceiras: financeirasDocs,
    balanceteUsoContas,
    docsComTexto,
    pastasComGrupos,
  };
}

/** Contexto adicional: honorários, folha e nome da empresa para regras de sócio/fundo fixo. */
export function buildModulosContextoParaRegrasIa(company: string): string {
  const lines: string[] = ['=== CONTEXTO DA EMPRESA (módulos + regras esperadas) ==='];
  lines.push(`Empresa analisada: ${company}`);
  lines.push('');

  const honorarios = readManagerData<{ contaDebito?: string; contaCredito?: string }>(
    company,
    'honorariosContasAutomacao',
  )[0];
  if (honorarios?.contaDebito || honorarios?.contaCredito) {
    lines.push('--- Honorários (módulo configurado) ---');
    if (honorarios.contaDebito) lines.push(`· Débito honorários: ${honorarios.contaDebito}`);
    if (honorarios.contaCredito) lines.push(`· Crédito honorários: ${honorarios.contaCredito}`);
    lines.push('Pagamentos a escritório/contador → use estas contas se o histórico citar honorários.');
    lines.push('');
  }

  const folha = readManagerData<{ contaDebito?: string; contaCredito?: string }>(
    company,
    'folhaContasAutomacao',
  )[0];
  if (folha?.contaDebito || folha?.contaCredito) {
    lines.push('--- Folha (módulo configurado) ---');
    if (folha.contaDebito) lines.push(`· Débito folha: ${folha.contaDebito}`);
    if (folha.contaCredito) lines.push(`· Crédito folha: ${folha.contaCredito}`);
    lines.push('');
  }

  lines.push('--- Categorias que DEVEM ter regra (cobertura 100% da conciliação) ---');
  const socios = listAiSociosParaIa(company);
  if (socios.length > 0) {
    lines.push('--- Sócios cadastrados (contratos/docs) ---');
    for (const s of socios.slice(0, 20)) {
      lines.push(`· SÓCIO: ${s.nome} | aliases: ${(s.aliases ?? []).join(', ')}`);
    }
    lines.push('');
  }
  lines.push(
    '· SÓCIOS / PRÓ-LABORE / RETIRADAS — leia contrato social e docs de sócios na Inteligência',
  );
  lines.push('· COLIGADAS — cruze MAPA COLIGADAS + plano + balancete (conta com nome da empresa coligada)');
  lines.push('· HONORÁRIOS — pagamento a contador/escritório');
  lines.push('· TARIFAS BANCÁRIAS — tarifa, cesta, pacote, manutenção');
  lines.push('· FORNECEDOR — PIX/TED saída genérico → conta geral FORNECEDORES');
  lines.push('· CLIENTE — PIX/TED entrada genérico → conta geral CLIENTES');
  lines.push(
    `· FUNDO FIXO — histórico com nome/razão da PRÓPRIA EMPRESA ("${company}") ou ambíguo`,
  );
  lines.push(
    '· IMPOSTOS/OBRIGAÇÕES — tipo identificável (IRPJ, PIS…) → conta específica; sem tipo → FUNDO FIXO DE CAIXA',
  );
  lines.push('· RENDIMENTOS, APLICAÇÕES, EMPRÉSTIMOS, FOLHA e demais despesas identificáveis');

  return lines.join('\n').slice(0, 8_000);
}

/**
 * Anexos focados na etapa 1: coligadas, sócios, honorários, financeiras + plano + grupos.
 */
export function buildAnexosTextoEtapa1ParaIa(ctx: RegrasContasInteligenciaContext): string[] {
  const scoped: string[] = [];
  const planoBlock = ctx.anexosTexto.find((b) => b.includes('HIERARQUIA DO PLANO'));
  if (planoBlock) scoped.push(planoBlock);
  if (ctx.pastasGruposContas) scoped.push(ctx.pastasGruposContas);
  if (ctx.balanceteUsoContas) scoped.push(ctx.balanceteUsoContas);
  const coligadasMapa = ctx.anexosTexto.find((b) => b.includes('MAPA COLIGADAS'));
  if (coligadasMapa) scoped.push(coligadasMapa);
  scoped.push(...ctx.inteligenciaColigadas);
  scoped.push(...ctx.inteligenciaContratos);
  scoped.push(...ctx.inteligenciaHonorarios);
  scoped.push(...ctx.inteligenciaFinanceiras);
  return scoped;
}
