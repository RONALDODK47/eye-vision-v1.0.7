import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseISO } from 'date-fns';
import { calculateLoan } from './loanCalculator';

const bundle = JSON.parse(
  readFileSync(join(process.cwd(), 'public/data/bcb-serie11-bundle.json'), 'utf8'),
) as { points: Array<{ date: string; annualRatePct: number }> };

const selicDailySeries = bundle.points.filter(
  (p) => p.date >= '2023-02-10' && p.date <= '2024-03-15',
);

/** Extrato SISBB op. 004.309.649 — COMERCIAL FERNANDES LTDA. */
const EXTRATO_GRACE = [
  { date: '2023-03-10', interest: 2008.57, balance: 152008.57 },
  { date: '2023-04-10', interest: 2263.3, balance: 154271.87 },
  { date: '2023-05-10', interest: 2297.0, balance: 156568.87 },
  { date: '2023-06-12', interest: 2566.22, balance: 159135.09 },
  { date: '2023-07-10', interest: 2369.41, balance: 161504.5 },
  { date: '2023-08-10', interest: 2754.1, balance: 164258.6 },
  { date: '2023-09-11', interest: 2507.65, balance: 166766.25 },
  { date: '2023-10-10', interest: 2507.25, balance: 169273.5 },
  { date: '2023-11-10', interest: 2505.63, balance: 171779.13 },
  { date: '2023-12-11', interest: 2373.94, balance: 174153.07 },
  { date: '2024-01-10', interest: 2353.53, balance: 176506.6 },
];

function bb004Params(spreadMonth = 0.48676) {
  return {
    principal: 150_000,
    months: 37,
    fixedRateMonth: spreadMonth,
    fixedRateType: 'percent' as const,
    varRateMonth: 0,
    varIndexMode: 'selic_over_diaria' as const,
    proRataDieMode: 'compound' as const,
    system: 'SAC' as const,
    gracePeriod: 11,
    graceType: 'capitalized' as const,
    monthlyOperationCost: 0,
    monthlyOpCostType: 'percent' as const,
    graceFixedRateMonth: spreadMonth,
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
    selicDailySeries,
  };
}

describe('extrato BB 004.309.649 — SISBB PRONAMPE', () => {
  it('carência 11 meses capitalizada bate com extrato (spread contrato)', () => {
    const rows = calculateLoan(bb004Params());
    const grace = rows.filter((r) => r.isGrace);

    expect(grace).toHaveLength(11);
    for (let i = 0; i < EXTRATO_GRACE.length; i++) {
      const exp = EXTRATO_GRACE[i];
      const got = grace[i];
      expect(got?.date.toISOString().slice(0, 10)).toBe(exp.date);
      expect(got?.interest).toBeCloseTo(exp.interest, 1);
      expect(got?.finalBalance).toBeCloseTo(exp.balance, 1);
    }
  });

  it('1ª amortização: 14/02/2024 — capital 150.000÷37 e juros do período', () => {
    const rows = calculateLoan(bb004Params());
    const first = rows.find((r) => !r.isGrace && r.amortization > 0);

    expect(first?.date.toISOString().slice(0, 10)).toBe('2024-02-14');
    expect(first?.amortization).toBeCloseTo(4054.05, 2);
    expect(first?.interest).toBeCloseTo(2712.6, 1);
    expect(first?.initialBalance).toBeCloseTo(176506.6, 1);
  });

  it('spread 6% a.a. converte — diferença máxima ≤ R$ 0,02 na carência', () => {
    const spreadMensal = (Math.pow(1 + 6 / 100, 1 / 12) - 1) * 100;
    const grace = calculateLoan(bb004Params(spreadMensal)).filter((r) => r.isGrace);

    let maxDiff = 0;
    for (let i = 0; i < EXTRATO_GRACE.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs((grace[i]?.interest ?? 0) - EXTRATO_GRACE[i].interest));
    }
    expect(maxDiff).toBeLessThanOrEqual(0.02);
  });
});
