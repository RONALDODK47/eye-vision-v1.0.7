import type { VisionBalanceteRow, VisionPlanoRow } from '../types/accounting';
import { getClassificacao } from './demonstracoesContabeis';
import {
  type LinhaComparativoMensal,
  type PeriodoMensal,
  type SaldoMensalCelula,
  celulaSaldoContaNoMes,
  chaveContaComparativo,
} from './balanceteComparativoMensal';
import { isNomeInstituicaoBancaria } from './naturezaContabil';
import {
  type AutomacaoContaConfig,
  resolverContaAutomacao,
  resolverDataAutomacao,
} from './automatizacaoContaConfig';
import { montarBalanceteComPeriodo, filtrarRazaoPorPeriodo } from './razaoContabil';

export type ProgressoCicloGarantida = {
  bancoAtual: number;
  bancosTotal: number;
  mesAtual: number;
  mesesTotal: number;
  mensagem: string;
};

export type OnProgressoCicloGarantida = (p: ProgressoCicloGarantida) => void;

export type ResultadoCicloGarantidaBanco = {
  ok: boolean;
  mensagem: string;
  lancamentosGerados: VisionBalanceteRow[];
  mesParada?: string;
  contasProcessadas: string[];
  detalhes: string[];
};

function normCls(cls: string): string {
  return cls.replace(/\./g, '').replace(/\s/g, '');
}

/** Caixa / fundo fixo — não entram no ciclo banco ↔ garantida. */
export function isContaCaixaOuFundoLinha(
  linha: Pick<LinhaComparativoMensal, 'classificacao' | 'nome' | 'tipo'>,
): boolean {
  if (linha.tipo === 'S') return false;
  const cls = normCls(linha.classificacao ?? '');
  const n = (linha.nome ?? '').toLowerCase();
  return (
    /^11101/.test(cls) ||
    /caixa geral|fundo fixo de caixa|fundo fixo/i.test(n) ||
    (/^caixa\b/i.test(n) && !/banco/i.test(n))
  );
}

/** Contas bancárias (11102…), excluindo caixa e garantida. */
export function isContaBancoLinha(linha: Pick<LinhaComparativoMensal, 'classificacao' | 'nome' | 'tipo'>): boolean {
  if (linha.tipo === 'S') return false;
  if (isContaCaixaOuFundoLinha(linha)) return false;
  const cls = normCls(linha.classificacao ?? '');
  const n = (linha.nome ?? '').toLowerCase();
  if (/garantia|garantida|cau[cç][aã]o/i.test(n)) return false;
  if (/^11102/.test(cls) || /^1102/.test(cls)) return true;
  return isNomeInstituicaoBancaria(linha.nome ?? '');
}

function isContaGarantidaRow(r: Pick<VisionBalanceteRow, 'nome' | 'classificacao'>): boolean {
  const n = (r.nome ?? '').toLowerCase();
  const cls = normCls(getClassificacao(r as VisionBalanceteRow));
  return /garantia|garantida|cau[cç][aã]o/i.test(n) || /garantia/i.test(cls);
}

function isContaBancoRow(r: Pick<VisionBalanceteRow, 'nome' | 'classificacao' | 'tipo'>): boolean {
  if (r.tipo === 'S') return false;
  const fake: LinhaComparativoMensal = {
    chave: chaveContaComparativo(r as VisionBalanceteRow),
    codigo: (r as VisionBalanceteRow).codigo ?? '',
    classificacao: getClassificacao(r as VisionBalanceteRow),
    nome: (r as VisionBalanceteRow).nome ?? '',
    tipo: r.tipo,
    saldosPorMes: {},
    detalhePorMes: {},
  };
  return isContaBancoLinha(fake);
}

/** Uma linha por conta (evita duplicar o mesmo banco). */
export function deduplicarLinhasBanco(linhas: LinhaComparativoMensal[]): LinhaComparativoMensal[] {
  const visto = new Set<string>();
  const out: LinhaComparativoMensal[] = [];
  for (const linha of linhas) {
    if (!isContaBancoLinha(linha)) continue;
    if (visto.has(linha.chave)) continue;
    visto.add(linha.chave);
    out.push(linha);
  }
  return out;
}

function planoParaRowAnalitica(p: VisionPlanoRow): VisionBalanceteRow {
  return {
    codigo: p.codigoReduzido ?? p.codigo,
    classificacao: p.codigo,
    nome: p.nome,
    saldoInicial: 0,
    debito: 0,
    credito: 0,
    saldoFinal: 0,
    tipo: 'A',
  };
}

function resolverContasGarantidaConfig(
  planoRows: VisionPlanoRow[],
  balancete: VisionBalanceteRow[],
  contaConfig?: AutomacaoContaConfig,
): { utilizacao: VisionBalanceteRow | null; devolucao: VisionBalanceteRow | null } {
  const cfg = contaConfig ?? {};
  const cred = resolverContaAutomacao('garantida', cfg, planoRows, balancete, 'credito');
  const deb = resolverContaAutomacao('garantida', cfg, planoRows, balancete, 'debito');
  return {
    utilizacao: cred ?? deb,
    devolucao: deb ?? cred,
  };
}

function escolherContaGarantida(
  balancete: VisionBalanceteRow[],
  planoRows: VisionPlanoRow[],
  contaConfig?: AutomacaoContaConfig,
): { utilizacao: VisionBalanceteRow | null; devolucao: VisionBalanceteRow | null } {
  const cfgPar = resolverContasGarantidaConfig(planoRows, balancete, contaConfig);
  if (cfgPar.utilizacao || cfgPar.devolucao) return cfgPar;

  const doBal = balancete.find((r) => r.tipo !== 'S' && isContaGarantidaRow(r));
  if (doBal) return { utilizacao: doBal, devolucao: doBal };

  const analiticasPlano = planoRows.filter((x) => x.tipo === 'A');
  const porNome = analiticasPlano.find((x) => /garantia|garantida|cau[cç][aã]o|aval|warrant/i.test(x.nome));
  if (porNome) {
    const row = planoParaRowAnalitica(porNome);
    return { utilizacao: row, devolucao: row };
  }

  const passivo2 = analiticasPlano.find((x) => {
    const c = normCls(x.codigo);
    return /^2/.test(c) && /garant|obrig|passiv/i.test(x.nome);
  });
  if (passivo2) {
    const row = planoParaRowAnalitica(passivo2);
    return { utilizacao: row, devolucao: row };
  }

  const sintGarantia = planoRows.find((x) => /garantia|garantida|cau[cç][aã]o/i.test(x.nome));
  if (sintGarantia) {
    const filha = analiticasPlano.find((x) => normCls(x.codigo).startsWith(normCls(sintGarantia.codigo)));
    if (filha) {
      const row = planoParaRowAnalitica(filha);
      return { utilizacao: row, devolucao: row };
    }
  }

  return { utilizacao: null, devolucao: null };
}

function linhaParaRowConta(linha: LinhaComparativoMensal, planoRows: VisionPlanoRow[]): VisionBalanceteRow {
  const cls = normCls(linha.classificacao || '');
  const p = planoRows.find((x) => x.tipo === 'A' && normCls(x.codigo) === cls);
  if (p) {
    return {
      codigo: p.codigoReduzido ?? p.codigo,
      classificacao: p.codigo,
      nome: p.nome,
      tipo: 'A',
      saldoInicial: 0,
      debito: 0,
      credito: 0,
      saldoFinal: 0,
    };
  }
  return {
    codigo: linha.codigo,
    classificacao: linha.classificacao,
    nome: linha.nome,
    tipo: linha.tipo ?? 'A',
    saldoInicial: 0,
    debito: 0,
    credito: 0,
    saldoFinal: 0,
  };
}

function encontrarBancoNoBalancete(
  linha: LinhaComparativoMensal,
  balanceteMes: VisionBalanceteRow[],
  planoRows: VisionPlanoRow[],
): VisionBalanceteRow | null {
  const porChave = balanceteMes.find(
    (r) => r.tipo !== 'S' && chaveContaComparativo(r) === linha.chave,
  );
  if (porChave) return porChave;

  const cls = normCls(linha.classificacao || '');
  if (cls) {
    const porCls = balanceteMes.find(
      (r) => r.tipo !== 'S' && normCls(getClassificacao(r)) === cls,
    );
    if (porCls) return porCls;
  }

  const nome = (linha.nome ?? '').trim().toLowerCase();
  if (nome) {
    const porNome = balanceteMes.find(
      (r) => r.tipo !== 'S' && (r.nome ?? '').trim().toLowerCase() === nome,
    );
    if (porNome) return porNome;
  }

  return linhaParaRowConta(linha, planoRows);
}

function cloneBase(r: VisionBalanceteRow): VisionBalanceteRow {
  return {
    codigo: r.codigo,
    classificacao: r.classificacao,
    nome: r.nome,
    tipo: r.tipo ?? 'A',
    saldoInicial: 0,
    debito: 0,
    credito: 0,
    saldoFinal: 0,
  };
}

/** Utilização: D Banco / C Conta garantida. */
export function lancamentosUtilizacaoGarantida(
  banco: VisionBalanceteRow,
  garantida: VisionBalanceteRow,
  valor: number,
  data: string,
  mesRef: string,
  ordemBase: number,
): VisionBalanceteRow[] {
  const v = Math.abs(valor);
  if (v < 0.05) return [];
  const hist = `[Auto] Utilização garantia ${mesRef} — ${banco.nome}`;
  return [
    { ...cloneBase(banco), data, nome: hist, debito: v, credito: 0, ordem: ordemBase },
    { ...cloneBase(garantida), data, nome: hist, debito: 0, credito: v, ordem: ordemBase + 1 },
  ];
}

/** Devolução: D Conta garantida / C Banco. */
export function lancamentosDevolucaoGarantida(
  banco: VisionBalanceteRow,
  garantida: VisionBalanceteRow,
  valor: number,
  data: string,
  mesRef: string,
  ordemBase: number,
): VisionBalanceteRow[] {
  const v = Math.abs(valor);
  if (v < 0.05) return [];
  const hist = `[Auto] Devolução garantia ${mesRef} — ${banco.nome}`;
  return [
    { ...cloneBase(garantida), data, nome: hist, debito: v, credito: 0, ordem: ordemBase },
    { ...cloneBase(banco), data, nome: hist, debito: 0, credito: v, ordem: ordemBase + 1 },
  ];
}

export function bancoSaldoCredor(cel: SaldoMensalCelula | null | undefined): boolean {
  return !!(cel && cel.valor >= 0.01 && cel.natureza === 'C');
}

/**
 * Automatiza banco credor ↔ garantida mês a mês para TODAS as contas bancárias do comparativo.
 * Cada banco tem ciclo independente; para quando deixa de ficar credor.
 */
export function executarCicloGarantidaBanco(params: {
  linhasBanco: LinhaComparativoMensal[];
  periodos: PeriodoMensal[];
  razaoRows: VisionBalanceteRow[];
  planoRows: VisionPlanoRow[];
  contaConfig?: AutomacaoContaConfig;
  onProgress?: OnProgressoCicloGarantida;
}): ResultadoCicloGarantidaBanco {
  const bancosUnicos = deduplicarLinhasBanco(params.linhasBanco);
  const { periodos, razaoRows, planoRows, contaConfig, onProgress } = params;

  if (!bancosUnicos.length) {
    return {
      ok: false,
      mensagem: 'Nenhuma conta bancária analítica encontrada no comparativo.',
      lancamentosGerados: [],
      contasProcessadas: [],
      detalhes: [],
    };
  }

  if (!periodos.length) {
    return {
      ok: false,
      mensagem: 'Nenhum mês no período do comparativo.',
      lancamentosGerados: [],
      contasProcessadas: [],
      detalhes: [],
    };
  }

  const todosLancamentos: VisionBalanceteRow[] = [];
  const detalhes: string[] = [];
  const contasProcessadas: string[] = [];
  const contasComLancamento = new Set<string>();
  let ordem = 940_000;
  const bancosTotal = bancosUnicos.length;
  const mesesTotal = periodos.length;

  detalhes.push(`${bancosUnicos.length} conta(s) bancária(s) no ciclo: ${bancosUnicos.map((b) => b.nome).join('; ')}.`);

  for (let bi = 0; bi < bancosUnicos.length; bi++) {
    const linha = bancosUnicos[bi];
    let pendenteDevolucao = 0;
    let lancouNestaConta = false;

    for (let mi = 0; mi < periodos.length; mi++) {
      const periodo = periodos[mi];
      const mesLabel = periodo.label;

      onProgress?.({
        bancoAtual: bi + 1,
        bancosTotal,
        mesAtual: mi + 1,
        mesesTotal,
        mensagem: `${linha.nome} · ${mesLabel}`,
      });

      const cel = linha.saldosPorMes[mesLabel];
      const precisaTrabalho = pendenteDevolucao >= 0.05 || bancoSaldoCredor(cel);
      if (!precisaTrabalho) continue;

      const banco = linhaParaRowConta(linha, planoRows);
      let gPar = escolherContaGarantida([], planoRows, contaConfig);

      if ((!gPar.utilizacao || !gPar.devolucao) && precisaTrabalho) {
        const razaoPeriodo = filtrarRazaoPorPeriodo(razaoRows, periodo.de, periodo.ate);
        const balanceteMes = montarBalanceteComPeriodo(
          razaoRows,
          razaoPeriodo,
          planoRows,
          periodo.de,
          periodo.ate,
        );
        gPar = escolherContaGarantida(balanceteMes, planoRows, contaConfig);
      }

      const gUtil = gPar.utilizacao;
      const gDev = gPar.devolucao;

      if (!gUtil || !gDev) {
        detalhes.push(
          `${linha.nome} · ${mesLabel}: conta garantida não encontrada — configure Débito e Crédito em Configurar.`,
        );
        continue;
      }

      const data = resolverDataAutomacao(periodo, contaConfig);

      if (pendenteDevolucao >= 0.05) {
        const dev = lancamentosDevolucaoGarantida(
          banco,
          gDev,
          pendenteDevolucao,
          data,
          mesLabel,
          ordem,
        );
        ordem += 10;
        todosLancamentos.push(...dev);
        lancouNestaConta = true;
        detalhes.push(
          `${linha.nome} · ${mesLabel}: devolução D garantida / C banco — ${pendenteDevolucao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
        );
        pendenteDevolucao = 0;
      }

      if (!bancoSaldoCredor(cel)) continue;

      const valor = cel!.valor;
      const util = lancamentosUtilizacaoGarantida(banco, gUtil, valor, data, mesLabel, ordem);
      ordem += 10;
      todosLancamentos.push(...util);
      pendenteDevolucao = valor;
      lancouNestaConta = true;
      detalhes.push(
        `${linha.nome} · ${mesLabel}: utilização D banco / C garantida — ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
      );
    }

    if (lancouNestaConta) contasComLancamento.add(linha.nome);
    if (!contasProcessadas.includes(linha.nome)) contasProcessadas.push(linha.nome);
  }

  if (!todosLancamentos.length) {
    return {
      ok: false,
      mensagem:
        'Nenhum lançamento gerado. Verifique saldo credor (C) nos bancos e se há conta garantida no plano.',
      lancamentosGerados: [],
      contasProcessadas,
      detalhes,
    };
  }

  const qtdBancos = contasComLancamento.size;
  return {
    ok: true,
    mensagem: `Ciclo banco/garantida em ${qtdBancos} de ${bancosUnicos.length} conta(s) bancária(s). ${todosLancamentos.length} lançamento(s).`,
    lancamentosGerados: todosLancamentos,
    contasProcessadas,
    detalhes,
  };
}
