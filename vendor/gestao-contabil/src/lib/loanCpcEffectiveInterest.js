/**
 * Método da taxa de juros efetiva aplicável a passivos financeiros (empréstimos).
 *
 * Base normativa (Brasil): **CPC 12 (R1)** — Ajuste a Valor Presente (AVP dos fluxos futuros).
 * **CPC 08** — Custos de transação e prêmios na emissão (revogado; subsídios hoje no **CPC 48** — Instrumentos
 * Financeiros): custos de transação deduzidos do valor liberado aumentam a taxa efetiva implícita.
 * **CPC 20 (R1)** — Custos de empréstimos: encargos calculados pelo método da taxa efetiva (itens 6 e correlatos).
 *
 * Convenção numérica: capitalização anual; dias actual/365.
 */

const MS_PER_DAY = 86400000;

/**
 * @param {string} iso
 * @returns {Date | null}
 */
export function parseLocalDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function daysBetween(d0, d1) {
  return (d1.getTime() - d0.getTime()) / MS_PER_DAY;
}

/**
 * @param {Date} d
 * @param {number} months
 */
export function addCalendarMonths(d, months) {
  const x = new Date(d.getTime());
  x.setMonth(x.getMonth() + months);
  return x;
}

/**
 * NPV na data de liberação: -principal + Σ pagamento_i / (1+r)^(dias_i/365)
 */
export function npvAtDisbursement(principal, annualRate, flows, disbursementDate) {
  if (annualRate <= -1) return Number.POSITIVE_INFINITY;
  let s = -principal;
  for (const f of flows) {
    const t = daysBetween(disbursementDate, f.date) / 365;
    if (t < 0) continue;
    s += f.amount / Math.pow(1 + annualRate, t);
  }
  return s;
}

/**
 * Resolve taxa efetiva anual (bissecção) tal que NPV = 0.
 * @returns {number | null}
 */
export function solveEffectiveAnnualRate(principal, flows, disbursementDate) {
  const p = Number(principal);
  if (!Number.isFinite(p) || p <= 0) return null;
  if (!flows.length) return null;
  const sumPay = flows.reduce((a, f) => a + Math.max(0, f.amount), 0);
  if (sumPay <= p + 1e-6) return null;

  let lo = 0;
  let hi = 3;
  let vHi = npvAtDisbursement(p, hi, flows, disbursementDate);
  let guard = 0;
  while (vHi > 0 && hi < 1e6 && guard < 40) {
    hi *= 2;
    vHi = npvAtDisbursement(p, hi, flows, disbursementDate);
    guard++;
  }
  const vLo = npvAtDisbursement(p, lo, flows, disbursementDate);
  if (vLo * vHi > 0) return null;

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const v = npvAtDisbursement(p, mid, flows, disbursementDate);
    if (Math.abs(v) < 1e-4) return mid;
    if (v > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function compoundInterestOnBalance(C, annualRate, t0, t1) {
  if (C <= 0 || annualRate <= -1) return 0;
  const days = daysBetween(t0, t1);
  if (days <= 0) return 0;
  return C * (Math.pow(1 + annualRate, days / 365) - 1);
}

function maxDate(a, b) {
  return a.getTime() >= b.getTime() ? a : b;
}

function minDate(a, b) {
  return a.getTime() <= b.getTime() ? a : b;
}

/**
 * Saldo devedor (custo amortizado) após `paidCount` pagamentos.
 */
export function carryingAmountAfterPaid(principal, annualRate, sortedFlows, disbursementDate, paidCount) {
  let C = principal;
  let lastT = disbursementDate;
  const n = Math.min(paidCount, sortedFlows.length);
  for (let i = 0; i < n; i++) {
    const pay = sortedFlows[i];
    const payDate = pay.date;
    const interest = compoundInterestOnBalance(C, annualRate, lastT, payDate);
    const payment = Math.max(0, pay.amount);
    C = Math.max(0, C + interest - payment);
    lastT = payDate;
  }
  return { carrying: C, lastDate: lastT };
}

/**
 * Juros a apropriar no mês civil de `viewDate` e decomposição da parcela com vencimento nesse mês.
 */
export function cpcAccrualForMonth(
  principal,
  annualRate,
  sortedFlows,
  disbursementDate,
  paidCount,
  viewDate
) {
  const out = {
    jurosMes: 0,
    principalParcelaNoMes: null,
    jurosParcelaNoMes: null,
    parcelaIndexNoMes: null,
  };
  if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(annualRate) || annualRate <= -1) return out;

  const vy = viewDate.getFullYear();
  const vm = viewDate.getMonth();
  const monthStart = new Date(vy, vm, 1, 12, 0, 0, 0);
  const monthEnd = new Date(vy, vm + 1, 0, 12, 0, 0, 0);

  let { carrying: C, lastDate: cursor } = carryingAmountAfterPaid(
    principal,
    annualRate,
    sortedFlows,
    disbursementDate,
    paidCount
  );

  const pending = sortedFlows.slice(paidCount);

  for (let i = 0; i < pending.length; i++) {
    const pay = pending[i];
    const payDate = pay.date;
    const payment = Math.max(0, pay.amount);

    if (payDate > monthEnd) {
      const seg0 = maxDate(cursor, monthStart);
      if (seg0 < monthEnd) {
        out.jurosMes += compoundInterestOnBalance(C, annualRate, seg0, monthEnd);
      }
      return out;
    }

    const seg0 = maxDate(cursor, monthStart);
    const seg1 = minDate(payDate, monthEnd);
    if (seg0 < seg1) {
      out.jurosMes += compoundInterestOnBalance(C, annualRate, seg0, seg1);
    }

    const intFull = compoundInterestOnBalance(C, annualRate, cursor, payDate);
    if (payDate >= monthStart && payDate <= monthEnd) {
      out.parcelaIndexNoMes = pay.originalIndex ?? paidCount + i + 1;
      out.jurosParcelaNoMes = intFull;
      out.principalParcelaNoMes = Math.max(0, payment - intFull);
    }

    C = Math.max(0, C + intFull - payment);
    cursor = payDate;
  }

  const tailA = maxDate(cursor, monthStart);
  if (tailA < monthEnd) {
    out.jurosMes += compoundInterestOnBalance(C, annualRate, tailA, monthEnd);
  }

  return out;
}
