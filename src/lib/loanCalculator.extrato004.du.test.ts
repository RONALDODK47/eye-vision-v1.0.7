import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseISO } from 'date-fns';
import { calculateLoan } from './loanCalculator';

const bundle = JSON.parse(
  readFileSync(join(process.cwd(), 'public/data/bcb-serie11-bundle.json'), 'utf8'),
) as { points: Array<{ date: string; annualRatePct: number }> };

/** Coluna DIAS (DU) do extrato SISBB 004.309.649 — 11 meses de carência. */
const EXTRATO_GRACE_DU = [18, 20, 20, 22, 20, 23, 21, 21, 21, 20, 20];

/** DU do período 10/01/2024 → 14/02/2024 (1ª parcela no extrato). */
const EXTRATO_FIRST_INSTALLMENT_DU = 23;

function bb004LoanParams() {
  const spreadMensal = (Math.pow(1 + 6 / 100, 1 / 12) - 1) * 100;
  return {
    principal: 150_000,
    months: 37,
    fixedRateMonth: spreadMensal,
    fixedRateType: 'percent' as const,
    varRateMonth: 0,
    varIndexMode: 'selic_over_diaria' as const,
    proRataDieMode: 'compound' as const,
    system: 'SAC' as const,
    gracePeriod: 11,
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
    firstInstallmentDate: parseISO('2024-02-14'),
    sacInterestAccrual: 'mensalContrato' as const,
    sacMoneyRounding: 'halfAwayFromZero' as const,
    sacAmortizationBase: 'contractPrincipal' as const,
    selicDailySeries: bundle.points.filter(
      (p) => p.date >= '2023-02-10' && p.date <= '2024-03-15',
    ),
  };
}

describe('extrato 004.309.649 — dias úteis (DU)', () => {
  it('carência: DU idênticos ao extrato SISBB (calendário bancário)', () => {
    const grace = calculateLoan(bb004LoanParams()).filter((r) => r.isGrace);
    const got = grace.map((r) => r.selicBusinessDays ?? r.accrualDays);
    expect(got).toEqual(EXTRATO_GRACE_DU);
  });

  it('1ª parcela (jan→fev/2024): 23 DU no extrato', () => {
    const first = calculateLoan(bb004LoanParams()).find((r) => !r.isGrace && r.amortization > 0);
    expect(first?.selicBusinessDays ?? first?.accrualDays).toBe(EXTRATO_FIRST_INSTALLMENT_DU);
  });
});
