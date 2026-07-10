import {
  addCalendarMonths,
  cpcAccrualForMonth,
  parseLocalDate,
  solveEffectiveAnnualRate,
} from "@/lib/loanCpcEffectiveInterest";

/**
 * Saldos finais por mês/ano (empréstimo entre empresas).
 * @param {unknown} raw
 * @returns {{ year: number, month: number, balance: number }[]}
 */
export function normalizeInterMonthlyBalances(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const year = Math.floor(Number(r.year));
    const month = Math.floor(Number(r.month));
    if (!Number.isFinite(year) || month < 1 || month > 12) continue;
    out.push({ year, month, balance: toNumber(r.balance) });
  }
  const byKey = new Map();
  for (const r of out) {
    const k = `${r.year}-${String(r.month).padStart(2, "0")}`;
    byKey.set(k, r);
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  );
}

/**
 * Lista de IDs de empresa em empréstimo entre empresas (sem duplicar).
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeInterCompanyIdList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const x of raw) {
    const id = String(x ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Natureza do saldo mensal: pagar | receber | liquido (misto, valores com sinal no cadastro). */
export function getInterSaldoNaturezaLoan(loan) {
  const s = String(loan?.inter_saldo_natureza ?? "").toLowerCase();
  if (s === "liquido") return "liquido";
  if (s === "receber") return "receber";
  return "pagar";
}

/** Empresa âncora do card (Firestore ou legado borrower/lender). */
export function inferInterAnchorCompanyId(loan) {
  const saved = String(loan?.inter_anchor_company_id ?? "").trim();
  const br = String(loan?.borrower_company_id ?? "").trim();
  const len = String(loan?.lender_company_id ?? "").trim();
  if (saved && (saved === br || saved === len)) return saved;
  return getInterSaldoNaturezaLoan(loan) === "receber" ? len : br;
}

/** Contrapartida única em registos legados (sem arrays pagar/receber). */
export function legacyInterSingleCounterpartyId(loan) {
  const anchor = inferInterAnchorCompanyId(loan);
  const br = String(loan?.borrower_company_id ?? "").trim();
  const len = String(loan?.lender_company_id ?? "").trim();
  if (!anchor) return "";
  return anchor === br ? len : br;
}

/**
 * Empresas a pagar (âncora deve) e a receber (âncora recebe), a partir do Firestore ou legado.
 */
export function getInterPayReceiveCompanyIds(loan) {
  const pay = normalizeInterCompanyIdList(loan?.inter_pay_company_ids);
  const rec = normalizeInterCompanyIdList(loan?.inter_receive_company_ids);
  if (pay.length > 0 || rec.length > 0) return { pay, receive: rec };
  const cp = legacyInterSingleCounterpartyId(loan);
  if (!cp) return { pay: [], receive: [] };
  return getInterSaldoNaturezaLoan(loan) === "receber"
    ? { pay: [], receive: [cp] }
    : { pay: [cp], receive: [] };
}

/**
 * Saldos entre empresas por contrapartida e mês.
 * @param {unknown} raw
 * @returns {{ party_company_id: string, direction: string, year: number, month: number, balance: number }[]}
 */
export function normalizeInterPartyBalanceEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const byKey = new Map();
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const party = String(r.party_company_id ?? r.counterparty_company_id ?? "").trim();
    const dirRaw = String(r.direction ?? "").toLowerCase();
    const direction = dirRaw === "receber" ? "receber" : "pagar";
    const year = Math.floor(Number(r.year));
    const month = Math.floor(Number(r.month));
    if (!party || !Number.isFinite(year) || month < 1 || month > 12) continue;
    const k = `${party}|${direction}|${year}-${String(month).padStart(2, "0")}`;
    byKey.set(k, {
      party_company_id: party,
      direction,
      year,
      month,
      balance: toNumber(r.balance),
    });
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month !== b.month ? a.month - b.month : a.party_company_id.localeCompare(b.party_company_id)
  );
}

/**
 * Agrega `inter_monthly_balances` a partir de lançamentos por empresa (compatível com leitores antigos).
 */
export function deriveInterMonthlyBalancesFromPartyEntries(entries, nat) {
  const byYm = new Map();
  for (const e of entries) {
    const k = `${e.year}-${String(e.month).padStart(2, "0")}`;
    const cur = byYm.get(k) || { year: e.year, month: e.month, pay: 0, rec: 0 };
    if (e.direction === "pagar") cur.pay += toNumber(e.balance);
    else cur.rec += toNumber(e.balance);
    byYm.set(k, cur);
  }
  const out = [];
  for (const cur of byYm.values()) {
    let bal;
    if (nat === "liquido") bal = cur.rec - cur.pay;
    else if (nat === "pagar") bal = cur.pay;
    else bal = cur.rec;
    out.push({ year: cur.year, month: cur.month, balance: Math.round(bal * 100) / 100 });
  }
  return out.sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
}

/**
 * @param {{ party_company_id: string, direction: string, year: number, month: number, balance: number }[]} entries
 */
export function computeInterPartyMonthAggregation(entries, viewY, viewM, nat) {
  const hits = entries.filter((e) => e.year === viewY && e.month === viewM);
  let sumPag = 0;
  let sumRec = 0;
  for (const h of hits) {
    if (h.direction === "pagar") sumPag += toNumber(h.balance);
    else sumRec += toNumber(h.balance);
  }
  let saldoMesReferencia = null;
  if (hits.length > 0) {
    if (nat === "liquido") saldoMesReferencia = sumRec - sumPag;
    else if (nat === "pagar") saldoMesReferencia = sumPag;
    else saldoMesReferencia = sumRec;
  }
  return {
    hits,
    sumPag,
    sumRec,
    saldoMesReferencia,
  };
}

/** Último mês/ano com lançamento (entre empresas). */
export function getLatestInterRecordedDate(loan) {
  const pe = normalizeInterPartyBalanceEntries(loan?.inter_party_balance_entries);
  if (pe.length > 0) {
    let best = 0;
    for (const e of pe) {
      const sc = e.year * 100 + e.month;
      if (sc > best) best = sc;
    }
    if (best > 0) {
      const y = Math.floor(best / 100);
      const mo = best % 100;
      return new Date(y, mo - 1, 15, 12, 0, 0, 0);
    }
  }
  const list = normalizeInterMonthlyBalances(loan?.inter_monthly_balances);
  if (list.length > 0) {
    const last = list[list.length - 1];
    return new Date(last.year, last.month - 1, 15, 12, 0, 0, 0);
  }
  return null;
}

/** Último mês com data de parcela no cronograma bancário (referência para “último período”). */
export function getLatestBankScheduleMonthDate(loan) {
  const nTot = Math.max(0, Math.floor(toNumber(loan?.installments_total)));
  const datesArr = loan?.installment_due_dates;
  let maxYm = 0;
  if (Array.isArray(datesArr) && nTot > 0) {
    for (let i = 0; i < nTot; i++) {
      const iso = String(datesArr[i] ?? "").trim();
      const m = /^(\d{4})-(\d{2})/.exec(iso);
      if (m) {
        const y = Number(m[1]);
        const mo = Number(m[2]);
        if (y > 0 && mo >= 1 && mo <= 12) maxYm = Math.max(maxYm, y * 100 + mo);
      }
    }
  }
  if (maxYm === 0 && loan?.first_due_date) {
    const fd = parseFirstDueYearMonth(loan.first_due_date);
    if (fd) maxYm = fd.year * 100 + fd.month;
  }
  if (maxYm === 0) return null;
  const y = Math.floor(maxYm / 100);
  const mo = maxYm % 100;
  return new Date(y, mo - 1, 15, 12, 0, 0, 0);
}

/**
 * Estima parcelas já pagas a partir do total contratado, valores das parcelas e saldo devedor atual (extrato).
 * Usado quando o saldo manual está preenchido e não se sabe quantas parcelas anteriores foram quitadas.
 * @param {{ total: number, installmentsTotal: number, installmentAmount: number, installmentAmounts: number[], isVariavel: boolean, manualBalance: number }} p
 * @returns {number} entre 0 e installmentsTotal
 */
export function inferInstallmentsPaidFromBalance(p) {
  const n = Math.max(0, Math.floor(toNumber(p.installmentsTotal)));
  if (n <= 0) return 0;
  const total = Math.max(0, toNumber(p.total));
  const saldo = Math.max(0, toNumber(p.manualBalance));
  if (saldo > total + 0.01) return 0;
  const targetPaid = Math.min(total, Math.max(0, total - saldo));

  if (p.isVariavel && Array.isArray(p.installmentAmounts) && p.installmentAmounts.length > 0) {
    let k = 0;
    let s = 0;
    const eps = 0.02;
    for (let i = 0; i < n && i < p.installmentAmounts.length; i++) {
      const a = Math.max(0, toNumber(p.installmentAmounts[i]));
      if (s + a <= targetPaid + eps) {
        s += a;
        k = i + 1;
      } else break;
    }
    return Math.min(n, k);
  }

  const vParc = Math.max(0, toNumber(p.installmentAmount));
  if (vParc <= 0) return 0;
  const k = Math.round(targetPaid / vParc);
  return Math.max(0, Math.min(n, k));
}

/**
 * Parcelas pagas efetivas: se há saldo manual e o cadastro diz 0 pagas, infere a partir do saldo.
 * @param {Record<string, unknown>} loan
 */
function perInstallmentForPaidInference(loan) {
  const cm = toNumber(loan.installment_contract_monthly);
  if (cm > 0) return cm;
  const isVariavel =
    loan.installment_schedule === "variavel" && Array.isArray(loan.installment_amounts);
  if (isVariavel && loan.installment_amounts.length > 0) {
    return Math.max(0, toNumber(loan.installment_amounts[0]));
  }
  return Math.max(0, toNumber(loan.installment_amount));
}

export function effectiveInstallmentsPaid(loan) {
  if (loan.loan_kind === "entre_empresas") {
    if (Array.isArray(loan.inter_monthly_balances)) return 0;
    if (normalizeInterPartyBalanceEntries(loan.inter_party_balance_entries).length > 0)
      return 0;
  }
  const nTot = Math.max(0, Math.floor(toNumber(loan.installments_total)));
  let paid = Math.max(0, Math.floor(toNumber(loan.installments_paid)));
  if (nTot > 0) paid = Math.min(paid, nTot);

  const totalPagoReg = toNumber(loan.loan_total_paid);
  if (paid === 0 && totalPagoReg > 0 && nTot > 0) {
    const per = perInstallmentForPaidInference(loan);
    if (per > 0) {
      const k = Math.min(nTot, Math.max(0, Math.floor((totalPagoReg + 1e-6) / per)));
      return k;
    }
  }

  const manualRaw = loan.manual_balance_current;
  const hasManual =
    manualRaw !== undefined &&
    manualRaw !== null &&
    String(manualRaw).trim() !== "";
  if (!hasManual || paid > 0) return paid;

  const isVariavel =
    loan.installment_schedule === "variavel" && Array.isArray(loan.installment_amounts);
  const inferred = inferInstallmentsPaidFromBalance({
    total: toNumber(loan.total_contract_value),
    installmentsTotal: nTot,
    installmentAmount: toNumber(loan.installment_amount),
    installmentAmounts: isVariavel
      ? loan.installment_amounts.map((x) => toNumber(x))
      : [],
    isVariavel,
    manualBalance: toNumber(manualRaw),
  });
  return Math.min(nTot, Math.max(0, inferred));
}

/**
 * Cálculos de empréstimo: parcela fixa, variável, saldo manual; entre empresas por saldo mensal.
 * @param {Record<string, unknown>} loan
 * @param {Date} [viewDate] mês/ano de referência (entre empresas: saldos mensais ou por contrapartida)
 */
export function computeLoanMetrics(loan, viewDate) {
  const view =
    viewDate instanceof Date && !Number.isNaN(viewDate.getTime()) ? viewDate : new Date();

  const partyEntries = normalizeInterPartyBalanceEntries(loan.inter_party_balance_entries);
  if (loan.loan_kind === "entre_empresas" && partyEntries.length > 0) {
    const vy = view.getFullYear();
    const vm = view.getMonth() + 1;
    const nat = getInterSaldoNaturezaLoan(loan);
    const agg = computeInterPartyMonthAggregation(partyEntries, vy, vm, nat);
    const bal = agg.saldoMesReferencia;
    const isLiquido = nat === "liquido";
    const quitado =
      bal != null &&
      (isLiquido ? Math.abs(toNumber(bal)) < 0.005 : toNumber(bal) <= 0);
    return {
      mode: "inter_mensal",
      saldoMesReferencia: bal,
      saldoDevedor: bal != null ? toNumber(bal) : 0,
      parcelasPagas: 0,
      parcelasRestantes: 0,
      proximaParcela: null,
      totalContratado: 0,
      valorParcela: 0,
      valorProximaParcela: null,
      quitado,
      schedule: "fixa",
      mesesLancados: new Set(partyEntries.map((e) => `${e.year}-${e.month}`)).size,
      interSaldoNatureza: nat,
      interPartyHits: agg.hits,
    };
  }

  if (loan.loan_kind === "entre_empresas" && Array.isArray(loan.inter_monthly_balances)) {
    const list = normalizeInterMonthlyBalances(loan.inter_monthly_balances);
    const vy = view.getFullYear();
    const vm = view.getMonth() + 1;
    const hit = list.find((r) => r.year === vy && r.month === vm);
    const nat = getInterSaldoNaturezaLoan(loan);
    const bal = hit ? hit.balance : null;
    const isLiquido = nat === "liquido";
    const quitado =
      hit != null &&
      (isLiquido ? Math.abs(toNumber(hit.balance)) < 0.005 : toNumber(hit.balance) <= 0);
    return {
      mode: "inter_mensal",
      saldoMesReferencia: bal,
      saldoDevedor: bal != null ? toNumber(bal) : 0,
      parcelasPagas: 0,
      parcelasRestantes: 0,
      proximaParcela: null,
      totalContratado: 0,
      valorParcela: 0,
      valorProximaParcela: null,
      quitado,
      schedule: "fixa",
      mesesLancados: list.length,
      interSaldoNatureza: nat,
      interPartyHits: [],
    };
  }

  const total = toNumber(loan.total_contract_value);
  const installmentsTotal = Math.max(0, Math.floor(toNumber(loan.installments_total)));
  let installmentsPaid = effectiveInstallmentsPaid(loan);
  installmentsPaid = Math.min(installmentsPaid, installmentsTotal);
  const remainingCount = Math.max(0, installmentsTotal - installmentsPaid);

  const isVariavel =
    loan.installment_schedule === "variavel" && Array.isArray(loan.installment_amounts);
  const amountsArr = isVariavel ? loan.installment_amounts.map((x) => toNumber(x)) : [];

  function sumPaidVariavel() {
    let s = 0;
    const upTo = Math.min(installmentsPaid, installmentsTotal);
    for (let i = 0; i < upTo; i++) {
      s += i < amountsArr.length ? amountsArr[i] : 0;
    }
    return s;
  }

  let valorProximaParcela = null;
  if (isVariavel) {
    if (installmentsPaid < installmentsTotal && installmentsPaid < amountsArr.length) {
      valorProximaParcela = amountsArr[installmentsPaid];
    } else if (installmentsPaid < installmentsTotal && amountsArr.length > 0) {
      valorProximaParcela = 0;
    }
  } else {
    const installmentAmount = toNumber(loan.installment_amount);
    if (installmentsPaid < installmentsTotal && installmentsTotal > 0) {
      valorProximaParcela = installmentAmount;
    }
  }

  const installmentAmountFixo = toNumber(loan.installment_amount);
  const valorParcelaRef = isVariavel
    ? valorProximaParcela ?? installmentAmountFixo
    : installmentAmountFixo;

  const totalPagoReg = toNumber(loan.loan_total_paid);
  if (totalPagoReg > 0) {
    const saldoPorTotalPago = Math.max(0, total - totalPagoReg);
    return {
      mode: "total_pago",
      saldoDevedor: saldoPorTotalPago,
      parcelasPagas: installmentsPaid,
      parcelasRestantes: remainingCount,
      proximaParcela:
        installmentsTotal === 0
          ? null
          : installmentsPaid >= installmentsTotal
            ? null
            : installmentsPaid + 1,
      totalContratado: total,
      valorParcela: valorParcelaRef,
      valorProximaParcela,
      totalJaPago: totalPagoReg,
      quitado: saldoPorTotalPago <= 0 && installmentsTotal > 0,
      schedule: isVariavel ? "variavel" : "fixa",
    };
  }

  const manualRaw = loan.manual_balance_current;
  if (
    manualRaw !== undefined &&
    manualRaw !== null &&
    String(manualRaw).trim() !== ""
  ) {
    const m = toNumber(manualRaw);
    return {
      mode: "manual",
      saldoDevedor: Math.max(0, m),
      parcelasPagas: installmentsPaid,
      parcelasRestantes: remainingCount,
      proximaParcela:
        installmentsTotal === 0
          ? null
          : installmentsPaid >= installmentsTotal
            ? null
            : installmentsPaid + 1,
      totalContratado: total,
      valorParcela: valorParcelaRef,
      valorProximaParcela,
      quitado: installmentsPaid >= installmentsTotal && installmentsTotal > 0,
      schedule: isVariavel ? "variavel" : "fixa",
    };
  }

  const estimatedPaid = isVariavel
    ? sumPaidVariavel()
    : installmentsPaid * installmentAmountFixo;
  const saldoCalculado = Math.max(0, total - estimatedPaid);

  return {
    mode: "calculado",
    saldoDevedor: saldoCalculado,
    parcelasPagas: installmentsPaid,
    parcelasRestantes: remainingCount,
    proximaParcela:
      installmentsTotal === 0
        ? null
        : installmentsPaid >= installmentsTotal
          ? null
          : installmentsPaid + 1,
    totalContratado: total,
    valorParcela: valorParcelaRef,
    valorProximaParcela,
    quitado:
      installmentsTotal > 0 &&
      (installmentsPaid >= installmentsTotal || saldoCalculado <= 0),
    schedule: isVariavel ? "variavel" : "fixa",
  };
}

function toNumber(v) {
  if (v === undefined || v === null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/\s/g, "");
  const normalized = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function hasCustomParcelDates(loan) {
  if (loan.installment_schedule !== "variavel") return false;
  const n = Math.max(0, Math.floor(toNumber(loan.installments_total)));
  if (n <= 0) return false;
  const arr = loan.installment_due_dates;
  if (!Array.isArray(arr) || arr.length < n) return false;
  for (let i = 0; i < n; i++) {
    if (!parseLocalDate(String(arr[i] ?? ""))) return false;
  }
  return true;
}

/**
 * Cronograma de fluxos para taxa efetiva (ordenado por data de vencimento).
 * @param {Record<string, unknown>} loan
 */
export function buildInstallmentFlowsFromLoan(loan) {
  const n = Math.max(0, Math.floor(toNumber(loan.installments_total)));
  const isVariavel =
    loan.installment_schedule === "variavel" && Array.isArray(loan.installment_amounts);
  const first = parseLocalDate(String(loan.first_due_date || ""));
  if (!first || n <= 0) return { flows: [], disbursementDate: null, sumPayments: 0 };

  const disbRaw = String(loan.loan_disbursement_date || "").trim();
  const disbursement = parseLocalDate(disbRaw) || first;

  const datesArr = Array.isArray(loan.installment_due_dates) ? loan.installment_due_dates : [];

  const flows = [];
  if (isVariavel) {
    for (let i = 0; i < n; i++) {
      const amt = toNumber(loan.installment_amounts[i]);
      const d =
        datesArr[i] != null && String(datesArr[i]).trim() && parseLocalDate(String(datesArr[i]))
          ? parseLocalDate(String(datesArr[i]))
          : addCalendarMonths(first, i);
      flows.push({ amount: amt, date: d, originalIndex: i + 1 });
    }
  } else {
    const amt = toNumber(loan.installment_amount);
    for (let i = 0; i < n; i++) {
      flows.push({ amount: amt, date: addCalendarMonths(first, i), originalIndex: i + 1 });
    }
  }
  flows.sort((a, b) => a.date.getTime() - b.date.getTime());
  const sumPayments = flows.reduce((s, f) => s + f.amount, 0);
  return { flows, disbursementDate: disbursement, sumPayments };
}

/**
 * Parcelas ainda em aberto (a pagar), com vencimento e valor — ordem cronológica.
 * @param {Record<string, unknown>} loan
 */
export function listOutstandingInstallments(loan) {
  const paid = effectiveInstallmentsPaid(loan);
  const n = Math.max(0, Math.floor(toNumber(loan.installments_total)));
  const isVariavel =
    loan.installment_schedule === "variavel" && Array.isArray(loan.installment_amounts);
  const datesArr = Array.isArray(loan.installment_due_dates) ? loan.installment_due_dates : [];
  const first = parseLocalDate(String(loan.first_due_date || ""));
  const out = [];
  for (let i = paid; i < n; i++) {
    let due = null;
    if (isVariavel && datesArr[i] != null && parseLocalDate(String(datesArr[i]))) {
      due = parseLocalDate(String(datesArr[i]));
    } else if (first) {
      due = addCalendarMonths(first, i);
    }
    const amt = isVariavel ? toNumber(loan.installment_amounts[i]) : toNumber(loan.installment_amount);
    out.push({ index: i + 1, amount: amt, dueDate: due });
  }
  out.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));
  return out;
}

/**
 * Parte do passivo reconhecível como circulante (curto prazo) vs não circulante (longo prazo),
 * com base nos **valores nominais das parcelas ainda não pagas** (contrato): soma parcelas com
 * vencimento até ao fim do 12.º mês após o **último dia do mês de referência** → curto; o restante → longo.
 * (Útil para CPC 26 / dicção habitual de obrigações; diferente do saldo CPC/juros efetivos.)
 * @returns {null | { curto: number, longo: number, totalNominal: number, horizonEnd: Date }}
 */
export function computeOutstandingShortLongSplit(loan, viewDate) {
  if (!loan || loan.loan_kind === "entre_empresas") return null;
  const safe =
    viewDate instanceof Date && !Number.isNaN(viewDate.getTime()) ? viewDate : new Date();
  const y = safe.getFullYear();
  const mo = safe.getMonth();
  const monthEnd = new Date(y, mo + 1, 0, 12, 0, 0, 0);
  const horizonEnd = addCalendarMonths(monthEnd, 12);
  const outstanding = listOutstandingInstallments(loan);
  let curto = 0;
  let longo = 0;
  for (const o of outstanding) {
    if (!o.dueDate) continue;
    const amt = Math.max(0, toNumber(o.amount));
    if (o.dueDate.getTime() <= horizonEnd.getTime()) curto += amt;
    else longo += amt;
  }
  curto = Math.round(curto * 100) / 100;
  longo = Math.round(longo * 100) / 100;
  return {
    curto,
    longo,
    totalNominal: Math.round((curto + longo) * 100) / 100,
    horizonEnd,
  };
}

/**
 * Valor contratual da parcela no índice `i` (0-based): parcela mensal fixa no cadastro ou linha do cronograma.
 */
export function contractInstallmentAmountAt(loan, i) {
  const cm = toNumber(loan.installment_contract_monthly);
  if (cm > 0) return cm;
  const isVariavel =
    loan.installment_schedule === "variavel" && Array.isArray(loan.installment_amounts);
  if (isVariavel) return toNumber(loan.installment_amounts[i]);
  return toNumber(loan.installment_amount);
}

/**
 * Controle operacional: juros implícitos na diferença entre parcela contratual e valor efetivamente pago,
 * por vencimento no mês civil de `viewDate`. Só considera linhas em que o valor pago foi informado (campo não vazio).
 * @returns {{ linhas: { index: number, dueDate: Date, parcelaContratual: number, valorPago: number, jurosDiferenca: number }[], totalMes: number }}
 */
export function computeDiffJurosContratoVsPago(loan, viewDate) {
  const safe =
    viewDate instanceof Date && !Number.isNaN(viewDate.getTime()) ? viewDate : new Date();
  const vy = safe.getFullYear();
  const vm = safe.getMonth();
  const monthStart = new Date(vy, vm, 1, 12, 0, 0, 0);
  const monthEnd = new Date(vy, vm + 1, 0, 12, 0, 0, 0);

  const n = Math.max(0, Math.floor(toNumber(loan.installments_total)));
  const linhas = [];
  let totalMes = 0;

  if (n <= 0 || loan.loan_kind === "entre_empresas") {
    return { linhas, totalMes };
  }

  const paidArr = Array.isArray(loan.installment_paid_amounts) ? loan.installment_paid_amounts : [];
  const isVariavel =
    loan.installment_schedule === "variavel" && Array.isArray(loan.installment_amounts);
  const datesArr = Array.isArray(loan.installment_due_dates) ? loan.installment_due_dates : [];
  const first = parseLocalDate(String(loan.first_due_date || ""));

  for (let i = 0; i < n; i++) {
    const paidRaw = paidArr[i];
    const hasPaidInput =
      paidRaw !== undefined && paidRaw !== null && String(paidRaw).trim() !== "";
    if (!hasPaidInput) continue;

    const contract = contractInstallmentAmountAt(loan, i);
    const pago = toNumber(paidRaw);
    let due = null;
    if (isVariavel && datesArr[i] != null && parseLocalDate(String(datesArr[i]))) {
      due = parseLocalDate(String(datesArr[i]));
    } else if (first) {
      due = addCalendarMonths(first, i);
    }
    if (!due || due < monthStart || due > monthEnd) continue;

    const jurosDiferenca = Math.max(0, contract - pago);
    linhas.push({
      index: i + 1,
      dueDate: due,
      parcelaContratual: contract,
      valorPago: pago,
      jurosDiferenca,
    });
    totalMes += jurosDiferenca;
  }

  return { linhas, totalMes };
}

/**
 * Juros a apropriar conforme encadeamento CPC 12 (AVP), CPC 08/CPC 48 e CPC 20; e controle parcela × pagamento (`diffContratoPago`).
 * @param {Record<string, unknown>} loan
 * @param {Date} viewDate
 */
export function computeCpcLoanView(loan, viewDate) {
  const outstanding = listOutstandingInstallments(loan);
  const safe =
    viewDate instanceof Date && !Number.isNaN(viewDate.getTime()) ? viewDate : new Date();
  const diffContratoPago = computeDiffJurosContratoVsPago(loan, safe);

  /** Mesmo montante: valor bruto do contrato = base de liberação (CPC); registros antigos podem ter só um dos campos. */
  const liberadoBruto =
    toNumber(loan.loan_principal_disbursed) || toNumber(loan.total_contract_value);
  const custosTransacao = Math.max(0, toNumber(loan.loan_transaction_costs));
  /** Custo amortizado inicial = líquido creditado após custos (CPC 08 / CPC 48). */
  const principal = liberadoBruto > 0 ? Math.max(0.01, liberadoBruto - custosTransacao) : 0;
  const { flows, disbursementDate } = buildInstallmentFlowsFromLoan(loan);

  if (!principal || principal <= 0 || !flows.length || !disbursementDate) {
    return { cpc: null, outstanding, diffContratoPago };
  }

  const rate = solveEffectiveAnnualRate(principal, flows, disbursementDate);
  if (rate == null || !Number.isFinite(rate)) {
    return { cpc: null, outstanding, diffContratoPago };
  }

  const paid = effectiveInstallmentsPaid(loan);
  const monthAccrual = cpcAccrualForMonth(principal, rate, flows, disbursementDate, paid, safe);

  return {
    cpc: {
      taxaEfetivaAnual: rate,
      liberadoBruto,
      custosTransacao,
      principalCustoAmortizadoInicial: principal,
      ...monthAccrual,
    },
    outstanding,
    diffContratoPago,
  };
}

/** Mês/ano da 1ª parcela (YYYY-MM-DD ou string parseável por Date). */
function parseFirstDueYearMonth(firstDue) {
  if (firstDue === undefined || firstDue === null) return null;
  const t = String(firstDue).trim();
  if (!t) return null;
  const iso = /^(\d{4})-(\d{2})-\d{2}$/.exec(t);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    if (y > 0 && m >= 1 && m <= 12) return { year: y, month: m };
  }
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * Qual parcela corresponde ao mês e ano de referência (1ª parcela = mês/ano de first_due_date; depois +1 mês, trocando de ano se preciso).
 * @param {Record<string, unknown>} loan
 * @param {Date} viewDate qualquer dia dentro do mês/ano visualizado
 */
export function getLoanCalendarMonthContext(loan, viewDate) {
  const safe =
    viewDate instanceof Date && !Number.isNaN(viewDate.getTime()) ? viewDate : new Date();
  const viewY = safe.getFullYear();
  const viewM = safe.getMonth() + 1;

  if (loan.loan_kind === "entre_empresas") {
    const pe = normalizeInterPartyBalanceEntries(loan.inter_party_balance_entries);
    if (pe.length > 0) {
      const nat = getInterSaldoNaturezaLoan(loan);
      const agg = computeInterPartyMonthAggregation(pe, viewY, viewM, nat);
      const saldoFinal = agg.saldoMesReferencia;
      return {
        kind: saldoFinal != null ? "inter_saldo" : "inter_sem_lancamento",
        saldoFinal: saldoFinal != null ? saldoFinal : null,
        totalMesesCadastrados: new Set(pe.map((e) => `${e.year}-${e.month}`)).size,
        interPartyHits: agg.hits,
        parcelaNoMes: null,
        nTot: 0,
        valorParcelaNoMes: 0,
        situacao: null,
        inicio: null,
      };
    }
    if (Array.isArray(loan.inter_monthly_balances)) {
      const list = normalizeInterMonthlyBalances(loan.inter_monthly_balances);
      const hit = list.find((r) => r.year === viewY && r.month === viewM);
      return {
        kind: hit ? "inter_saldo" : "inter_sem_lancamento",
        saldoFinal: hit ? hit.balance : null,
        totalMesesCadastrados: list.length,
        interPartyHits: [],
        parcelaNoMes: null,
        nTot: 0,
        valorParcelaNoMes: 0,
        situacao: null,
        inicio: null,
      };
    }
  }

  const nTot = Math.max(0, Math.floor(toNumber(loan.installments_total)));
  const paid = effectiveInstallmentsPaid(loan);

  const inicio = parseFirstDueYearMonth(loan.first_due_date);
  if (!inicio) {
    return {
      kind: "sem_data",
      parcelaNoMes: null,
      nTot,
      valorParcelaNoMes: 0,
      situacao: null,
      inicio: null,
    };
  }
  if (nTot <= 0) {
    return {
      kind: "sem_parcelas",
      parcelaNoMes: null,
      nTot: 0,
      valorParcelaNoMes: 0,
      situacao: null,
      inicio,
    };
  }

  if (hasCustomParcelDates(loan)) {
    const datesArr = loan.installment_due_dates;
    let minD = null;
    let maxD = null;
    for (let i = 0; i < nTot; i++) {
      const dt = parseLocalDate(String(datesArr[i] ?? ""));
      if (!dt) continue;
      if (!minD || dt < minD) minD = dt;
      if (!maxD || dt > maxD) maxD = dt;
    }
    const viewStart = new Date(viewY, viewM - 1, 1, 12, 0, 0, 0);
    const viewEnd = new Date(viewY, viewM, 0, 12, 0, 0, 0);
    if (minD && viewEnd < minD) {
      return {
        kind: "antes",
        parcelaNoMes: null,
        nTot,
        valorParcelaNoMes: 0,
        situacao: null,
        inicio,
      };
    }
    if (maxD && viewStart > maxD) {
      return {
        kind: "depois",
        parcelaNoMes: null,
        nTot,
        valorParcelaNoMes: 0,
        situacao: null,
        inicio,
        ultimaParcela: nTot,
      };
    }
    let hitIndex = -1;
    for (let i = 0; i < nTot; i++) {
      const dt = parseLocalDate(String(datesArr[i] ?? ""));
      if (dt && dt >= viewStart && dt <= viewEnd) {
        hitIndex = i;
        break;
      }
    }
    if (hitIndex < 0) {
      return {
        kind: "sem_parcela_mes",
        parcelaNoMes: null,
        nTot,
        valorParcelaNoMes: 0,
        situacao: null,
        inicio,
      };
    }
    const parcelaNoMes = hitIndex + 1;
    const valorParcelaNoMes = contractInstallmentAmountAt(loan, hitIndex);
    let situacao = "a_vencer";
    if (paid >= parcelaNoMes) situacao = "paga";
    else if (paid < parcelaNoMes - 1) situacao = "em_atraso";
    return {
      kind: "ok",
      parcelaNoMes,
      nTot,
      valorParcelaNoMes,
      situacao,
      inicio,
    };
  }

  const monthsDiff = (viewY - inicio.year) * 12 + (viewM - inicio.month);
  if (monthsDiff < 0) {
    return {
      kind: "antes",
      parcelaNoMes: null,
      nTot,
      valorParcelaNoMes: 0,
      situacao: null,
      inicio,
    };
  }

  const parcelaNoMes = monthsDiff + 1;
  if (parcelaNoMes > nTot) {
    return {
      kind: "depois",
      parcelaNoMes: null,
      nTot,
      valorParcelaNoMes: 0,
      situacao: null,
      inicio,
      ultimaParcela: nTot,
    };
  }

  const valorParcelaNoMes = contractInstallmentAmountAt(loan, parcelaNoMes - 1);

  let situacao = "a_vencer";
  if (paid >= parcelaNoMes) situacao = "paga";
  else if (paid < parcelaNoMes - 1) situacao = "em_atraso";

  return {
    kind: "ok",
    parcelaNoMes,
    nTot,
    valorParcelaNoMes,
    situacao,
    inicio,
  };
}

export function formatBRL(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}
