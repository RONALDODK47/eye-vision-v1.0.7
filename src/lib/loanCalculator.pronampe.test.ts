import { describe, expect, it } from 'vitest';
import { calculateLoan } from './loanCalculator';
import type { SelicDailyPoint } from './selicOverIndex';
import { parseISO } from 'date-fns';

/**
 * Teste final: Empréstimo PRONAMPE — Banco do Brasil
 * Usa Selic Over diária (Série 11) + spread deduzido
 * 
 * Configuração correta para bater com o extrato:
 * - Indexador: SELIC Over diária (série 11)
 * - Spread: ~0.4047% a.m. (≈ 4,97% a.a.) — valor deduzido reverso
 *   OU: testar com spread convertido de 5% a.a.
 * - Pro rata: compound (spread composto com selic diariamente)
 */
describe('PRONAMPE — BB — Selic Over Diária', () => {
  // Série 11 BCB completa (10/02/2023 → 09/02/2024) — valores reais
  const rawSerie11: Array<{ date: string; rate: number }> = [
    // Feb 2023 (Selic 13.75%)
    { date: '2023-02-10', rate: 0.050788 },
    { date: '2023-02-13', rate: 0.050788 },
    { date: '2023-02-14', rate: 0.050788 },
    { date: '2023-02-15', rate: 0.050788 },
    { date: '2023-02-16', rate: 0.050788 },
    { date: '2023-02-17', rate: 0.050788 },
    { date: '2023-02-22', rate: 0.050788 },
    { date: '2023-02-23', rate: 0.050788 },
    { date: '2023-02-24', rate: 0.050788 },
    { date: '2023-02-27', rate: 0.050788 },
    { date: '2023-02-28', rate: 0.050788 },
    // Mar 2023
    { date: '2023-03-01', rate: 0.050788 },
    { date: '2023-03-02', rate: 0.050788 },
    { date: '2023-03-03', rate: 0.050788 },
    { date: '2023-03-06', rate: 0.050788 },
    { date: '2023-03-07', rate: 0.050788 },
    { date: '2023-03-08', rate: 0.050788 },
    { date: '2023-03-09', rate: 0.050788 },
    { date: '2023-03-10', rate: 0.050788 },
    { date: '2023-03-13', rate: 0.050788 },
    { date: '2023-03-14', rate: 0.050788 },
    { date: '2023-03-15', rate: 0.050788 },
    { date: '2023-03-16', rate: 0.050788 },
    { date: '2023-03-17', rate: 0.050788 },
    { date: '2023-03-20', rate: 0.050788 },
    { date: '2023-03-21', rate: 0.050788 },
    { date: '2023-03-22', rate: 0.050788 },
    { date: '2023-03-23', rate: 0.050788 },
    { date: '2023-03-24', rate: 0.050788 },
    { date: '2023-03-27', rate: 0.050788 },
    { date: '2023-03-28', rate: 0.050788 },
    { date: '2023-03-29', rate: 0.050788 },
    { date: '2023-03-30', rate: 0.050788 },
    { date: '2023-03-31', rate: 0.050788 },
    // Apr 2023
    { date: '2023-04-03', rate: 0.050788 },
    { date: '2023-04-04', rate: 0.050788 },
    { date: '2023-04-05', rate: 0.050788 },
    { date: '2023-04-06', rate: 0.050788 },
    { date: '2023-04-10', rate: 0.050788 },
    { date: '2023-04-11', rate: 0.050788 },
    { date: '2023-04-12', rate: 0.050788 },
    { date: '2023-04-13', rate: 0.050788 },
    { date: '2023-04-14', rate: 0.050788 },
    { date: '2023-04-17', rate: 0.050788 },
    { date: '2023-04-18', rate: 0.050788 },
    { date: '2023-04-19', rate: 0.050788 },
    { date: '2023-04-20', rate: 0.050788 },
    { date: '2023-04-24', rate: 0.050788 },
    { date: '2023-04-25', rate: 0.050788 },
    { date: '2023-04-26', rate: 0.050788 },
    { date: '2023-04-27', rate: 0.050788 },
    { date: '2023-04-28', rate: 0.050788 },
    // May 2023
    { date: '2023-05-02', rate: 0.050788 },
    { date: '2023-05-03', rate: 0.050788 },
    { date: '2023-05-04', rate: 0.050788 },
    { date: '2023-05-05', rate: 0.050788 },
    { date: '2023-05-08', rate: 0.050788 },
    { date: '2023-05-09', rate: 0.050788 },
    { date: '2023-05-10', rate: 0.050788 },
    { date: '2023-05-11', rate: 0.050788 },
    { date: '2023-05-12', rate: 0.050788 },
    { date: '2023-05-15', rate: 0.050788 },
    { date: '2023-05-16', rate: 0.050788 },
    { date: '2023-05-17', rate: 0.050788 },
    { date: '2023-05-18', rate: 0.050788 },
    { date: '2023-05-19', rate: 0.050788 },
    { date: '2023-05-22', rate: 0.050788 },
    { date: '2023-05-23', rate: 0.050788 },
    { date: '2023-05-24', rate: 0.050788 },
    { date: '2023-05-25', rate: 0.050788 },
    { date: '2023-05-26', rate: 0.050788 },
    { date: '2023-05-29', rate: 0.050788 },
    { date: '2023-05-30', rate: 0.050788 },
    { date: '2023-05-31', rate: 0.050788 },
    // Jun 2023
    { date: '2023-06-01', rate: 0.050788 },
    { date: '2023-06-02', rate: 0.050788 },
    { date: '2023-06-05', rate: 0.050788 },
    { date: '2023-06-06', rate: 0.050788 },
    { date: '2023-06-07', rate: 0.050788 },
    { date: '2023-06-09', rate: 0.050788 },
    { date: '2023-06-12', rate: 0.050788 },
    { date: '2023-06-13', rate: 0.050788 },
    { date: '2023-06-14', rate: 0.050788 },
    { date: '2023-06-15', rate: 0.050788 },
    { date: '2023-06-16', rate: 0.050788 },
    { date: '2023-06-19', rate: 0.050788 },
    { date: '2023-06-20', rate: 0.050788 },
    { date: '2023-06-21', rate: 0.050788 },
    { date: '2023-06-22', rate: 0.050788 },
    { date: '2023-06-23', rate: 0.050788 },
    { date: '2023-06-26', rate: 0.050788 },
    { date: '2023-06-27', rate: 0.050788 },
    { date: '2023-06-28', rate: 0.050788 },
    { date: '2023-06-29', rate: 0.050788 },
    { date: '2023-06-30', rate: 0.050788 },
    // Jul 2023
    { date: '2023-07-03', rate: 0.050788 },
    { date: '2023-07-04', rate: 0.050788 },
    { date: '2023-07-05', rate: 0.050788 },
    { date: '2023-07-06', rate: 0.050788 },
    { date: '2023-07-07', rate: 0.050788 },
    { date: '2023-07-10', rate: 0.050788 },
    { date: '2023-07-11', rate: 0.050788 },
    { date: '2023-07-12', rate: 0.050788 },
    { date: '2023-07-13', rate: 0.050788 },
    { date: '2023-07-14', rate: 0.050788 },
    { date: '2023-07-17', rate: 0.050788 },
    { date: '2023-07-18', rate: 0.050788 },
    { date: '2023-07-19', rate: 0.050788 },
    { date: '2023-07-20', rate: 0.050788 },
    { date: '2023-07-21', rate: 0.050788 },
    { date: '2023-07-24', rate: 0.050788 },
    { date: '2023-07-25', rate: 0.050788 },
    { date: '2023-07-26', rate: 0.050788 },
    { date: '2023-07-27', rate: 0.050788 },
    { date: '2023-07-28', rate: 0.050788 },
    { date: '2023-07-31', rate: 0.050788 },
    // Aug 2023 (Selic 13.25% from 03/08)
    { date: '2023-08-01', rate: 0.050788 },
    { date: '2023-08-02', rate: 0.050788 },
    { date: '2023-08-03', rate: 0.049037 },
    { date: '2023-08-04', rate: 0.049037 },
    { date: '2023-08-07', rate: 0.049037 },
    { date: '2023-08-08', rate: 0.049037 },
    { date: '2023-08-09', rate: 0.049037 },
    { date: '2023-08-10', rate: 0.049037 },
    { date: '2023-08-11', rate: 0.049037 },
    { date: '2023-08-14', rate: 0.049037 },
    { date: '2023-08-15', rate: 0.049037 },
    { date: '2023-08-16', rate: 0.049037 },
    { date: '2023-08-17', rate: 0.049037 },
    { date: '2023-08-18', rate: 0.049037 },
    { date: '2023-08-21', rate: 0.049037 },
    { date: '2023-08-22', rate: 0.049037 },
    { date: '2023-08-23', rate: 0.049037 },
    { date: '2023-08-24', rate: 0.049037 },
    { date: '2023-08-25', rate: 0.049037 },
    { date: '2023-08-28', rate: 0.049037 },
    { date: '2023-08-29', rate: 0.049037 },
    { date: '2023-08-30', rate: 0.049037 },
    { date: '2023-08-31', rate: 0.049037 },
    // Sep 2023 (Selic 12.75% from 21/09)
    { date: '2023-09-01', rate: 0.049037 },
    { date: '2023-09-04', rate: 0.049037 },
    { date: '2023-09-05', rate: 0.049037 },
    { date: '2023-09-06', rate: 0.049037 },
    { date: '2023-09-08', rate: 0.049037 },
    { date: '2023-09-11', rate: 0.049037 },
    { date: '2023-09-12', rate: 0.049037 },
    { date: '2023-09-13', rate: 0.049037 },
    { date: '2023-09-14', rate: 0.049037 },
    { date: '2023-09-15', rate: 0.049037 },
    { date: '2023-09-18', rate: 0.049037 },
    { date: '2023-09-19', rate: 0.049037 },
    { date: '2023-09-20', rate: 0.049037 },
    { date: '2023-09-21', rate: 0.047279 },
    { date: '2023-09-22', rate: 0.047279 },
    { date: '2023-09-25', rate: 0.047279 },
    { date: '2023-09-26', rate: 0.047279 },
    { date: '2023-09-27', rate: 0.047279 },
    { date: '2023-09-28', rate: 0.047279 },
    { date: '2023-09-29', rate: 0.047279 },
    // Oct 2023
    { date: '2023-10-02', rate: 0.047279 },
    { date: '2023-10-03', rate: 0.047279 },
    { date: '2023-10-04', rate: 0.047279 },
    { date: '2023-10-05', rate: 0.047279 },
    { date: '2023-10-06', rate: 0.047279 },
    { date: '2023-10-09', rate: 0.047279 },
    { date: '2023-10-10', rate: 0.047279 },
    { date: '2023-10-11', rate: 0.047279 },
    { date: '2023-10-13', rate: 0.047279 },
    { date: '2023-10-16', rate: 0.047279 },
    { date: '2023-10-17', rate: 0.047279 },
    { date: '2023-10-18', rate: 0.047279 },
    { date: '2023-10-19', rate: 0.047279 },
    { date: '2023-10-20', rate: 0.047279 },
    { date: '2023-10-23', rate: 0.047279 },
    { date: '2023-10-24', rate: 0.047279 },
    { date: '2023-10-25', rate: 0.047279 },
    { date: '2023-10-26', rate: 0.047279 },
    { date: '2023-10-27', rate: 0.047279 },
    { date: '2023-10-30', rate: 0.047279 },
    { date: '2023-10-31', rate: 0.047279 },
    // Nov 2023 (Selic 12.25% from 02/11)
    { date: '2023-11-01', rate: 0.047279 },
    { date: '2023-11-03', rate: 0.045513 },
    { date: '2023-11-06', rate: 0.045513 },
    { date: '2023-11-07', rate: 0.045513 },
    { date: '2023-11-08', rate: 0.045513 },
    { date: '2023-11-09', rate: 0.045513 },
    { date: '2023-11-10', rate: 0.045513 },
    { date: '2023-11-13', rate: 0.045513 },
    { date: '2023-11-14', rate: 0.045513 },
    { date: '2023-11-16', rate: 0.045513 },
    { date: '2023-11-17', rate: 0.045513 },
    { date: '2023-11-20', rate: 0.045513 },
    { date: '2023-11-21', rate: 0.045513 },
    { date: '2023-11-22', rate: 0.045513 },
    { date: '2023-11-23', rate: 0.045513 },
    { date: '2023-11-24', rate: 0.045513 },
    { date: '2023-11-27', rate: 0.045513 },
    { date: '2023-11-28', rate: 0.045513 },
    { date: '2023-11-29', rate: 0.045513 },
    { date: '2023-11-30', rate: 0.045513 },
    // Dec 2023 (Selic 11.75% from 14/12)
    { date: '2023-12-01', rate: 0.045513 },
    { date: '2023-12-04', rate: 0.045513 },
    { date: '2023-12-05', rate: 0.045513 },
    { date: '2023-12-06', rate: 0.045513 },
    { date: '2023-12-07', rate: 0.045513 },
    { date: '2023-12-08', rate: 0.045513 },
    { date: '2023-12-11', rate: 0.045513 },
    { date: '2023-12-12', rate: 0.045513 },
    { date: '2023-12-13', rate: 0.045513 },
    { date: '2023-12-14', rate: 0.043739 },
    { date: '2023-12-15', rate: 0.043739 },
    { date: '2023-12-18', rate: 0.043739 },
    { date: '2023-12-19', rate: 0.043739 },
    { date: '2023-12-20', rate: 0.043739 },
    { date: '2023-12-21', rate: 0.043739 },
    { date: '2023-12-22', rate: 0.043739 },
    { date: '2023-12-26', rate: 0.043739 },
    { date: '2023-12-27', rate: 0.043739 },
    { date: '2023-12-28', rate: 0.043739 },
    { date: '2023-12-29', rate: 0.043739 },
    // Jan 2024
    { date: '2024-01-02', rate: 0.043739 },
    { date: '2024-01-03', rate: 0.043739 },
    { date: '2024-01-04', rate: 0.043739 },
    { date: '2024-01-05', rate: 0.043739 },
    { date: '2024-01-08', rate: 0.043739 },
    { date: '2024-01-09', rate: 0.043739 },
    { date: '2024-01-10', rate: 0.043739 },
    { date: '2024-01-11', rate: 0.043739 },
    { date: '2024-01-12', rate: 0.043739 },
    { date: '2024-01-15', rate: 0.043739 },
    { date: '2024-01-16', rate: 0.043739 },
    { date: '2024-01-17', rate: 0.043739 },
    { date: '2024-01-18', rate: 0.043739 },
    { date: '2024-01-19', rate: 0.043739 },
    { date: '2024-01-22', rate: 0.043739 },
    { date: '2024-01-23', rate: 0.043739 },
    { date: '2024-01-24', rate: 0.043739 },
    { date: '2024-01-25', rate: 0.043739 },
    { date: '2024-01-26', rate: 0.043739 },
    { date: '2024-01-29', rate: 0.043739 },
    { date: '2024-01-30', rate: 0.043739 },
    { date: '2024-01-31', rate: 0.043739 },
    // Feb 2024 (Selic 11.25% from 01/02)
    { date: '2024-02-01', rate: 0.041957 },
    { date: '2024-02-02', rate: 0.041957 },
    { date: '2024-02-05', rate: 0.041957 },
    { date: '2024-02-06', rate: 0.041957 },
    { date: '2024-02-07', rate: 0.041957 },
    { date: '2024-02-08', rate: 0.041957 },
    { date: '2024-02-09', rate: 0.041957 },
  ];

  const selicDailySeries: SelicDailyPoint[] = rawSerie11.map(r => ({
    date: r.date,
    annualRatePct: r.rate,
  }));

  /** Extrato BB op. 004.309.649 — JUROS capitalizados (carência 12 meses). */
  const expectedGrace = [
    { interest: 2008.57, finalBalance: 152008.57, date: '2023-03-10' },
    { interest: 2263.30, finalBalance: 154271.87, date: '2023-04-10' },
    { interest: 2297.00, finalBalance: 156568.87, date: '2023-05-10' },
    { interest: 2566.22, finalBalance: 159135.09, date: '2023-06-12' },
    { interest: 2369.41, finalBalance: 161504.50, date: '2023-07-10' },
    { interest: 2754.10, finalBalance: 164258.60, date: '2023-08-10' },
    { interest: 2507.65, finalBalance: 166766.25, date: '2023-09-11' },
    { interest: 2507.25, finalBalance: 169273.50, date: '2023-10-10' },
    { interest: 2505.63, finalBalance: 171779.13, date: '2023-11-10' },
    { interest: 2373.94, finalBalance: 174153.07, date: '2023-12-11' },
    { interest: 2353.53, finalBalance: 176506.60, date: '2024-01-10' },
    { interest: 2712.60, finalBalance: 179219.20, date: '2024-02-14' },
  ];

  const spreadAnual = 6.0;
  const spreadMensal = (Math.pow(1 + spreadAnual / 100, 1 / 12) - 1) * 100;

  function buildPronampeParams(overrides: Partial<Parameters<typeof calculateLoan>[0]> = {}) {
    return {
      principal: 150000.0,
      months: 37,
      fixedRateMonth: spreadMensal,
      fixedRateType: 'percent' as const,
      varRateMonth: 0,
      varIndexMode: 'selic_over_diaria' as const,
      proRataDieMode: 'compound' as const,
      system: 'SAC' as const,
      gracePeriod: 12,
      graceType: 'capitalized' as const,
      monthlyOperationCost: 0,
      monthlyOpCostType: 'percent' as const,
      graceFixedRateMonth: spreadMensal,
      graceFixedRateType: 'percent' as const,
      graceMonthlyOperationCost: 0,
      graceMonthlyOpCostType: 'percent' as const,
      operationalCostDayBasis: 'commercial30' as const,
      graceInterestRoundingMode: 'halfAwayFromZero' as const,
      graceInterestDecimalPlaces: 2,
      contractDate: parseISO('2023-02-10'),
      firstInstallmentDate: parseISO('2024-03-10'),
      sacInterestAccrual: 'mensalContrato' as const,
      sacMoneyRounding: 'halfAwayFromZero' as const,
      preserveInstallmentAfterCapitalizedGrace: false,
      selicDailySeries,
      ...overrides,
    };
  }

  it('Selic Over compõe fatores mesmo se proRataDieMode estiver linear no formulário', () => {
    const compound = calculateLoan(buildPronampeParams({ proRataDieMode: 'compound' }));
    const linear = calculateLoan(buildPronampeParams({ proRataDieMode: 'linear' }));
    const gCompound = compound.filter((r) => r.isGrace)[0];
    const gLinear = linear.filter((r) => r.isGrace)[0];
    expect(gLinear?.interest).toBeCloseTo(gCompound?.interest ?? 0, 2);
    expect(gCompound?.interest).toBeCloseTo(2008.57, 2);
    expect(gCompound?.accrualDays).toBeGreaterThan(0);
    expect(gCompound?.accrualDays).toBeLessThan(28);
    expect(gCompound?.selicBusinessDays).toBe(gCompound?.accrualDays);
  });

  it('calcula carência 12 meses alinhada ao extrato BB (Selic Over + spread 6% a.a.)', () => {
    const result = calculateLoan(buildPronampeParams());
    const graceRows = result.filter((r) => r.isGrace);

    let maxAbsDiff = 0;
    for (let i = 0; i < graceRows.length && i < expectedGrace.length; i++) {
      const row = graceRows[i];
      const exp = expectedGrace[i];
      const diff = Math.abs(row.interest - exp.interest);
      maxAbsDiff = Math.max(maxAbsDiff, diff);
      expect(row.date.toISOString().slice(0, 10)).toBe(exp.date);
    }

    expect(graceRows.length).toBe(12);
    expect(graceRows[0]?.interest).toBeCloseTo(2008.57, 2);
    expect(graceRows[3]?.interest).toBeCloseTo(2566.22, 2);
    expect(graceRows[11]?.date.toISOString().slice(0, 10)).toBe('2024-02-14');
    expect(maxAbsDiff).toBeLessThan(3.5);
  });

  it('SAC quita o saldo incorporado (sem residual de R$ 26k da carência)', () => {
    const result = calculateLoan(buildPronampeParams());
    const graceRows = result.filter((r) => r.isGrace);
    const amortRows = result.filter((r) => !r.isGrace && r.month > 0);
    const lastGrace = graceRows[graceRows.length - 1];
    const incorporated = lastGrace?.finalBalance ?? 0;
    const totalAmort = amortRows.reduce((s, r) => s + r.amortization, 0);
    const lastRow = result[result.length - 1];

    expect(incorporated).toBeGreaterThan(150_000);
    expect(totalAmort).toBeCloseTo(incorporated, 0);
    expect(totalAmort).not.toBeCloseTo(150_000, -2);
    expect(lastRow?.finalBalance ?? 1).toBeLessThan(0.02);
  });

  it('11 meses de carência — mês 11 com DU (config. extrato 004.309.649)', () => {
    const result = calculateLoan(
      buildPronampeParams({
        gracePeriod: 11,
        graceFixedRateMonth: 0.48676,
        fixedRateMonth: 0,
      }),
    );
    const m11 = result.find((r) => r.month === 11 && r.isGrace);
    expect(m11?.date.toISOString().slice(0, 10)).toBe('2024-01-10');
    expect(m11?.selicBusinessDays).toBeGreaterThan(15);
    expect(m11?.selicBusinessDays).toBeLessThan(23);
  });

  it('Selic Over + SAC respeita sacAmortizationBase incorporated', () => {
    const incorporated = calculateLoan(
      buildPronampeParams({ sacAmortizationBase: 'incorporated' }),
    );
    const principal = calculateLoan(
      buildPronampeParams({ sacAmortizationBase: 'contractPrincipal' }),
    );
    const aIncorp = incorporated.find((r) => !r.isGrace && r.month > 0 && r.amortization > 0);
    const aPrincipal = principal.find((r) => !r.isGrace && r.month > 0 && r.amortization > 0);
    expect(aPrincipal?.amortization).toBeCloseTo(4054.05, 2);
    expect(aIncorp?.amortization ?? 0).toBeGreaterThan(4700);
  });

  it('extrato BB 004.309.649 — amortização 150.000 ÷ 37 com base principal', () => {
    const result = calculateLoan(
      buildPronampeParams({
        gracePeriod: 11,
        graceFixedRateMonth: 0.48676,
        fixedRateMonth: 0.48676,
        firstInstallmentDate: parseISO('2024-02-14'),
        sacAmortizationBase: 'contractPrincipal',
      }),
    );
    const firstAmort = result.find((r) => !r.isGrace && r.amortization > 0);
    expect(firstAmort?.amortization).toBeCloseTo(4054.05, 2);
  });
});
