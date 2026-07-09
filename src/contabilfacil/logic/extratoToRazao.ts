import type { VisionBalanceteRow } from '../../extratoVision/types/accounting';
import { parseDataRazao } from '../../extratoVision/utils/razaoContabil';
import {
  isExtratoLancamentoConciliado,
  resolveExtratoRowContas,
  type ExtratoBankRow,
} from './extratoConciliacaoBank';

export const EXTRATO_RAZAO_MARCA = 'EXTRATO-CONC';

export type BuildExtratoRazaoResult = {
  rows: VisionBalanceteRow[];
  gerados: number;
};

function normalizeConta(conta: string): { codigo: string; classificacao: string } {
  const classificacao = conta.trim();
  const codigo = classificacao.replace(/\./g, '') || classificacao;
  return { codigo, classificacao };
}

export function extratoRazaoNome(id: string, historico: string): string {
  return `${EXTRATO_RAZAO_MARCA}|${id}|${historico}`;
}

export function isExtratoRazaoRow(row: VisionBalanceteRow): boolean {
  return (row.nome ?? '').startsWith(`${EXTRATO_RAZAO_MARCA}|`);
}

/**
 * Gera partidas dobradas no razão a partir de linhas do extrato já conciliadas.
 * Marca cada par com EXTRATO-CONC|id| no histórico para permitir substituição segura.
 */
export function buildRazaoFromExtratoLancamentos(
  lancamentos: ExtratoBankRow[],
  ordemInicial = 1,
): BuildExtratoRazaoResult {
  const rows: VisionBalanceteRow[] = [];
  let ordem = ordemInicial;
  let gerados = 0;

  for (const lan of lancamentos) {
    if (!isExtratoLancamentoConciliado(lan)) continue;

    const { accountDebit, accountCredit } = resolveExtratoRowContas(lan);
    const valor = Math.abs(lan.value ?? 0);
    if (valor <= 0) continue;

    const historico = (lan.operationName || lan.description || 'LANCAMENTO').trim().toUpperCase();
    const nome = extratoRazaoNome(lan.id, historico);
    const deb = normalizeConta(accountDebit);
    const cred = normalizeConta(accountCredit);
    // Extrato costuma vir em ISO (2026-06-01); razão usa DD/MM/AAAA.
    const rawDate = (lan.date ?? '').trim();
    const data = rawDate ? parseDataRazao(rawDate) || rawDate : '—';

    rows.push({
      codigo: deb.codigo,
      classificacao: deb.classificacao,
      nome,
      data,
      debito: valor,
      credito: 0,
      saldoInicial: 0,
      saldoFinal: 0,
      ordem: ordem++,
      tipo: 'A',
    });
    rows.push({
      codigo: cred.codigo,
      classificacao: cred.classificacao,
      nome,
      data,
      debito: 0,
      credito: valor,
      saldoInicial: 0,
      saldoFinal: 0,
      ordem: ordem++,
      tipo: 'A',
    });
    gerados += 1;
  }

  return { rows, gerados };
}

/** Remove lançamentos gerados pelo extrato e acrescenta os novos (sem tocar no extrato importado). */
export function mergeExtratoRazaoComExistente(
  existente: VisionBalanceteRow[],
  novos: VisionBalanceteRow[],
): VisionBalanceteRow[] {
  const base = existente.filter((r) => !isExtratoRazaoRow(r));
  const maxOrdem = base.reduce((m, r) => Math.max(m, r.ordem ?? 0), 0);
  const reordenados = novos.map((r, i) => ({ ...r, ordem: maxOrdem + i + 1 }));
  return [...base, ...reordenados];
}
