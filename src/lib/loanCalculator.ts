import { addMonths, differenceInCalendarDays, format, startOfMonth, addDays, startOfDay } from 'date-fns';
import { adjustInstallmentDueDate as adjustInstallmentDueDateBr } from './brBusinessDays';

export { adjustInstallmentDueDateBr as adjustInstallmentDueDate };
import {
  effectivePctFromRoundedInterest,
  interestFromPeriodRate,
  resolvePeriodRateMemory,
  type SelicOverAccrualMode,
  selicPointsToMap,
  type PeriodRateMemory,
  type SelicDailyPoint,
  type VarIndexMode,
} from './selicOverIndex';
import {
  buildLongoInicioAnoCivil,
  calcCurtoProvisionadoDezembro,
  calcCurtoProvisionadoUltimaCarencia,
  indiceLinhaDezembroNoAno,
} from './cpcFiscalYearEnd';

/**
 * Fecha a competência quando o vencimento coincide com o início (ex.: dia 1 após carência):
 * o período vai até o próximo vencimento mensal, evitando 0 dias corridos.
 */
export function resolveAccrualEndDate(accrualStart: Date, rowDate: Date): Date {
  return differenceInCalendarDays(rowDate, accrualStart) > 0 ? rowDate : addMonths(rowDate, 1);
}

/** Dias corridos do período, dias do mês civil de referência (até o vencimento) e fator pro rata dias/ref. */
export function calendarAccrualMetrics(accrualStart: Date, accrualEnd: Date): {
  days: number;
  refMonthDays: number;
  factor: number;
} {
  const daysInPeriod = differenceInCalendarDays(accrualEnd, accrualStart);
  const referenceMonthDays = differenceInCalendarDays(accrualEnd, addMonths(accrualEnd, -1));
  const denom = referenceMonthDays > 0 ? referenceMonthDays : 1;
  if (daysInPeriod <= 0) {
    return { days: Math.max(0, daysInPeriod), refMonthDays: denom, factor: 0 };
  }
  return { days: daysInPeriod, refMonthDays: denom, factor: daysInPeriod / denom };
}

/** Pro Rata Die: fator dias corridos do período ÷ 30 (apenas juros na composição). */
export function proRataDie30Factor(accrualStart: Date, accrualEnd: Date): number {
  const dias = differenceInCalendarDays(accrualEnd, accrualStart);
  if (dias <= 0) return 0;
  return dias / 30;
}

/**
 * Rateio do custo operacional sobre dias corridos (nunca sobre PMT/parcela).
 * - commercial30: tarifa mensal (R$) × (d÷30); % sobre saldo × (d÷30) [ou composto, ver função].
 * - calendar365: tarifa mensal (R$) × (12/365) × dias; % sobre saldo × (12/365) × dias (linear).
 */
export type OperationalCostDayBasis = 'commercial30' | 'calendar365';

export function operationalCostDayFactor(
  accrualStart: Date,
  accrualEnd: Date,
  basis: OperationalCostDayBasis
): number {
  const dias = differenceInCalendarDays(accrualEnd, accrualStart);
  if (dias <= 0) return 0;
  if (basis === 'calendar365') return (12 / 365) * dias;
  return dias / 30;
}

/** Simples: SD × i × (d/30). Banco: SD × ((1+i)^(d/30) − 1), com i mensal em decimal. */
export type ProRataDieMode = 'linear' | 'compound';

/**
 * Arredondamento intermediário dos juros na carência (aplicado sobre o resultado da fórmula antes da parcela/saldo).
 * `none`: precisão completa em ponto flutuante.
 */
export type GraceInterestRoundingMode = 'none' | 'halfAwayFromZero' | 'truncate' | 'floor' | 'ceil';

/**
 * Arredonda valor monetário de juros conforme modo e número de casas decimais.
 * Half away from zero ≈ half-up para valores positivos (comuns em tarifários).
 */
export function roundGraceInterestAmount(
  value: number,
  decimalPlaces: number,
  mode: GraceInterestRoundingMode
): number {
  if (mode === 'none' || !Number.isFinite(value)) return value;
  const d = Math.max(0, Math.min(15, Math.floor(decimalPlaces)));
  const k = Math.pow(10, d);
  const scaled = value * k;

  switch (mode) {
    case 'halfAwayFromZero':
      return (scaled >= 0 ? Math.floor(scaled + 0.5 + 1e-12) : Math.ceil(scaled - 0.5 - 1e-12)) / k;
    case 'truncate':
      return Math.sign(value) * Math.floor(Math.abs(scaled)) / k;
    case 'floor':
      return Math.floor(scaled) / k;
    case 'ceil':
      return Math.ceil(scaled) / k;
    default:
      return value;
  }
}

/**
 * Juros do período: taxa mensal em decimal × fator temporal (habitualmente `d÷30`; no SAC «mensal» = 1 por competência).
 * Composto em subperíodo: `saldo × ((1+i)^f − 1)`.
 */
export function interestFromMonthlyFactor(
  balance: number,
  monthlyRateDecimal: number,
  factor: number,
  mode: ProRataDieMode
): number {
  if (balance <= 0 || monthlyRateDecimal === 0 || factor <= 0) return 0;
  if (mode === 'compound') {
    return balance * (Math.pow(1 + monthlyRateDecimal, factor) - 1);
  }
  return balance * monthlyRateDecimal * factor;
}

/** Juros com Pro Rata Die (d÷30): linear ou composto no subperíodo. */
function interestProRataDie30(
  balance: number,
  monthlyRateDecimal: number,
  accrualStart: Date,
  accrualEnd: Date,
  mode: ProRataDieMode
): number {
  const f = proRataDie30Factor(accrualStart, accrualEnd);
  return interestFromMonthlyFactor(balance, monthlyRateDecimal, f, mode);
}

/**
 * SAC — só fase de amortização:
 * - `mensalContrato`: juros sobre saldo com fator temporal 1 (competência “cheia”; comum em muitos contratos).
 * - `proRataCorridos`: fator dias corridos ÷ 30 na taxa mensal (linear ou composto via `proRataDieMode`).
 * - `proRataMesCivil`: dias corridos do período ÷ dias do mês civil que contém o vencimento.
 */
export type SacInterestAccrual = 'proRataCorridos' | 'mensalContrato' | 'proRataMesCivil';

/** Arredondamento de valores monetários (SAC e PRICE). */
export type SacMoneyRoundingMode = 'halfAwayFromZero' | 'truncateCentavos';

/** IOF financiado entra no saldo devedor; IOF pago à parte só no CET e no lançamento Domínio. */
export type IofTreatmentMode = 'financed' | 'paid';

/** Arredonda valor monetário em reais conforme modo SAC (base 100 = centavos). */
export function applySacMoneyRound(value: number, mode: SacMoneyRoundingMode): number {
  if (!Number.isFinite(value)) return 0;
  const k = 100;
  const scaled = value * k;
  if (mode === 'truncateCentavos') {
    return Math.sign(scaled >= 0 ? 1 : -1) * Math.floor(Math.abs(scaled) + 1e-12) / k;
  }
  return (scaled >= 0 ? Math.floor(scaled + 0.5 + 1e-12) : Math.ceil(scaled - 0.5 - 1e-12)) / k;
}

function sacInterestTemporalFactor(
  accrual: SacInterestAccrual,
  accrualStart: Date,
  accrualEnd: Date
): number {
  if (accrual === 'mensalContrato') return 1;
  if (accrual === 'proRataCorridos') return proRataDie30Factor(accrualStart, accrualEnd);
  const cal = calendarAccrualMetrics(accrualStart, accrualEnd);
  if (cal.days <= 0 || cal.refMonthDays <= 0) return 0;
  return cal.days / cal.refMonthDays;
}

/**
 * Nunca usa valor da parcela (PMT) como base.
 */
function operationalCostForPeriod(
  balanceForPercentBase: number,
  monthlyOpCostType: 'percent' | 'value',
  monthlyOperationCost: number,
  accrualStart: Date,
  accrualEnd: Date,
  mode: ProRataDieMode,
  costDayBasis: OperationalCostDayBasis
): number {
  const dias = differenceInCalendarDays(accrualEnd, accrualStart);
  if (dias <= 0) return 0;

  if (monthlyOpCostType === 'value') {
    const f = operationalCostDayFactor(accrualStart, accrualEnd, costDayBasis);
    return monthlyOperationCost * f;
  }

  if (monthlyOperationCost === 0 || balanceForPercentBase <= 0) return 0;
  const r = monthlyOperationCost / 100;

  if (costDayBasis === 'calendar365') {
    return balanceForPercentBase * r * (12 / 365) * dias;
  }

  const f30 = dias / 30;
  if (mode === 'compound') {
    return balanceForPercentBase * (Math.pow(1 + r, f30) - 1);
  }
  return balanceForPercentBase * r * f30;
}

/**
 * Tabela Price clássica (prestação constante, taxa efetiva mensal i, n períodos):
 * P = PV × [ i(1+i)^n / ((1+i)^n − 1) ].
 */
export function priceAnnuityPayment(
  principal: number,
  n: number,
  monthlyRateDecimal: number
): number {
  if (principal <= 0 || n <= 0) return 0;
  if (monthlyRateDecimal === 0) return principal / n;
  const pow = Math.pow(1 + monthlyRateDecimal, n);
  return (principal * monthlyRateDecimal * pow) / (pow - 1);
}

function hasZeroOperationalCost(
  monthlyOpCostType: 'percent' | 'value',
  monthlyOperationCost: number
): boolean {
  return monthlyOperationCost === 0;
}

/**
 * PRICE: parcela K fixa; juros sobre saldo de abertura arredondado; amortização = K − juros − custo (arredondados).
 * Sem custo op. e competência mensal cheia ⇒ fórmula analítica da Tabela Price; caso contrário, busca binária com o mesmo arredondamento do fluxo.
 */
function solvePriceFixedInstallment(
  financedAmount: number,
  n: number,
  monthlyRateDecimal: number,
  monthlyOpCostType: 'percent' | 'value',
  monthlyOperationCost: number,
  firstInstallmentDate: Date,
  accrualStartAfterGrace: Date,
  proRataDieMode: ProRataDieMode,
  operationalCostDayBasis: OperationalCostDayBasis,
  priceInterestAccrual: SacInterestAccrual,
  rndPrice: (x: number) => number
): number {
  if (financedAmount <= 0 || n <= 0) return 0;

  const useAnalyticPrice =
    hasZeroOperationalCost(monthlyOpCostType, monthlyOperationCost) &&
    priceInterestAccrual === 'mensalContrato' &&
    proRataDieMode === 'linear';

  if (useAnalyticPrice) {
    return rndPrice(priceAnnuityPayment(financedAmount, n, monthlyRateDecimal));
  }

  const simulate = (K: number): { rem: number; bad: boolean } => {
    let balance = financedAmount;
    let accStart = accrualStartAfterGrace;
    for (let m = 1; m <= n; m++) {
      const rowDate = addMonths(firstInstallmentDate, m - 1);
      const accrualEnd = resolveAccrualEndDate(accStart, rowDate);
      const sd = rndPrice(balance);
      const pf = sacInterestTemporalFactor(priceInterestAccrual, accStart, accrualEnd);
      const int = rndPrice(interestFromMonthlyFactor(sd, monthlyRateDecimal, pf, proRataDieMode));
      const cost = rndPrice(
        operationalCostForPeriod(
          sd,
          monthlyOpCostType,
          monthlyOperationCost,
          accStart,
          accrualEnd,
          proRataDieMode,
          operationalCostDayBasis
        )
      );
      let amort: number;
      if (m === n) {
        amort = rndPrice(sd);
      } else {
        const inst = rndPrice(K);
        amort = rndPrice(Math.max(0, Math.min(sd, inst - int - cost)));
      }
      if (amort < -1e-7) return { rem: NaN, bad: true };
      balance = rndPrice(sd - amort);
      accStart = accrualEnd;
    }
    return { rem: balance, bad: false };
  };

  const d0 = addMonths(firstInstallmentDate, 0);
  const d0End = resolveAccrualEndDate(accrualStartAfterGrace, d0);
  const pf0 = sacInterestTemporalFactor(priceInterestAccrual, accrualStartAfterGrace, d0End);
  const int0 = rndPrice(interestFromMonthlyFactor(financedAmount, monthlyRateDecimal, pf0, proRataDieMode));
  const c0 = rndPrice(
    operationalCostForPeriod(
      financedAmount,
      monthlyOpCostType,
      monthlyOperationCost,
      accrualStartAfterGrace,
      d0End,
      proRataDieMode,
      operationalCostDayBasis
    )
  );
  let lo = int0 + c0 + 1e-12;

  let hi = Math.max(rndPrice(financedAmount / n) + int0 + c0, lo + 1e-6);
  for (let expand = 0; expand < 90; expand++) {
    const { rem, bad } = simulate(hi);
    if (!bad && rem <= 0.01) break;
    hi *= 1.12;
    if (hi > financedAmount * 200 + 1e15) break;
  }

  let best = hi;
  for (let iter = 0; iter < 120; iter++) {
    const mid = (lo + hi) / 2;
    const { rem, bad } = simulate(mid);
    if (bad || isNaN(rem)) {
      lo = mid;
      continue;
    }
    if (Math.abs(rem) < 0.005) {
      best = mid;
      break;
    }
    if (rem > 0) lo = mid;
    else {
      hi = mid;
      best = mid;
    }
  }
  return rndPrice(best);
}

/** CPC 03 — contábil: passivo no longo até o pagamento (sem janela CPC “curto”). Fiscal: janela CPC + reclasse típica LP→CP no export. */
export type CpcPresentationMode = 'contabil' | 'fiscal';

export interface LoanParams {
  principal: number;
  /** IOF na data do contrato (coluna IOF / TXT). */
  valorIof?: number;
  /** Financiado: soma ao saldo e à amortização; pago: não entra na base da parcela. */
  iofMode?: IofTreatmentMode;
  months: number;
  fixedRateMonth: number;
  fixedRateType: 'percent' | 'value';
  varRateMonth: number;
  gracePeriod: number;
  graceType: 'capitalized' | 'paid';
  system: 'SAC' | 'PRICE';
  monthlyOperationCost: number;
  monthlyOpCostType: 'percent' | 'value';
  /** Juros base na carência (mesma convenção que pós-carência). */
  graceFixedRateMonth: number;
  graceFixedRateType: 'percent' | 'value';
  /** Custo operacional só na carência. */
  graceMonthlyOperationCost: number;
  graceMonthlyOpCostType: 'percent' | 'value';
  /** Pro rata d÷30: linear ou composto para juros; custo % no modo 30 dias segue o mesmo expoente quando aplicável. */
  proRataDieMode: ProRataDieMode;
  /** Rateio do custo op.: mês comercial (d÷30) ou calendário (12/365×dias). */
  operationalCostDayBasis: OperationalCostDayBasis;
  /** Só na carência: aplicar após calcular juros SD×(linear ou exponencial), antes da parcela e do saldo. */
  graceInterestRoundingMode: GraceInterestRoundingMode;
  graceInterestDecimalPlaces: number;
  contractDate: Date;
  firstInstallmentDate: Date;
  /**
   * Só SAC (fase de amortização). `mensalContrato` cobre contratos nos quais juros por parcela são
   * `saldo × i` efetiva por período inteiro — evita discrepâncias com dias 28–31 usando `d÷30`.
   * PRICE ignora. Omissão ⇒ `mensalContrato`.
   */
  sacInterestAccrual?: SacInterestAccrual;
  /** SAC: forma de truncar/arredondar centavos no fluxo principal. Omissão ⇒ meia-distância. */
  sacMoneyRounding?: SacMoneyRoundingMode;
  /**
   * PRICE (amortização): base temporal dos juros sobre saldo (− ÷30, competência inteira ou mês civil).
   * Omissão ⇒ `proRataCorridos` (mantém comportamento PRICE histórico com d÷30).
   */
  priceInterestAccrual?: SacInterestAccrual;
  /** PRICE: arredondamento em centavos (última parcela absorve resíduo). Omissão ⇒ meia-distância. */
  priceMoneyRounding?: SacMoneyRoundingMode;
  /**
   * PRICE: quando a carência capitaliza, mantém a prestação calculada sobre o saldo pré-carência.
   * SAC: ver `sacAmortizationBase`.
   */
  preserveInstallmentAfterCapitalizedGrace?: boolean;
  /**
   * SAC — base da parcela de amortização constante:
   * - `incorporated`: saldo após carência ÷ parcelas (padrão contábil).
   * - `contractPrincipal`: principal do contrato ÷ número de parcelas de amortização.
   */
  sacAmortizationBase?: 'incorporated' | 'contractPrincipal';
  /** Compatibilidade legada: PRICE com carência capitalizada preserva a prestação fixa do contrato inicial. */
  preservePriceInstallmentAfterCapitalizedGrace?: boolean;
  /** APC / balanço — contábil: curto CPC = 0, longo = saldo (parcela líquida reduz LP sem recondução ao curto no Domínio). Fiscal: curto/longos pela janela CPC nos próximos meses do mesmo ano. */
  cpcPresentationMode?: CpcPresentationMode;
  /**
   * Janela CPC (curto prazo): próximos N vencimentos — padrão 12 (CPC 03 / passivo circulante).
   * Modo fiscal: também limita parcelas no mesmo ano civil; dezembro provisiona até 12 do ano seguinte.
   */
  cpcRollingMonths?: number;
  /** `mensal`: Selic/CDI % a.m. (BCB 4390 / estimativa). `selic_mensal` / `cdi_mensal`: valores reais mês a mês. `selic_over_diaria`: série 11 acumulada entre vencimentos. */
  varIndexMode?: VarIndexMode;
  /** Histórico Selic Over (BCB 11) — obrigatório quando `varIndexMode === 'selic_over_diaria'`. */
  selicDailySeries?: SelicDailyPoint[];
  /** Selic Over: `periodOpening` = taxa do 1º DU (extrato BB); `daily` = cotações diárias. */
  selicOverAccrualMode?: SelicOverAccrualMode;
  /** Histórico mensal do índice Selic/CDI por mês no formato yyyy-MM → taxa (% a.m.). */
  monthlyRateMap?: Map<string, number> | null;
  /**
   * PRICE com indexador diário: `recalculo_pmt` recalcula a prestação a cada competência (auditoria);
   * `pmt_fixo` mantém a PMT da 1ª competência (risco de amortização negativa se a Selic subir).
   */
  priceSelicAdjustment?: 'recalculo_pmt' | 'pmt_fixo';
}

export interface LoanRow {
  month: number;
  date: Date;
  /** Dias corridos entre a competência anterior e a data da linha (base juros/custo). */
  accrualDays: number;
  /** Quantidade de dias do mês civil de referência (mês que contém o vencimento). */
  referenceMonthDays: number;
  /** Na amortização PRICE: dias corridos ÷ 30. Em SAC: fator aplicado aos juros (1, ÷30 ou mês civil). */
  die30Factor: number;
  /** Fator efetivo aplicado ao custo op. no período (d÷30 ou 12/365×dias). */
  opCostPeriodFactor: number;
  initialBalance: number;
  interest: number;
  amortization: number;
  monthlyCost: number;
  /** IOF na competência (valor na linha do contrato; demais linhas = 0). */
  iof: number;
  installment: number;
  finalBalance: number;
  /** Modo fiscal: soma CPC das parcelas líquidas nos próximos períodos configurados no mesmo ano. Modo contábil: 0 nesta vista. */
  shortTermBalance: number;
  /** Modo fiscal: saldo menos curto CPC. Modo contábil: igual ao saldo devedor (passivo LP até amortizar na parcela). */
  longTermBalance: number;
  /** Competências (campo `month`) que entram na soma da parcela líquida CPC (Curto prazo nesta linha). */
  cpcShortTermWindowMonths: number[];
  /** Rótulo legível das competências/datas incluídas na janela CPC (Curto prazo). */
  cpcShortTermWindowDescribe: string;
  isGrace: boolean;
  /** Fator Selic Over acumulado no período (1 = sem indexador diário). */
  selicAccumulatedFactor?: number;
  /** Dias úteis com cotação BCB no período. */
  selicBusinessDays?: number;
  /** Spread % efetivo no período (pro rata quando aplicável). */
  spreadPctInPeriod?: number;
  /** Selic % efetiva no período (fator acumulado − 1). */
  selicPctInPeriod?: number;
  /** Taxa efetiva total do período (spread + Selic ou composta legada). */
  effectivePctInPeriod?: number;
  /** PRICE: prestação recalculada nesta competência (Selic Over + recálculo). */
  pricePmtRecalculated?: boolean;
}

export function calculateCET(
  netValue: number,
  schedule: LoanRow[],
  options?: { iofPaidAtContract?: number }
): { monthly: number; yearly: number } {
  if (netValue <= 0 || schedule.length <= 1) return { monthly: 0, yearly: 0 };

  const iofPaid = Math.max(0, options?.iofPaidAtContract ?? 0);
  const maxMonth = Math.max(...schedule.map(s => s.month));
  const cashFlows: number[] = new Array(maxMonth + 1).fill(0);
  /** Líquido recebido no contrato (principal) menos IOF pago à vista, se houver. */
  cashFlows[0] = netValue - iofPaid;
  
  for (const row of schedule) {
    if (row.month > 0) {
      cashFlows[row.month] -= row.installment;
    }
  }
  
  let rate = 0.05;
  const MAX_ITER = 1000;
  const PRECISION = 1e-7;

  for (let i = 0; i < MAX_ITER; i++) {
    let npv = 0;
    let dNpv = 0;

    for (let t = 0; t < cashFlows.length; t++) {
      npv += cashFlows[t] / Math.pow(1 + rate, t);
      if (t > 0) {
        dNpv -= (t * cashFlows[t]) / Math.pow(1 + rate, t + 1);
      }
    }

    if (Math.abs(npv) < PRECISION) {
      break;
    }

    const newRate = rate - npv / dNpv;
    if (isNaN(newRate) || !isFinite(newRate)) {
        break;
    }
    rate = newRate;
  }
  
  const monthly = rate;
  const yearly = Math.pow(1 + monthly, 12) - 1;
  
  return {
    monthly: monthly * 100,
    yearly: yearly * 100
  };
}

/** @deprecated Use `adjustInstallmentDueDate` — mantido como alias para testes e imports legados. */
export function adjustToNextBusinessDay(date: Date): Date {
  return adjustInstallmentDueDateBr(date);
}

export function calculateLoan(params: LoanParams): LoanRow[] {
  const {
    principal,
    valorIof: valorIofParam,
    iofMode: iofModeParam,
    months,
    fixedRateMonth,
    fixedRateType,
    varRateMonth,
    gracePeriod,
    graceType,
    system,
    monthlyOperationCost,
    monthlyOpCostType,
    graceFixedRateMonth,
    graceFixedRateType,
    graceMonthlyOperationCost,
    graceMonthlyOpCostType,
    proRataDieMode,
    operationalCostDayBasis,
    graceInterestRoundingMode,
    graceInterestDecimalPlaces,
    contractDate,
    firstInstallmentDate,
    sacInterestAccrual,
    sacMoneyRounding,
    priceInterestAccrual,
    priceMoneyRounding,
    cpcRollingMonths,
    varIndexMode: varIndexModeParam,
    selicDailySeries,
    monthlyRateMap,
    priceSelicAdjustment,
    selicOverAccrualMode: selicOverAccrualModeParam,
  } = params;
  const varIndexMode: VarIndexMode = varIndexModeParam ?? 'mensal';
  const selicOverAccrualMode: SelicOverAccrualMode =
    selicOverAccrualModeParam ?? 'daily';
  const selicByDate =
    varIndexMode === 'selic_over_diaria' && selicDailySeries?.length
      ? selicPointsToMap(selicDailySeries)
      : null;
  const priceSelicAdj = priceSelicAdjustment ?? 'recalculo_pmt';
  const preserveInstallmentAfterCapitalizedGrace =
    params.preserveInstallmentAfterCapitalizedGrace ?? params.preservePriceInstallmentAfterCapitalizedGrace ?? false;
  const useSelicOver = varIndexMode === 'selic_over_diaria' && selicByDate != null;

  const sacAccrual: SacInterestAccrual = sacInterestAccrual ?? 'mensalContrato';
  const priceAccrual: SacInterestAccrual = priceInterestAccrual ?? 'mensalContrato';
  const sacMoneyMode: SacMoneyRoundingMode = sacMoneyRounding ?? 'halfAwayFromZero';
  const priceMoneyMode: SacMoneyRoundingMode = priceMoneyRounding ?? sacMoneyMode;
  const rnd = (x: number) => applySacMoneyRound(x, sacMoneyMode);
  const rndPrice = (x: number) => applySacMoneyRound(x, priceMoneyMode);

  const attachRateMemory = (
    row: LoanRow,
    mem: PeriodRateMemory,
    priceRecalc?: boolean,
    balanceForDisplay?: number,
    interestForDisplay?: number
  ) => {
    row.selicAccumulatedFactor = mem.selicAccumulatedFactor;
    row.selicBusinessDays = mem.selicBusinessDays;
    row.spreadPctInPeriod = mem.spreadPctInPeriod;
    row.selicPctInPeriod = mem.selicPctInPeriod;
    row.effectivePctInPeriod = mem.effectivePctInPeriod;
    if (priceRecalc) row.pricePmtRecalculated = true;
    if (balanceForDisplay != null && interestForDisplay != null) {
      const pct = effectivePctFromRoundedInterest(balanceForDisplay, interestForDisplay);
      if (pct != null) row.effectivePctInPeriod = pct;
    }
  };

  const accrualDaysForDisplay = (calDays: number, mem: PeriodRateMemory | null): number => {
    if (useSelicOver && mem && mem.selicBusinessDays > 0) return mem.selicBusinessDays;
    return calDays;
  };
  const rawRollMonths = cpcRollingMonths;
  const rollingCpc = Math.max(
    1,
    Math.min(
      120,
      Math.floor(
        typeof rawRollMonths === 'number' && Number.isFinite(rawRollMonths) && rawRollMonths > 0
          ? rawRollMonths
          : 12
      )
    )
  );
  const schedule: LoanRow[] = [];

  const effectiveFixedRate = fixedRateType === 'value' ? (fixedRateMonth / principal) * 100 : fixedRateMonth;
  const graceEffFixedRaw =
    graceFixedRateType === 'value'
      ? principal > 0
        ? (graceFixedRateMonth / principal) * 100
        : 0
      : Number.isFinite(graceFixedRateMonth)
        ? graceFixedRateMonth
        : 0;
  /** Se a taxa da carência não foi informada, usa a taxa pós-carência. */
  const graceEffFixed =
    graceEffFixedRaw > 0 || graceFixedRateType === 'value'
      ? graceEffFixedRaw
      : effectiveFixedRate;

  const buildPeriodRate = (
    spreadMonthPct: number,
    accrualStart: Date,
    accrualEnd: Date,
    temporalFactor: number
  ): PeriodRateMemory =>
    resolvePeriodRateMemory({
      spreadMonthPct,
      varRateMonthPct: varRateMonth,
      varIndexMode,
      temporalFactor,
      proRataDieMode,
      selicByDate,
      monthlyRateMap: monthlyRateMap ?? null,
      accrualStart,
      accrualEnd,
      selicOverAccrualMode,
    });

  /** Legado: taxa mensal composta fixa + variável (quando não há Selic Over diária). */
  const iLegacyMonthly =
    varIndexMode === 'none'
      ? effectiveFixedRate / 100
      : (1 + effectiveFixedRate / 100) * (1 + varRateMonth / 100) - 1;

  const iofMode: IofTreatmentMode = iofModeParam ?? 'financed';
  const valorIof = Math.max(0, valorIofParam ?? 0);
  const iofNoSaldo = iofMode === 'financed' ? valorIof : 0;
  const saldoAposContrato = principal + iofNoSaldo;
  let currentBalance = saldoAposContrato;
  let accrualStartDate = contractDate;

  schedule.push({
    month: 0,
    date: contractDate,
    accrualDays: 0,
    referenceMonthDays: 0,
    die30Factor: 0,
    opCostPeriodFactor: 0,
    initialBalance: principal,
    interest: 0,
    amortization: 0,
    monthlyCost: 0,
    iof: valorIof,
    installment: 0,
    finalBalance: saldoAposContrato,
    shortTermBalance: 0,
    longTermBalance: 0,
    cpcShortTermWindowMonths: [],
    cpcShortTermWindowDescribe: '—',
    isGrace: false
  });
  
  // Processar o período de carência (competências após o mês do contrato — ver `computeFirstInstallmentDate`)
  for (let m = 1; m <= gracePeriod; m++) {
    const targetDate = addMonths(contractDate, m);
    const rowDate = adjustInstallmentDueDateBr(targetDate);
    const accrualEndDate = resolveAccrualEndDate(accrualStartDate, rowDate);
    const daysInPeriod = differenceInCalendarDays(accrualEndDate, accrualStartDate);
    const cal = calendarAccrualMetrics(accrualStartDate, accrualEndDate);
    /** SD de abertura em centavos (extrato BB) antes de juros na carência. */
    let initialBalanceForThisMonth = rnd(currentBalance);

    let interest = 0;
    let monthlyCost = 0;
    let installment = 0;
    let gracePeriodRate: PeriodRateMemory | null = null;

    if (daysInPeriod > 0) {
      const die30 = proRataDie30Factor(accrualStartDate, accrualEndDate);
      const opCostF = operationalCostDayFactor(accrualStartDate, accrualEndDate, operationalCostDayBasis);
      /**
       * Carência: juros mensais sobre saldo (competência cheia), padrão bancário BR.
       * Capitalizado: soma juros+custo ao saldo; pago: parcela = juros+custo, saldo inalterado.
       * O mês civil do contrato não gera juros — accrual só a partir do 1º dia do mês seguinte.
       */
      const graceTf = sacInterestTemporalFactor(
        system === 'SAC' ? sacAccrual : priceAccrual,
        accrualStartDate,
        accrualEndDate
      );
      gracePeriodRate = buildPeriodRate(graceEffFixed, accrualStartDate, accrualEndDate, graceTf);
      const interestRaw = interestFromPeriodRate(
        initialBalanceForThisMonth,
        gracePeriodRate,
        proRataDieMode,
        varIndexMode
      );
      interest =
        graceInterestRoundingMode === 'none' ? interestRaw : rnd(interestRaw);
      monthlyCost = operationalCostForPeriod(
        initialBalanceForThisMonth,
        graceMonthlyOpCostType,
        graceMonthlyOperationCost,
        accrualStartDate,
        accrualEndDate,
        proRataDieMode,
        operationalCostDayBasis
      );

      if (graceType === 'paid') {
        installment = rnd(interest + rnd(monthlyCost));
      } else if (graceType === 'capitalized') {
        /** Saldo capitalizado com juros já arredondados (extrato BB). */
        currentBalance = rnd(initialBalanceForThisMonth + interest + rnd(monthlyCost));
        installment = 0;
      }

      accrualStartDate = accrualEndDate;
    }

    const die30 = proRataDie30Factor(accrualStartDate, accrualEndDate);
    const opCostF = operationalCostDayFactor(accrualStartDate, accrualEndDate, operationalCostDayBasis);

    const graceRow: LoanRow = {
      month: m,
      date: rowDate,
      accrualDays: accrualDaysForDisplay(cal.days, gracePeriodRate),
      referenceMonthDays: cal.refMonthDays,
      die30Factor: die30,
      opCostPeriodFactor: opCostF,
      initialBalance: initialBalanceForThisMonth,
      interest,
      amortization: 0,
      monthlyCost,
      iof: 0,
      installment,
      finalBalance: currentBalance,
      shortTermBalance: 0,
      longTermBalance: 0,
      cpcShortTermWindowMonths: [],
      cpcShortTermWindowDescribe: '—',
      isGrace: true,
    };
    if (gracePeriodRate) {
      attachRateMemory(
        graceRow,
        gracePeriodRate,
        undefined,
        initialBalanceForThisMonth,
        interest
      );
    }
    schedule.push(graceRow);
  }
  
  // O saldo que será amortizado após a carência
  const financedAmount = currentBalance;

  /**
   * SAC alinhado a planilhas bancárias de referência no Brasil:
   * - amortização constante nas primeiras n−1 parcelas = round(P÷n centavos);
   * - última parcela: amortização = saldo devedor de abertura (resíduo de arredondamento);
   * - juros e custos do período tratados conforme modo de arredondamento configurável.
   */
  const sacAmortizationBase = params.sacAmortizationBase ?? 'incorporated';
  const sacBaseAmount =
    sacAmortizationBase === 'contractPrincipal' && principal > 0
      ? principal
      : financedAmount;
  const amortSacRounded = months > 0 ? rnd(sacBaseAmount / months) : 0;

  const priceRecalcEachMonth = system === 'PRICE' && useSelicOver && priceSelicAdj === 'recalculo_pmt';
  let priceFixedInstallment = 0;
  if (system === 'PRICE' && !priceRecalcEachMonth) {
    const firstRowDate = adjustInstallmentDueDateBr(firstInstallmentDate);
    const firstEnd = resolveAccrualEndDate(accrualStartDate, firstRowDate);
    const firstTf = sacInterestTemporalFactor(priceAccrual, accrualStartDate, firstEnd);
    const firstRate = buildPeriodRate(effectiveFixedRate, accrualStartDate, firstEnd, firstTf);
    const iFirst = useSelicOver ? firstRate.rateDecimal : iLegacyMonthly;
    const priceBaseAmount = preserveInstallmentAfterCapitalizedGrace && graceType === 'capitalized' ? saldoAposContrato : financedAmount;
    priceFixedInstallment = solvePriceFixedInstallment(
      priceBaseAmount,
      months,
      iFirst,
      monthlyOpCostType,
      monthlyOperationCost,
      firstRowDate,
      accrualStartDate,
      proRataDieMode,
      operationalCostDayBasis,
      priceAccrual,
      rndPrice
    );
  }

  // Processar o período de amortização real
  for (let m = 1; m <= months; m++) {
    const targetDate = addMonths(firstInstallmentDate, m - 1);
    const rowDate = adjustInstallmentDueDateBr(targetDate);
    const accrualEndDate = resolveAccrualEndDate(accrualStartDate, rowDate);
    const cal = calendarAccrualMetrics(accrualStartDate, accrualEndDate);
    const initialBalance = currentBalance;

    /** Saldo de abertura com arredondamento do sistema (SAC ou PRICE). */
    const sdOpeningSac = system === 'SAC' ? rnd(initialBalance) : initialBalance;
    const sdOpeningPrice = system === 'PRICE' ? rndPrice(initialBalance) : initialBalance;

    const jurosTemporalFactor =
      system === 'SAC'
        ? sacInterestTemporalFactor(sacAccrual, accrualStartDate, accrualEndDate)
        : sacInterestTemporalFactor(priceAccrual, accrualStartDate, accrualEndDate);

    const opCostF = operationalCostDayFactor(accrualStartDate, accrualEndDate, operationalCostDayBasis);
    const periodRate = buildPeriodRate(effectiveFixedRate, accrualStartDate, accrualEndDate, jurosTemporalFactor);
    const interestRawAmort = interestFromPeriodRate(
      system === 'SAC' ? sdOpeningSac : sdOpeningPrice,
      periodRate,
      proRataDieMode,
      varIndexMode
    );
    const interest =
      system === 'SAC' ? rnd(interestRawAmort) : rndPrice(interestRawAmort);

    if (system === 'PRICE' && priceRecalcEachMonth) {
      const remaining = months - m + 1;
      priceFixedInstallment = rndPrice(
        priceAnnuityPayment(sdOpeningPrice, remaining, periodRate.rateDecimal)
      );
    }
    const monthlyCostRaw = operationalCostForPeriod(
      system === 'SAC' ? sdOpeningSac : sdOpeningPrice,
      monthlyOpCostType,
      monthlyOperationCost,
      accrualStartDate,
      accrualEndDate,
      proRataDieMode,
      operationalCostDayBasis
    );
    const monthlyCost = system === 'SAC' ? rnd(monthlyCostRaw) : rndPrice(monthlyCostRaw);
    let amortization: number;
    let installment: number;

    if (system === 'SAC') {
      /**
       * SAC bancário: A fixa (P÷n arredondado); J = SD×i; P = A+J (+ custo).
       * Última parcela: amortização = saldo de abertura (ajuste de centavos).
       */
      if (m === months) {
        amortization = rnd(sdOpeningSac);
      } else {
        const cap = Math.max(0, rnd(sdOpeningSac));
        amortization = Math.min(amortSacRounded, cap);
      }
      installment = rnd(amortization + interest + monthlyCost);
    } else {
      /**
       * PRICE: prestação K fixa (Tabela Price); J = SD×i; A = K−J−custo — cada termo arredondado antes do próximo saldo.
       */
      if (m === months) {
        amortization = rndPrice(sdOpeningPrice);
        installment = rndPrice(amortization + interest + monthlyCost);
      } else {
        installment = rndPrice(priceFixedInstallment);
        amortization = rndPrice(Math.max(0, Math.min(sdOpeningPrice, installment - interest - monthlyCost)));
      }
      currentBalance = rndPrice(sdOpeningPrice - amortization);
    }

    if (system === 'SAC') {
      currentBalance = rnd(sdOpeningSac - amortization);
    }

    accrualStartDate = accrualEndDate;

    const amortRow: LoanRow = {
      month: gracePeriod + m,
      date: rowDate,
      accrualDays: accrualDaysForDisplay(cal.days, periodRate),
      referenceMonthDays: cal.refMonthDays,
      die30Factor: jurosTemporalFactor,
      opCostPeriodFactor: opCostF,
      initialBalance: system === 'SAC' ? sdOpeningSac : sdOpeningPrice,
      interest,
      amortization,
      monthlyCost,
      iof: 0,
      installment,
      finalBalance: Math.max(0, currentBalance),
      shortTermBalance: 0,
      longTermBalance: 0,
      cpcShortTermWindowMonths: [],
      cpcShortTermWindowDescribe: '—',
      isGrace: false,
    };
    attachRateMemory(
      amortRow,
      periodRate,
      priceRecalcEachMonth,
      system === 'SAC' ? sdOpeningSac : sdOpeningPrice,
      interest
    );
    schedule.push(amortRow);
  }
  
  /**
   * Modo fiscal:
   *  - Antes do 1º 31/12: 100% longo prazo (não provisiona curto no mesmo ano de pagamento).
   *  - Jan–Nov: longo **congelado** desde o 31/12 anterior; curto = saldo devedor − longo (cai a cada parcela).
   *  - 31/12: única reclassificação do ano — provisiona curto para parcelas do **ano seguinte** (até 12)
   *    ou só o restante se o empréstimo encerrar; redefine o longo congelado do próximo ano.
   */
  const cpcMode = params.cpcPresentationMode ?? 'fiscal';
  const longoInicioAnoCivil = cpcMode === 'fiscal' ? buildLongoInicioAnoCivil(schedule) : new Map();

  const idxUltimaCarencia =
    gracePeriod > 0 ? schedule.findIndex((r) => r.isGrace && r.month === gracePeriod) : -1;
  let longoCongeladoCarencia: number | undefined;
  if (cpcMode === 'fiscal' && idxUltimaCarencia >= 0) {
    longoCongeladoCarencia = calcCurtoProvisionadoUltimaCarencia(
      schedule,
      idxUltimaCarencia,
      Math.max(0, schedule[idxUltimaCarencia]!.finalBalance),
    ).longo;
  }

  let idxPrimeiroFechamento31DezPosCarencia = -1;
  if (idxUltimaCarencia >= 0) {
    for (let j = idxUltimaCarencia + 1; j < schedule.length; j++) {
      const y = schedule[j]!.date.getFullYear();
      if (j === indiceLinhaDezembroNoAno(schedule, y)) {
        idxPrimeiroFechamento31DezPosCarencia = j;
        break;
      }
    }
  }

  for (let i = 0; i < schedule.length; i++) {
    if (cpcMode === 'fiscal' && schedule[i].isGrace) {
      /**
       * Carência: reclassificação LP→CP **somente no último mês** da carência.
       * Demais meses de carência ficam 100% longo prazo.
       */
      if (schedule[i].month < gracePeriod) {
        schedule[i].shortTermBalance = 0;
        schedule[i].longTermBalance = Math.max(0, schedule[i].finalBalance);
        schedule[i].cpcShortTermWindowMonths = [];
        schedule[i].cpcShortTermWindowDescribe =
          'Carência: curto prazo só no último mês da carência';
        continue;
      }

      if (schedule[i].month === gracePeriod) {
        const windowRows: LoanRow[] = [];
        for (let k = i + 1; k < schedule.length && windowRows.length < 12; k++) {
          windowRows.push(schedule[k]!);
        }
        const { curto, longo } = calcCurtoProvisionadoUltimaCarencia(
          schedule,
          i,
          Math.max(0, schedule[i].finalBalance),
        );
        longoCongeladoCarencia = longo;
        schedule[i].shortTermBalance = curto;
        schedule[i].longTermBalance = longo;
        schedule[i].cpcShortTermWindowMonths = windowRows.map((w) => w.month);
        schedule[i].cpcShortTermWindowDescribe =
          windowRows.length > 0
            ? `Última carência → provisão (${windowRows.length} parcela(s), até 12): ` +
              windowRows.map((w) => `M${w.month}\u00A0-\u00A0${format(w.date, 'MM/yyyy')}`).join('; ')
            : 'Última carência: curto provisionado';
        continue;
      }
    }

    const remainingPeriods = schedule.length - 1 - i;
    if (remainingPeriods <= 12 && cpcMode !== 'fiscal') {
      schedule[i].shortTermBalance = schedule[i].finalBalance;
      schedule[i].longTermBalance = 0;
      schedule[i].cpcShortTermWindowMonths = [];
      schedule[i].cpcShortTermWindowDescribe = 'Restam ≤ 12 períodos: 100% Curto Prazo';
      continue;
    }

    if (cpcMode === 'fiscal') {
      const refDate = schedule[i].date;
      const refYear = refDate.getFullYear();
      const isFechamento31Dez = i === indiceLinhaDezembroNoAno(schedule, refYear);

      if (isFechamento31Dez) {
        const { curto, longo } = calcCurtoProvisionadoDezembro(
          schedule,
          refYear,
          Math.max(0, schedule[i].finalBalance),
        );
        const nextYear = refYear + 1;
        const windowRows: LoanRow[] = [];
        for (let k = i + 1; k < schedule.length && windowRows.length < 12; k++) {
          const cand = schedule[k];
          if (cand.date.getFullYear() < nextYear) continue;
          if (cand.date.getFullYear() > nextYear) break;
          windowRows.push(cand);
        }
        const describePrefix =
          windowRows.length > 0
            ? `Fechamento 31/12/${refYear} → provisão ano ${nextYear} (${windowRows.length} parcela(s), até 12): `
            : `Fechamento 31/12/${refYear} (empréstimo encerra no ano): `;

        schedule[i].shortTermBalance = curto;
        schedule[i].longTermBalance = longo;
        schedule[i].cpcShortTermWindowMonths = windowRows.map((w) => w.month);
        schedule[i].cpcShortTermWindowDescribe =
          curto > 0
            ? describePrefix +
              windowRows.map((w) => `M${w.month}\u00A0-\u00A0${format(w.date, 'MM/yyyy')}`).join('; ')
            : `Fechamento 31/12/${refYear}: curto ${curto.toFixed(2)} · longo congelado ${longo.toFixed(2)} a partir de ${nextYear}`;
      } else {
        const posCarenciaComLongoCongelado =
          longoCongeladoCarencia !== undefined &&
          idxUltimaCarencia >= 0 &&
          i > idxUltimaCarencia &&
          (idxPrimeiroFechamento31DezPosCarencia < 0 ||
            i < idxPrimeiroFechamento31DezPosCarencia);

        if (posCarenciaComLongoCongelado) {
          const longoCongelado = longoCongeladoCarencia as number;
          const curto = Math.max(0, schedule[i].finalBalance - longoCongelado);
          schedule[i].longTermBalance = Math.max(0, schedule[i].finalBalance - curto);
          schedule[i].shortTermBalance = curto;
          schedule[i].cpcShortTermWindowMonths = [];
          schedule[i].cpcShortTermWindowDescribe =
            'Pós-carência: longo congelado (última carência); curto = saldo − longo';
        } else {
        const longoFixo = longoInicioAnoCivil.get(refYear);
        if (longoFixo !== undefined) {
          const curto = Math.max(0, schedule[i].finalBalance - longoFixo);
          schedule[i].longTermBalance = Math.max(0, schedule[i].finalBalance - curto);
          schedule[i].shortTermBalance = curto;
          schedule[i].cpcShortTermWindowMonths = [];
          schedule[i].cpcShortTermWindowDescribe = `Ano ${refYear}: longo congelado (31/12/${refYear - 1}); curto = saldo − longo`;
        } else {
          schedule[i].shortTermBalance = 0;
          schedule[i].longTermBalance = Math.max(0, schedule[i].finalBalance);
          schedule[i].cpcShortTermWindowMonths = [];
          schedule[i].cpcShortTermWindowDescribe = `Antes do 1º fechamento 31/12: 100% longo prazo`;
        }
        }
      }
    } else {
      /**
       * Modo gerencial: rolling de **12 meses sempre adiante** — o curto prazo de cada linha
       * é a soma das parcelas líquidas dos próximos até 12 vencimentos após a linha,
       * independentemente do ano civil. Mês a mês a janela avança 1 (uma sai pelo pagamento,
       * outra entra pelo fim — atualização contínua do LP→CP).
       */
      const windowRows: LoanRow[] = [];
      let shortTermFromInstallments = 0;
      for (let k = i + 1; k < schedule.length && windowRows.length < rollingCpc; k++) {
        windowRows.push(schedule[k]);
        shortTermFromInstallments += Math.max(0, schedule[k].installment);
      }
      schedule[i].shortTermBalance = Math.min(
        Math.max(0, shortTermFromInstallments),
        Math.max(0, schedule[i].finalBalance)
      );
      schedule[i].longTermBalance = Math.max(
        0,
        schedule[i].finalBalance - schedule[i].shortTermBalance
      );
      schedule[i].cpcShortTermWindowMonths = windowRows.map((w) => w.month);
      schedule[i].cpcShortTermWindowDescribe =
        windowRows.length === 0
          ? 'Gerencial: última parcela — sem reclasse LP→CP pendente'
          : `Gerencial · próximos ${windowRows.length} vencimento(s) (LP→CP atualizado mês a mês): ` +
            windowRows.map((w) => `M${w.month}\u00A0-\u00A0${format(w.date, 'MM/yyyy')}`).join('; ');
    }
  }

  /**
   * IOF: não entra na coluna Curto do cronograma (linha do contrato inclusive).
   * O IOF credita o passivo via lançamento Domínio próprio (IOF DO EMPRESTIMO) e já
   * reclassifica o curto prazo contábil; aqui o Curto = só parcelas líquidas da janela CPC.
   * O saldo devedor (final) continua principal + IOF para juros/amortização.
   */
  return schedule;
}

export type LoanParamsWithoutPrincipal = Omit<LoanParams, 'principal'>;

/** Parcela (PMT) do primeiro mês da fase de amortização (após a carência). */
export function installmentFirstAmortizationMonth(params: LoanParams): number {
  const schedule = calculateLoan(params);
  const m = params.gracePeriod + 1;
  const row = schedule.find((r) => r.month === m);
  return row ? row.installment : 0;
}

/**
 * Dado o restante dos parâmetros, encontra o principal financiado para que a parcela
 * do primeiro mês de amortização coincida (aprox.) com `targetInstallment`.
 */
export function solvePrincipalForTargetFirstInstallment(
  base: LoanParamsWithoutPrincipal,
  targetInstallment: number
): number {
  if (!Number.isFinite(targetInstallment) || targetInstallment <= 0 || base.months <= 0) return 0;

  const f = (principal: number) => {
    const p = Math.max(principal, 1e-6);
    return installmentFirstAmortizationMonth({ ...base, principal: p });
  };

  let lo = 1e-6;
  if (f(lo) >= targetInstallment) return 0;

  let hi = Math.max(targetInstallment * 4, 100);
  let guard = 0;
  while (f(hi) < targetInstallment && hi < 1e14 && guard++ < 70) {
    hi *= 2;
  }
  if (f(hi) < targetInstallment) return hi;

  for (let i = 0; i < 85; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm - targetInstallment) < 0.01) return mid;
    if (fm < targetInstallment) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
