import { addMonths, format, isValid, parseISO } from 'date-fns';

/**
 * Data da 1ª parcela de amortização (após carência).
 * Carência N = N competências mensais **após** o mês do contrato (o mês do contrato não conta).
 * Ex.: contrato 10/02/2023, carência 11 → última competência 10/01/2024, 1ª amort. 10/02/2024.
 */
export function computeFirstInstallmentDate(contractDateStr: string, gracePeriod: number): string {
  const base = parseISO(String(contractDateStr ?? '').trim().slice(0, 10));
  if (!isValid(base)) return String(contractDateStr ?? '').trim().slice(0, 10);
  const grace = Math.max(0, Math.floor(gracePeriod));
  if (grace === 0) return format(base, 'yyyy-MM-dd');
  /** Um mês civil após o último vencimento de carência (addMonths(contrato, N+1)). */
  return format(addMonths(base, grace + 1), 'yyyy-MM-dd');
}

/** Datas de vencimento dos meses de carência (1º = mês seguinte ao contrato). */
export function computeGraceMonthDates(contractDateStr: string, gracePeriod: number): string[] {
  const grace = Math.max(0, Math.floor(gracePeriod));
  if (grace === 0) return [];
  const contract = parseISO(String(contractDateStr ?? '').trim().slice(0, 10));
  if (!isValid(contract)) return [];
  const out: string[] = [];
  for (let m = 1; m <= grace; m++) {
    out.push(format(addMonths(contract, m), 'yyyy-MM-dd'));
  }
  return out;
}

export function formatBrDateFromIso(iso: string): string {
  const d = parseISO(iso.slice(0, 10));
  if (!isValid(d)) return iso;
  return format(d, 'dd/MM/yyyy');
}
