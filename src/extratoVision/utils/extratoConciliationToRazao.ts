import type { VisionBalanceteRow } from '../types/accounting';
import type { Transaction } from '../types';

export type ExtratoLineReconForm = {
  contaDebito: string;
  contaCredito: string;
  historicoOperacao: string;
};

function normalizeConta(conta: string): { codigo: string; classificacao: string } {
  const classificacao = conta.trim();
  const codigo = classificacao.replace(/\./g, '') || classificacao;
  return { codigo, classificacao };
}

/** Conta linhas do extrato com D/C preenchidos que ainda não geram lançamento. */
export function countExtratoConciliationPending(
  transactions: Transaction[],
  reconById: Record<string, ExtratoLineReconForm>,
): number {
  let pending = 0;
  for (const t of transactions) {
    const r = reconById[t.id];
    if (!r?.contaDebito?.trim() || !r?.contaCredito?.trim()) pending += 1;
  }
  return pending;
}

/**
 * Converte movimentos do extrato Vision + conciliação linha a linha em lançamentos de razão
 * (partidas dobradas: uma linha de débito e uma de crédito por movimento).
 */
export function buildRazaoFromExtratoConciliation(
  transactions: Transaction[],
  reconById: Record<string, ExtratoLineReconForm>,
): VisionBalanceteRow[] {
  const rows: VisionBalanceteRow[] = [];
  let ordem = 1;

  for (const t of transactions) {
    const r = reconById[t.id] ?? { contaDebito: '', contaCredito: '', historicoOperacao: '' };
    const contaDebRaw = r.contaDebito.trim();
    const contaCredRaw = r.contaCredito.trim();
    if (!contaDebRaw || !contaCredRaw) continue;

    const valor = Math.abs(t.valor);
    if (valor <= 0) continue;

    const historico = (r.historicoOperacao || t.historico || 'LANCAMENTO').trim().toUpperCase();
    const deb = normalizeConta(contaDebRaw);
    const cred = normalizeConta(contaCredRaw);

    rows.push({
      codigo: deb.codigo,
      classificacao: deb.classificacao,
      nome: historico,
      data: t.data,
      debito: valor,
      credito: 0,
      saldoInicial: 0,
      saldoFinal: 0,
      ordem: ordem++,
    });
    rows.push({
      codigo: cred.codigo,
      classificacao: cred.classificacao,
      nome: historico,
      data: t.data,
      debito: 0,
      credito: valor,
      saldoInicial: 0,
      saldoFinal: 0,
      ordem: ordem++,
    });
  }

  return rows;
}
