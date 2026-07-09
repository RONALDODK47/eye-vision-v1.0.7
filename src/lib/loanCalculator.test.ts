import { describe, expect, it } from 'vitest';
import { adjustInstallmentDueDate, adjustToNextBusinessDay, calculateLoan } from './loanCalculator';
import { parseISO } from 'date-fns';

describe('adjustInstallmentDueDate — vencimento BB', () => {
  it('posterga sábado 10/06/2023 para segunda 12/06/2023 (sem dia extra)', () => {
    const due = parseISO('2023-06-10');
    expect(adjustInstallmentDueDate(due).toISOString().slice(0, 10)).toBe('2023-06-12');
    expect(adjustToNextBusinessDay(due).toISOString().slice(0, 10)).toBe('2023-06-12');
  });

  it('posterga domingo 10/09/2023 para segunda 11/09/2023', () => {
    const due = parseISO('2023-09-10');
    expect(adjustInstallmentDueDate(due).toISOString().slice(0, 10)).toBe('2023-09-11');
  });

  it('mantém dia útil inalterado', () => {
    const due = parseISO('2023-06-12');
    expect(adjustInstallmentDueDate(due).toISOString().slice(0, 10)).toBe('2023-06-12');
  });

  it('posterga 10/02/2024 (sábado + Carnaval) para 14/02/2024', () => {
    const due = parseISO('2024-02-10');
    expect(adjustInstallmentDueDate(due).toISOString().slice(0, 10)).toBe('2024-02-14');
  });

  it('31/01/2027 (domingo) antecipa para 29/01/2027 — não pula janeiro', () => {
    const due = parseISO('2027-01-31');
    expect(adjustInstallmentDueDate(due).toISOString().slice(0, 10)).toBe('2027-01-29');
  });
});

describe('Loan Calculator — Custom Indexer', () => {
  it('should compound spread and manual indexer in PRICE mode', () => {
    const params = {
      principal: 1000.0,
      months: 2,
      fixedRateMonth: 1.0, // 1%
      fixedRateType: 'percent' as const,
      varRateMonth: 0.5, // 0.5% (custom indexer)
      varIndexMode: 'mensal' as const,
      proRataDieMode: 'linear' as const,
      system: 'PRICE' as const,
      gracePeriod: 0,
      graceType: 'paid' as const,
      monthlyOperationCost: 0,
      monthlyOpCostType: 'percent' as const,
      graceFixedRateMonth: 1.0,
      graceFixedRateType: 'percent' as const,
      graceMonthlyOperationCost: 0,
      graceMonthlyOpCostType: 'percent' as const,
      operationalCostDayBasis: 'commercial30' as const,
      graceInterestRoundingMode: 'none' as const,
      graceInterestDecimalPlaces: 2,
      contractDate: parseISO('2026-06-02'),
      firstInstallmentDate: parseISO('2026-07-02'),
      priceInterestAccrual: 'mensalContrato' as const,
      priceMoneyRounding: 'halfAwayFromZero' as const,
    };

    const result = calculateLoan(params);
    
    // We expect the contract setup row (month 0) and 2 installment rows
    expect(result.length).toBe(3);
    
    // Month 0 setup
    expect(result[0].month).toBe(0);
    expect(result[0].finalBalance).toBe(1000.0);
    
    // Month 1
    // Effective Rate = (1 + 0.01) * (1 + 0.005) - 1 = 1.505%
    // Interest = 1000.0 * 0.01505 = 15.05
    // PMT = 511.32
    // Amortization = 511.32 - 15.05 = 496.27
    // Final balance = 1000.0 - 496.27 = 503.73
    expect(result[1].month).toBe(1);
    expect(result[1].initialBalance).toBe(1000.0);
    expect(result[1].interest).toBe(15.05);
    expect(result[1].amortization).toBe(496.27);
    expect(result[1].installment).toBe(511.32);
    expect(result[1].finalBalance).toBe(503.73);
    
    // Month 2 (absorbs residual rounding)
    // Interest = 503.73 * 0.01505 = 7.581... -> 7.58
    // Amortization = 503.73
    // Installment = 503.73 + 7.58 = 511.31
    // Final balance = 0.00
    expect(result[2].month).toBe(2);
    expect(result[2].initialBalance).toBe(503.73);
    expect(result[2].interest).toBe(7.58);
    expect(result[2].amortization).toBe(503.73);
    expect(result[2].installment).toBe(511.31);
    expect(result[2].finalBalance).toBe(0.0);
  });

  it('should compound spread and manual indexer in SAC mode', () => {
    const params = {
      principal: 1000.0,
      months: 2,
      fixedRateMonth: 1.0, // 1%
      fixedRateType: 'percent' as const,
      varRateMonth: 0.5, // 0.5% (custom indexer)
      varIndexMode: 'mensal' as const,
      proRataDieMode: 'linear' as const,
      system: 'SAC' as const,
      gracePeriod: 0,
      graceType: 'paid' as const,
      monthlyOperationCost: 0,
      monthlyOpCostType: 'percent' as const,
      graceFixedRateMonth: 1.0,
      graceFixedRateType: 'percent' as const,
      graceMonthlyOperationCost: 0,
      graceMonthlyOpCostType: 'percent' as const,
      operationalCostDayBasis: 'commercial30' as const,
      graceInterestRoundingMode: 'none' as const,
      graceInterestDecimalPlaces: 2,
      contractDate: parseISO('2026-06-02'),
      firstInstallmentDate: parseISO('2026-07-02'),
      sacInterestAccrual: 'mensalContrato' as const,
      sacMoneyRounding: 'halfAwayFromZero' as const,
    };

    const result = calculateLoan(params);
    expect(result.length).toBe(3);
    
    // Month 1
    // Amortization = 1000.0 / 2 = 500.00
    // Interest = 1000.0 * 0.01505 = 15.05
    // Installment = 500.00 + 15.05 = 515.05
    // Final balance = 500.00
    expect(result[1].month).toBe(1);
    expect(result[1].initialBalance).toBe(1000.0);
    expect(result[1].interest).toBe(15.05);
    expect(result[1].amortization).toBe(500.00);
    expect(result[1].installment).toBe(515.05);
    expect(result[1].finalBalance).toBe(500.00);
    
    // Month 2
    // Interest = 500.0 * 0.01505 = 7.525 -> 7.53
    // Amortization = 500.00
    // Installment = 500.00 + 7.53 = 507.53
    // Final balance = 0.00
    expect(result[2].month).toBe(2);
    expect(result[2].initialBalance).toBe(500.00);
    expect(result[2].interest).toBe(7.53);
    expect(result[2].amortization).toBe(500.00);
    expect(result[2].installment).toBe(507.53);
    expect(result[2].finalBalance).toBe(0.0);
  });

  it('should compound spread and historical monthly SELIC rate', () => {
    const monthlyRateMap = new Map<string, number>();
    monthlyRateMap.set('2026-07', 1.0); // 1% Selic in July 2026
    monthlyRateMap.set('2026-08', 0.8); // 0.8% Selic in August 2026

    const params = {
      principal: 1000.0,
      months: 2,
      fixedRateMonth: 0.5, // 0.5% spread
      fixedRateType: 'percent' as const,
      varRateMonth: 0,
      varIndexMode: 'selic_mensal' as const,
      proRataDieMode: 'linear' as const,
      system: 'SAC' as const,
      gracePeriod: 0,
      graceType: 'paid' as const,
      monthlyOperationCost: 0,
      monthlyOpCostType: 'percent' as const,
      graceFixedRateMonth: 0.5,
      graceFixedRateType: 'percent' as const,
      graceMonthlyOperationCost: 0,
      graceMonthlyOpCostType: 'percent' as const,
      operationalCostDayBasis: 'commercial30' as const,
      graceInterestRoundingMode: 'none' as const,
      graceInterestDecimalPlaces: 2,
      contractDate: parseISO('2026-06-02'),
      firstInstallmentDate: parseISO('2026-07-02'),
      sacInterestAccrual: 'mensalContrato' as const,
      sacMoneyRounding: 'halfAwayFromZero' as const,
      monthlyRateMap,
    };

    const result = calculateLoan(params);
    console.log("TEST RESULT ROWS:");
    result.forEach(r => {
      console.log(`Month: ${r.month}, Date: ${r.date.toISOString()}, Interest: ${r.interest}`);
      console.log(`  effectivePctInPeriod: ${r.effectivePctInPeriod}%, selicPctInPeriod: ${r.selicPctInPeriod}%`);
    });
    expect(result.length).toBe(3);

    // Month 1 (July 2026): Selic is 1%
    // Compounded Rate = (1 + 0.005) * (1 + 0.01) - 1 = 1.505%
    // Interest = 1000 * 0.01505 = 15.05
    // Amortization = 500
    // Installment = 515.05
    // Final balance = 500
    expect(result[1].month).toBe(1);
    expect(result[1].interest).toBe(15.05);
    expect(result[1].amortization).toBe(500.00);
    expect(result[1].installment).toBe(515.05);

    // Month 2 (August 2026): Selic is 0.8%
    // Compounded Rate = (1 + 0.005) * (1 + 0.008) - 1 = 1.304%
    // Interest = 500 * 0.01304 = 6.52
    // Amortization = 500
    // Installment = 506.52
    // Final balance = 0
    expect(result[2].month).toBe(2);
    expect(result[2].interest).toBe(6.52);
    expect(result[2].amortization).toBe(500.00);
    expect(result[2].installment).toBe(506.52);
  });

  it('should distinguish linear vs compound pro-rata for variable indexers in fractional periods', () => {
    const monthlyRateMap = new Map<string, number>();
    monthlyRateMap.set('2026-06', 1.0); // 1% Selic in June 2026

    const baseParams = {
      principal: 1000.0,
      months: 1,
      fixedRateMonth: 0.5, // 0.5% spread
      fixedRateType: 'percent' as const,
      varRateMonth: 0,
      varIndexMode: 'selic_mensal' as const,
      system: 'SAC' as const,
      gracePeriod: 0,
      graceType: 'paid' as const,
      monthlyOperationCost: 0,
      monthlyOpCostType: 'percent' as const,
      graceFixedRateMonth: 0.5,
      graceFixedRateType: 'percent' as const,
      graceMonthlyOperationCost: 0,
      graceMonthlyOpCostType: 'percent' as const,
      operationalCostDayBasis: 'commercial30' as const,
      graceInterestRoundingMode: 'none' as const,
      graceInterestDecimalPlaces: 2,
      contractDate: parseISO('2026-06-02'),
      // Shift first installment date by 15 days instead of 30 days
      firstInstallmentDate: parseISO('2026-06-17'), 
      sacInterestAccrual: 'proRataCorridos' as const,
      sacMoneyRounding: 'halfAwayFromZero' as const,
      monthlyRateMap,
    };

    // 1. Linear pro-rata die mode
    const linearResult = calculateLoan({
      ...baseParams,
      proRataDieMode: 'linear' as const,
    });
    // tf = 15 / 30 = 0.5
    // iMonthly = (1 + 0.005) * (1 + 0.01) - 1 = 1.505%
    // Linear Rate = 1.505% * 0.5 = 0.7525%
    // Interest = 1000 * 0.007525 = 7.525 -> rounded to 7.53
    expect(linearResult[1].interest).toBe(7.53);

    // 2. Compound pro-rata die mode
    const compoundResult = calculateLoan({
      ...baseParams,
      proRataDieMode: 'compound' as const,
    });
    // tf = 15 / 30 = 0.5
    // Compound Rate = (1 + 0.01505)^0.5 - 1 = 0.7497148%
    // Interest = 1000 * 0.007497148 = 7.497148 -> rounded to 7.50
    expect(compoundResult[1].interest).toBe(7.50);
  });
});

describe('carência e 1ª parcela', () => {
  it('última carência 10/01 e 1ª amortização 10/02 (meses distintos)', () => {
    const result = calculateLoan({
      principal: 100_000,
      months: 12,
      fixedRateMonth: 1,
      fixedRateType: 'percent' as const,
      varRateMonth: 0,
      varIndexMode: 'none' as const,
      proRataDieMode: 'linear' as const,
      system: 'SAC' as const,
      gracePeriod: 11,
      graceType: 'capitalized' as const,
      monthlyOperationCost: 0,
      monthlyOpCostType: 'percent' as const,
      graceFixedRateMonth: 1,
      graceFixedRateType: 'percent' as const,
      graceMonthlyOperationCost: 0,
      graceMonthlyOpCostType: 'percent' as const,
      operationalCostDayBasis: 'commercial30' as const,
      graceInterestRoundingMode: 'none' as const,
      graceInterestDecimalPlaces: 2,
      contractDate: parseISO('2023-02-10'),
      firstInstallmentDate: parseISO('2024-02-10'),
      sacInterestAccrual: 'mensalContrato' as const,
      sacMoneyRounding: 'halfAwayFromZero' as const,
    });
    const graceRows = result.filter((r) => r.isGrace);
    const firstAmort = result.find((r) => !r.isGrace && r.amortization > 0);
    expect(graceRows[graceRows.length - 1]?.date.toISOString().slice(0, 10)).toBe('2024-01-10');
    expect(firstAmort?.date.toISOString().slice(0, 10)).toBe('2024-02-14');
    expect(firstAmort?.date.getTime()).toBeGreaterThan(
      graceRows[graceRows.length - 1]!.date.getTime(),
    );
  });

  it('curto prazo na carência só no último mês (não no penúltimo)', () => {
    const result = calculateLoan({
      principal: 171_770.1,
      months: 60,
      fixedRateMonth: 1.381969,
      fixedRateType: 'percent' as const,
      varRateMonth: 0,
      varIndexMode: 'none' as const,
      proRataDieMode: 'linear' as const,
      system: 'SAC' as const,
      gracePeriod: 11,
      graceType: 'capitalized' as const,
      monthlyOperationCost: 0,
      monthlyOpCostType: 'percent' as const,
      graceFixedRateMonth: 1.381969,
      graceFixedRateType: 'percent' as const,
      graceMonthlyOperationCost: 0,
      graceMonthlyOpCostType: 'percent' as const,
      operationalCostDayBasis: 'commercial30' as const,
      graceInterestRoundingMode: 'none' as const,
      graceInterestDecimalPlaces: 2,
      contractDate: parseISO('2023-02-10'),
      firstInstallmentDate: parseISO('2024-02-10'),
      sacInterestAccrual: 'mensalContrato' as const,
      sacMoneyRounding: 'halfAwayFromZero' as const,
      cpcPresentationMode: 'fiscal',
    });
    const graceRows = result.filter((r) => r.isGrace);
    expect(graceRows.length).toBe(11);
    const midGrace = graceRows[graceRows.length - 3]!;
    const penultimateGrace = graceRows[graceRows.length - 2]!;
    const lastGrace = graceRows[graceRows.length - 1]!;
    expect(midGrace.shortTermBalance).toBe(0);
    expect(midGrace.longTermBalance).toBeCloseTo(midGrace.finalBalance, 2);
    expect(penultimateGrace.shortTermBalance).toBe(0);
    expect(penultimateGrace.longTermBalance).toBeCloseTo(penultimateGrace.finalBalance, 2);
    expect(lastGrace.shortTermBalance).toBeGreaterThan(0);
    expect(lastGrace.longTermBalance).toBeCloseTo(
      lastGrace.finalBalance - lastGrace.shortTermBalance,
      2,
    );

    const firstAmort = result.find((r) => !r.isGrace && r.amortization > 0);
    expect(firstAmort).toBeDefined();
    expect(firstAmort!.longTermBalance).toBeCloseTo(lastGrace.longTermBalance, 0);
  });

  it('carência: 01/12 sem curto; só última carência provisiona; 1ª parcela mantém longo congelado', () => {
    const result = calculateLoan({
      principal: 50_000,
      months: 36,
      fixedRateMonth: 0.85,
      fixedRateType: 'percent' as const,
      varRateMonth: 0,
      varIndexMode: 'none' as const,
      proRataDieMode: 'linear' as const,
      system: 'SAC' as const,
      gracePeriod: 10,
      graceType: 'capitalized' as const,
      monthlyOperationCost: 0,
      monthlyOpCostType: 'percent' as const,
      graceFixedRateMonth: 0.85,
      graceFixedRateType: 'percent' as const,
      graceMonthlyOperationCost: 0,
      graceMonthlyOpCostType: 'percent' as const,
      operationalCostDayBasis: 'commercial30' as const,
      graceInterestRoundingMode: 'halfAwayFromZero' as const,
      graceInterestDecimalPlaces: 2,
      contractDate: parseISO('2025-01-15'),
      firstInstallmentDate: parseISO('2025-03-15'),
      sacInterestAccrual: 'mensalContrato' as const,
      sacMoneyRounding: 'halfAwayFromZero' as const,
      cpcPresentationMode: 'fiscal',
    });

    const graceRows = result.filter((r) => r.isGrace);
    expect(graceRows.length).toBe(10);

    const dezInicio = graceRows.find(
      (r) => r.date.getFullYear() === 2025 && r.date.getMonth() === 11 && r.date.getDate() === 1,
    );
    const dezFim = graceRows.find(
      (r) => r.date.getFullYear() === 2025 && r.date.getMonth() === 11 && r.date.getDate() === 31,
    );
    const ultimaCarencia = graceRows[graceRows.length - 1]!;
    const penultimaCarencia = graceRows[graceRows.length - 2]!;

    if (dezInicio) {
      expect(dezInicio.shortTermBalance).toBe(0);
      expect(dezInicio.longTermBalance).toBeCloseTo(dezInicio.finalBalance, 2);
    }

    expect(penultimaCarencia.shortTermBalance).toBe(0);
    expect(ultimaCarencia.shortTermBalance).toBeGreaterThan(0);
    expect(ultimaCarencia.longTermBalance + ultimaCarencia.shortTermBalance).toBeCloseTo(
      ultimaCarencia.finalBalance,
      2,
    );

    if (dezFim) {
      expect(dezFim.shortTermBalance).toBe(0);
    }

    const firstAmort = result.find((r) => !r.isGrace && r.amortization > 0);
    expect(firstAmort).toBeDefined();
    expect(firstAmort!.longTermBalance).toBeCloseTo(ultimaCarencia.longTermBalance, 0);
  });

  it('cronograma não pula mês civil entre dez/2026 e fev/2027 (vencimento dia 31)', () => {
    const base = {
      fixedRateMonth: 1,
      fixedRateType: 'percent' as const,
      varRateMonth: 0,
      varIndexMode: 'none' as const,
      proRataDieMode: 'linear' as const,
      system: 'SAC' as const,
      gracePeriod: 0,
      graceType: 'capitalized' as const,
      monthlyOperationCost: 0,
      monthlyOpCostType: 'percent' as const,
      graceFixedRateMonth: 1,
      graceFixedRateType: 'percent' as const,
      graceMonthlyOperationCost: 0,
      graceMonthlyOpCostType: 'percent' as const,
      operationalCostDayBasis: 'commercial30' as const,
      graceInterestRoundingMode: 'none' as const,
      graceInterestDecimalPlaces: 2,
      sacInterestAccrual: 'mensalContrato' as const,
      sacMoneyRounding: 'halfAwayFromZero' as const,
      cpcPresentationMode: 'fiscal' as const,
    };
    const result = calculateLoan({
      ...base,
      principal: 80_000,
      months: 25,
      contractDate: parseISO('2025-01-31'),
      firstInstallmentDate: parseISO('2025-01-31'),
    });
    const jan2027 = result.find(
      (r) => r.month > 0 && r.date.getFullYear() === 2027 && r.date.getMonth() === 0,
    );
    expect(jan2027).toBeDefined();
    expect(jan2027!.date.toISOString().slice(0, 10)).toBe('2027-01-29');
  });

  it('dezembro na carência (modo fiscal) provisiona curto do ano seguinte para o TXT', () => {
    const result = calculateLoan({
      principal: 150_000,
      months: 37,
      fixedRateMonth: 0.5,
      fixedRateType: 'percent' as const,
      varRateMonth: 0,
      varIndexMode: 'none' as const,
      proRataDieMode: 'linear' as const,
      system: 'SAC' as const,
      gracePeriod: 11,
      graceType: 'capitalized' as const,
      monthlyOperationCost: 0,
      monthlyOpCostType: 'percent' as const,
      graceFixedRateMonth: 0.5,
      graceFixedRateType: 'percent' as const,
      graceMonthlyOperationCost: 0,
      graceMonthlyOpCostType: 'percent' as const,
      operationalCostDayBasis: 'commercial30' as const,
      graceInterestRoundingMode: 'halfAwayFromZero' as const,
      graceInterestDecimalPlaces: 2,
      contractDate: parseISO('2023-02-10'),
      firstInstallmentDate: parseISO('2024-02-14'),
      sacInterestAccrual: 'mensalContrato' as const,
      sacMoneyRounding: 'halfAwayFromZero' as const,
      sacAmortizationBase: 'contractPrincipal',
      cpcPresentationMode: 'fiscal',
    });
    const decGrace = result.find(
      (r) => r.isGrace && r.date.getFullYear() === 2023 && r.date.getMonth() === 11,
    );
    const lastGrace = result.filter((r) => r.isGrace).at(-1)!;
    expect(decGrace).toBeDefined();
    expect(decGrace!.shortTermBalance).toBe(0);
    expect(lastGrace.shortTermBalance).toBeGreaterThan(0);
    expect(lastGrace.longTermBalance).toBeCloseTo(
      lastGrace.finalBalance - lastGrace.shortTermBalance,
      2,
    );
  });

  it('empréstimo curto no mesmo ano civil (≤12 parcelas) mantém lógica fiscal CPC', () => {
    const result = calculateLoan({
      principal: 60_000,
      months: 6,
      fixedRateMonth: 1,
      fixedRateType: 'percent' as const,
      varRateMonth: 0,
      varIndexMode: 'none' as const,
      proRataDieMode: 'linear' as const,
      system: 'SAC' as const,
      gracePeriod: 0,
      graceType: 'capitalized' as const,
      monthlyOperationCost: 0,
      monthlyOpCostType: 'percent' as const,
      graceFixedRateMonth: 1,
      graceFixedRateType: 'percent' as const,
      graceMonthlyOperationCost: 0,
      graceMonthlyOpCostType: 'percent' as const,
      operationalCostDayBasis: 'commercial30' as const,
      graceInterestRoundingMode: 'none' as const,
      graceInterestDecimalPlaces: 2,
      contractDate: parseISO('2024-01-15'),
      firstInstallmentDate: parseISO('2024-02-15'),
      sacInterestAccrual: 'mensalContrato' as const,
      sacMoneyRounding: 'halfAwayFromZero' as const,
      cpcPresentationMode: 'fiscal',
    });
    const operational = result.filter((r) => r.month > 0);
    expect(operational.length).toBe(6);
    expect(operational.every((r) => r.date.getFullYear() === 2024)).toBe(true);

    const firstPay = operational[0]!;
    expect(firstPay.shortTermBalance).toBe(0);
    expect(firstPay.longTermBalance).toBeCloseTo(firstPay.finalBalance, 2);
    expect(
      operational.every(
        (r) => r.cpcShortTermWindowDescribe === 'Restam ≤ 12 períodos: 100% Curto Prazo',
      ),
    ).toBe(false);
  });

  it('modo fiscal: jan–nov mantém longo congelado (curto = saldo − longo)', () => {
    const result = calculateLoan({
      principal: 150_000,
      months: 48,
      fixedRateMonth: 0.5,
      fixedRateType: 'percent' as const,
      varRateMonth: 0,
      varIndexMode: 'none' as const,
      proRataDieMode: 'linear' as const,
      system: 'SAC' as const,
      gracePeriod: 11,
      graceType: 'capitalized' as const,
      monthlyOperationCost: 0,
      monthlyOpCostType: 'percent' as const,
      graceFixedRateMonth: 0.5,
      graceFixedRateType: 'percent' as const,
      graceMonthlyOperationCost: 0,
      graceMonthlyOpCostType: 'percent' as const,
      operationalCostDayBasis: 'commercial30' as const,
      graceInterestRoundingMode: 'halfAwayFromZero' as const,
      graceInterestDecimalPlaces: 2,
      contractDate: parseISO('2023-02-10'),
      firstInstallmentDate: parseISO('2024-02-14'),
      sacInterestAccrual: 'mensalContrato' as const,
      sacMoneyRounding: 'halfAwayFromZero' as const,
      sacAmortizationBase: 'contractPrincipal',
      cpcPresentationMode: 'fiscal',
    });

    const dec2024 = result.find(
      (r) => r.month > 0 && r.date.getFullYear() === 2024 && r.date.getMonth() === 11,
    );
    expect(dec2024).toBeDefined();

    const jan2025 = result.find(
      (r) => r.month > 0 && r.date.getFullYear() === 2025 && r.date.getMonth() === 0,
    );
    expect(jan2025).toBeDefined();
    expect(jan2025!.longTermBalance).toBeCloseTo(dec2024!.longTermBalance, 0);
    expect(jan2025!.shortTermBalance).toBeCloseTo(
      jan2025!.finalBalance - jan2025!.longTermBalance,
      2,
    );

    const rows2025 = result.filter(
      (r) => r.month > 0 && r.date.getFullYear() === 2025 && r.date.getMonth() !== 11,
    );
    const longo2025 = jan2025!.longTermBalance;
    for (const row of rows2025) {
      expect(row.longTermBalance + row.shortTermBalance).toBeCloseTo(row.finalBalance, 2);
      if (row.finalBalance >= longo2025) {
        expect(row.longTermBalance).toBeCloseTo(longo2025, 0);
      }
    }
  });
});
