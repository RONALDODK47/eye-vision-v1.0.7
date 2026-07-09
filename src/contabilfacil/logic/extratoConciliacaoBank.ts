/** Status de conciliação linha a linha no módulo Gerencial (extrato bancário). */

export type ExtratoConciliacaoFiltro = 'todas' | 'conciliadas' | 'pendentes';

export type ExtratoBankRow = {
  id: string;
  date?: string;
  description?: string;
  value?: number;
  nature?: 'D' | 'C' | string;
  accountCode?: string;
  accountDebit?: string;
  accountCredit?: string;
  operationName?: string;
  status?: 'CONCILIADO' | 'PENDENTE';
};

export type ExtratoRowContas = {
  accountDebit: string;
  accountCredit: string;
};

/** Mesma regra da tabela virtual e do PDF de conciliação.
 * Entrada (C): banco no débito · Saída (D): banco no crédito.
 */
export function resolveExtratoRowContas(row: ExtratoBankRow): ExtratoRowContas {
  const deb =
    row.accountDebit?.trim() ||
    (!row.accountCredit?.trim() && row.accountCode?.trim() && row.nature === 'C'
      ? row.accountCode.trim()
      : '');
  const cred =
    row.accountCredit?.trim() ||
    (!row.accountDebit?.trim() && row.accountCode?.trim() && row.nature === 'D'
      ? row.accountCode.trim()
      : '');
  return { accountDebit: deb, accountCredit: cred };
}

/** Conciliado = débito e crédito preenchidos e diferentes (partida dobrada completa). */
export function isExtratoLancamentoConciliado(row: ExtratoBankRow): boolean {
  const { accountDebit, accountCredit } = resolveExtratoRowContas(row);
  if (!accountDebit || !accountCredit) return false;
  // Domínio / placar: mesma conta nos dois lados não conta como conciliado
  if (accountDebit.replace(/\D/g, '') === accountCredit.replace(/\D/g, '')) return false;
  return true;
}

export function syncExtratoConciliacaoStatus<T extends ExtratoBankRow>(rows: T[]): T[] {
  return rows.map((row) => ({
    ...row,
    status: isExtratoLancamentoConciliado(row) ? ('CONCILIADO' as const) : ('PENDENTE' as const),
  }));
}

export function filterExtratoByConciliacaoFiltro<T extends ExtratoBankRow>(
  rows: T[],
  filtro: ExtratoConciliacaoFiltro,
): T[] {
  if (filtro === 'todas') return rows;
  if (filtro === 'conciliadas') return rows.filter(isExtratoLancamentoConciliado);
  return rows.filter((row) => !isExtratoLancamentoConciliado(row));
}

export function countExtratoConciliados(rows: ExtratoBankRow[]): number {
  return rows.filter(isExtratoLancamentoConciliado).length;
}

export function countExtratoPendentes(rows: ExtratoBankRow[]): number {
  return rows.length - countExtratoConciliados(rows);
}
