import type { VisionBalanceteRow, VisionPlanoRow } from '../types/accounting';
import { getClassificacao } from './demonstracoesContabeis';
import { type PeriodoMensal } from './balanceteComparativoMensal';
import {
  type AutomacaoContaConfig,
  normClsAutomacao,
  resolverContaAutomacao,
  resolverDataAutomacao,
  rowFromVinculo,
} from './automatizacaoContaConfig';
import { aplicarLancamentosNoRazao } from './balanceteAutoCorrecao';
import { filtrarRazaoPorPeriodo, montarBalanceteComPeriodo } from './razaoContabil';

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

function parLancamento(
  contaDeb: VisionBalanceteRow,
  contaCred: VisionBalanceteRow,
  valor: number,
  data: string,
  historico: string,
  ordem: number,
): VisionBalanceteRow[] {
  return [
    { ...cloneBase(contaDeb), data, nome: historico, debito: valor, credito: 0, ordem },
    { ...cloneBase(contaCred), data, nome: historico, debito: 0, credito: valor, ordem: ordem + 1 },
  ];
}

/** Faturamento líquido no mês = créditos − débitos da conta de receita. */
export function faturamentoLiquidoNoMes(row: VisionBalanceteRow): number {
  const cred = row.credito ?? 0;
  const deb = row.debito ?? 0;
  return Math.max(0, cred - deb);
}

function fmtMoeda(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Lança custo = faturamento × porcentagem/100 para cada mês do comparativo.
 * Exige D, C, porcentagem > 0 e conta de faturamento na configuração de custos.
 */
export function executarLancamentoCustoPorFaturamento(params: {
  periodos: PeriodoMensal[];
  razaoRows: VisionBalanceteRow[];
  planoRows: VisionPlanoRow[];
  contaConfig?: AutomacaoContaConfig;
  onProgress?: (msg: string) => void;
}): { razao: VisionBalanceteRow[]; lancamentos: VisionBalanceteRow[]; detalhes: string[] } {
  const { periodos, planoRows, contaConfig = {}, onProgress } = params;
  let razaoAtual = params.razaoRows;
  const lancamentos: VisionBalanceteRow[] = [];
  const detalhes: string[] = [];

  const cfgCustos = contaConfig.custos;
  const pct = cfgCustos?.porcentagemCusto ?? 0;
  const vincFat = cfgCustos?.contaFaturamento;

  if (!cfgCustos || pct <= 0 || !vincFat?.classificacao?.trim()) {
    return { razao: razaoAtual, lancamentos, detalhes };
  }

  const contaCusto = resolverContaAutomacao('custos', contaConfig, planoRows, undefined, 'debito');
  const contaContra = resolverContaAutomacao('custos', contaConfig, planoRows, undefined, 'credito');

  if (!contaCusto || !contaContra) {
    detalhes.push(
      'Custos (% faturamento): informe conta D (custo) e C (contrapartida) para lançar o custo calculado.',
    );
    return { razao: razaoAtual, lancamentos, detalhes };
  }

  let ordem = 950_000;

  for (const periodo of periodos) {
    onProgress?.(`Custo × faturamento · ${periodo.label}`);

    const razaoPeriodo = filtrarRazaoPorPeriodo(razaoAtual, periodo.de, periodo.ate);
    const balanceteMes = montarBalanceteComPeriodo(
      razaoAtual,
      razaoPeriodo,
      planoRows,
      periodo.de,
      periodo.ate,
    );

    const clsFat = normClsAutomacao(vincFat.classificacao);
    const rowFat =
      balanceteMes.find(
        (r) => r.tipo !== 'S' && normClsAutomacao(getClassificacao(r)) === clsFat,
      ) ?? rowFromVinculo(vincFat, planoRows, balanceteMes);

    if (!rowFat) {
      detalhes.push(`Custos (${periodo.label}): conta de faturamento não encontrada no balancete.`);
      continue;
    }

    const faturamento = faturamentoLiquidoNoMes(rowFat);
    if (faturamento < 0.05) {
      detalhes.push(
        `Custos (${periodo.label}): faturamento R$ ${fmtMoeda(faturamento)} — sem lançamento.`,
      );
      continue;
    }

    const valorCusto = Math.round(faturamento * (pct / 100) * 100) / 100;
    if (valorCusto < 0.05) continue;

    const data = resolverDataAutomacao(periodo, contaConfig);
    const hist = `[Auto custo] ${pct}% × faturamento ${vincFat.classificacao} (${periodo.label})`;
    const par = parLancamento(contaCusto, contaContra, valorCusto, data, hist, ordem);
    ordem += 2;

    lancamentos.push(...par);
    razaoAtual = aplicarLancamentosNoRazao(razaoAtual, par);
    detalhes.push(
      `Custos (${periodo.label}): faturamento R$ ${fmtMoeda(faturamento)} × ${pct}% = R$ ${fmtMoeda(valorCusto)}.`,
    );
  }

  return { razao: razaoAtual, lancamentos, detalhes };
}
