/**
 * Regras obrigatórias a partir dos documentos da Inteligência IA
 * (coligadas, contratos/sócios, balancetes, outros).
 */
import {
  isNomeColigadaInvalido,
  matchColigadaNoHistorico,
  matchSocioNoHistorico,
  resolveContaColigadaParaNatureza,
  syncColigadasFromInteligenciaDocs,
  syncSociosFromInteligenciaDocs,
  type AiColigada,
} from './aiInteligenciaStorage';
import { readManagerData } from './companyWorkspace';
import type { ExtratoLinhaParaRegra, PlanoOptionLike } from './extratoRegrasCobertura';
import {
  extractPadraoOperacionalAgrupado,
  resolveDescricaoRegraColigada,
  resolveDescricaoRegraSocio,
} from './extratoRegrasCobertura';
import type { ExtratoRegraConta } from './extratoRegrasContasStorage';
import { normalizeExtratoMatchText } from './extratoRegrasContasStorage';
import { extractRegraEntityDescricao } from './extratoRegrasEntity';
import {
  resolveCodigoReduzidoDoPlano,
  sanitizeCodigoReduzido,
} from './planoContasMapper';
import { buildInteligenciaContextoParaRegrasIaAsync, type RegrasContasInteligenciaContext } from './regrasContasAiContext';
import { listAiColigadasParaIa } from './aiInteligenciaStorage';

export type RegrasLocaisInteligenciaResult = {
  regras: ExtratoRegraConta[];
  resumo: string;
};

const ETAPA1_HISTORICO_RE =
  /HONOR|CONTAD|ESCRITORIO|ASSESSORIA\s+CONT|PROLABORE|PRO\s*LABORE|RETIRADA\s+SOCIO|DIVIDENDO|DISTRIBUICAO\s+LUCRO|\bSOCIO\b|PARTES?\s+RELACIONAD|COLIGAD|MUTUO|M[UÚ]TUO/i;

/** Nomes/aliases das pastas coligadas, contratos e outros — para cruzar com o extrato. */
export function extractNomesInteligenciaEtapa1(
  coligadas: AiColigada[],
  ctx?: Pick<
    RegrasContasInteligenciaContext,
    'inteligenciaColigadas' | 'inteligenciaContratos' | 'inteligenciaHonorarios' | 'inteligenciaFinanceiras'
  >,
): string[] {
  const nomes = new Set<string>();
  for (const c of coligadas) {
    const n = normalizeExtratoMatchText(c.nome);
    if (n.length >= 4 && !isNomeColigadaInvalido(n)) nomes.add(n);
    for (const a of c.aliases ?? []) {
      const na = normalizeExtratoMatchText(a);
      if (na.length >= 3 && !isNomeColigadaInvalido(na)) nomes.add(na);
    }
  }
  const blocos = [
    ...(ctx?.inteligenciaColigadas ?? []),
    ...(ctx?.inteligenciaContratos ?? []),
    ...(ctx?.inteligenciaHonorarios ?? []),
    ...(ctx?.inteligenciaFinanceiras ?? []),
  ].join('\n');
  for (const raw of blocos.split(/\s+/)) {
    const t = normalizeExtratoMatchText(raw);
    if (t.length < 4 || t.length > 40) continue;
    if (isNomeColigadaInvalido(t)) continue;
    if (/^\d+$/.test(t)) continue;
    if (/LTDA|EIRELI|ME|EPP|SA|SOCIO|HONOR|COLIGAD|CONTAD/.test(t)) nomes.add(t);
  }
  return [...nomes];
}

/** Etapa 1: só lançamentos que podem ser coligada, sócio, honorários ou outros dos documentos. */
export function filterExtratoEtapa1Inteligencia(
  rows: ExtratoLinhaParaRegra[],
  coligadas: AiColigada[],
  ctx?: Pick<
    RegrasContasInteligenciaContext,
    'inteligenciaColigadas' | 'inteligenciaContratos' | 'inteligenciaHonorarios' | 'inteligenciaFinanceiras'
  >,
): ExtratoLinhaParaRegra[] {
  const nomesDocs = extractNomesInteligenciaEtapa1(coligadas, ctx);
  return rows.filter((row) => {
    const hist = normalizeExtratoMatchText(row.description);
    if (!hist) return false;
    if (matchColigadaNoHistorico(hist, coligadas)) return true;
    if (ETAPA1_HISTORICO_RE.test(hist)) return true;
    const histCompact = hist.replace(/\s+/g, '');
    for (const nome of nomesDocs) {
      if (nome.length >= 4 && hist.includes(nome)) return true;
      const nc = nome.replace(/\s+/g, '');
      if (nc.length >= 4 && histCompact.includes(nc)) return true;
    }
    return false;
  });
}

/** Gera regras locais cruzando documentos da Inteligência + padrões do extrato. */
export function buildRegrasLocaisFromInteligenciaDocs(input: {
  company: string;
  contaBanco: string;
  extratoSample: ExtratoLinhaParaRegra[];
  plano: PlanoOptionLike[];
  regrasHistoricas?: ExtratoRegraConta[];
}): RegrasLocaisInteligenciaResult {
  const { company, contaBanco, extratoSample, plano, regrasHistoricas = [] } = input;
  const banco = contaBanco.trim();
  if (!banco) return { regras: [], resumo: '' };

  const coligadas = syncColigadasFromInteligenciaDocs(company);
  const socios = syncSociosFromInteligenciaDocs(company);
  const out: ExtratoRegraConta[] = [];
  const seen = new Set<string>();
  const parts: string[] = [];
  const coligadasNoExtrato = new Set<string>();

  for (const row of extratoSample) {
    const nature = row.nature === 'C' ? ('C' as const) : ('D' as const);
    const coligHit = matchColigadaNoHistorico(row.description, coligadas);
    if (!coligHit) continue;
    coligadasNoExtrato.add(coligHit.id);
    const desc = resolveDescricaoRegraColigada(coligHit, extratoSample, nature, regrasHistoricas);
    const contra = resolveContaColigadaParaNatureza(coligHit, nature, plano);
    if (!desc || !contra) continue;
    const key = `${nature}|${normalizeExtratoMatchText(desc)}|${contra}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: crypto.randomUUID(),
      nome: desc.slice(0, 40),
      descricao: desc,
      nature,
      contaBanco: banco,
      contaContrapartida: contra,
    });
  }
  if (out.length > 0) {
    parts.push(`${out.length} regra(s) de coligada(s) com histórico do extrato`);
  }

  for (const colig of coligadas) {
    if (coligadasNoExtrato.has(colig.id)) continue;
    for (const nature of ['D', 'C'] as const) {
      const contra = resolveContaColigadaParaNatureza(colig, nature, plano);
      if (!contra) continue;
      const desc = resolveDescricaoRegraColigada(colig, extratoSample, nature, regrasHistoricas);
      if (isNomeColigadaInvalido(desc)) continue;
      const key = `${nature}|${normalizeExtratoMatchText(desc)}|${contra}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: crypto.randomUUID(),
        nome: desc.slice(0, 40),
        descricao: desc,
        nature,
        contaBanco: banco,
        contaContrapartida: contra,
      });
    }
  }
  if (coligadas.some((c) => !coligadasNoExtrato.has(c.id))) {
    parts.push('coligada(s) sem lançamento — descrição pelo histórico salvo ou nome nos documentos');
  }

  const honorariosCfg = readManagerData<{
    contaDebito?: string;
    contaCredito?: string;
  }>(company, 'honorariosContasAutomacao')[0];
  const contraHonor =
    honorariosCfg?.contaDebito &&
    (resolveCodigoReduzidoDoPlano(honorariosCfg.contaDebito, plano) ||
      sanitizeCodigoReduzido(honorariosCfg.contaDebito));

  if (contraHonor) {
    for (const row of extratoSample) {
      if (row.nature !== 'D') continue;
      const hist = normalizeExtratoMatchText(row.description);
      if (!/HONOR|CONTAD|ESCRITORIO|ASSESSORIA\s+CONT/.test(hist)) continue;
      const desc = extractPadraoOperacionalAgrupado(row.description, 'D');
      const key = `D|${normalizeExtratoMatchText(desc)}|${contraHonor}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: crypto.randomUUID(),
        nome: desc.slice(0, 40),
        descricao: desc.includes('HONOR') ? 'HONORARIOS PAGAMENTO' : desc,
        nature: 'D',
        contaBanco: banco,
        contaContrapartida: contraHonor,
      });
    }
    if (out.some((r) => /HONOR/.test(r.descricao))) {
      parts.push('honorários conforme módulo/docs');
    }
  }

  for (const row of extratoSample) {
    const nature = row.nature === 'C' ? ('C' as const) : ('D' as const);
    const hist = normalizeExtratoMatchText(row.description);
    if (!/PROLABORE|RETIRADA\s+SOCIO|DISTRIBUICAO\s+LUCRO|DIVIDENDO/.test(hist)) continue;

    const socioHit = matchSocioNoHistorico(row.description, socios);
    const desc = socioHit
      ? resolveDescricaoRegraSocio(socioHit, extratoSample, nature, regrasHistoricas)
      : extractRegraEntityDescricao(row.description, nature, coligadas);
    if (!desc) continue;
    const contra =
      resolveCodigoReduzidoDoPlano(
        readManagerData<{ contaDebito?: string }>(company, 'honorariosContasAutomacao')[0]
          ?.contaDebito || '',
        plano,
      ) || '';
    if (!contra) continue;
    const key = `${nature}|${normalizeExtratoMatchText(desc)}|${contra}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: crypto.randomUUID(),
      nome: desc.slice(0, 40),
      descricao: desc,
      nature,
      contaBanco: banco,
      contaContrapartida: contra,
    });
  }
  if (out.some((r) => /PROLABORE|RETIRADA\s+SOCIO|DIVIDENDO/.test(r.descricao))) {
    parts.push('sócios conforme contratos/docs');
  }

  // Sócios cadastrados sem lançamento no extrato — regra preventiva com nome do documento
  for (const socio of socios) {
    for (const nature of ['D', 'C'] as const) {
      const contra =
        resolveCodigoReduzidoDoPlano(
          readManagerData<{ contaDebito?: string }>(company, 'honorariosContasAutomacao')[0]
            ?.contaDebito || '',
          plano,
        ) || '';
      if (!contra) continue;
      const desc = resolveDescricaoRegraSocio(socio, extratoSample, nature, regrasHistoricas);
      const key = `${nature}|${normalizeExtratoMatchText(desc)}|${contra}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: crypto.randomUUID(),
        nome: desc.slice(0, 40),
        descricao: desc,
        nature,
        contaBanco: banco,
        contaContrapartida: contra,
      });
    }
  }

  return {
    regras: out,
    resumo: parts.length ? parts.join('; ') : '',
  };
}

export async function assertInteligenciaDocsParaRegras(
  company: string,
): Promise<{ ok: boolean; docsComTexto: number; mensagem: string; temRazao: boolean }> {
  const ctx = await buildInteligenciaContextoParaRegrasIaAsync(company);
  const coligadas = listAiColigadasParaIa(company);
  const temRazao = Boolean(ctx.balanceteUsoContas?.trim());
  const temColigadas = coligadas.length > 0;
  const temDocs = ctx.docsComTexto > 0;

  const temGrupos = ctx.pastasComGrupos > 0;

  if (temDocs || temRazao || temColigadas || temGrupos) {
    const partes: string[] = [];
    if (temDocs) partes.push(`${ctx.docsComTexto} doc(s) Inteligência IA`);
    if (temGrupos) partes.push(`${ctx.pastasComGrupos} pasta(s) com grupos de contas`);
    if (temRazao) partes.push('mapa do razão/balancete');
    if (temColigadas) partes.push(`${coligadas.length} coligada(s)`);
    return {
      ok: true,
      docsComTexto: ctx.docsComTexto,
      temRazao,
      mensagem: partes.join(' · '),
    };
  }

  const razaoCount = readManagerData(company, 'razao').length;
  return {
    ok: false,
    docsComTexto: 0,
    temRazao: false,
    mensagem:
      razaoCount > 0
        ? 'Importe o plano com código reduzido e abra o balancete — ou envie docs na Inteligência IA.'
        : 'Configure grupos de contas na Inteligência IA ou envie documentos (coligadas, sócios, honorários, financeiras).',
  };
}
