import { describe, expect, it } from 'vitest';
import { parseISO } from 'date-fns';
import {
  accumulateSelicOverBetween,
  effectivePctFromRoundedInterest,
  interestMatchesDisplayedRate,
  resolvePeriodRateMemory,
  selicPointsToMap,
} from './selicOverIndex';

describe('selicOverIndex — BB/PRONAMPE', () => {
  const rate = 0.050788;
  const map = selicPointsToMap(
    [
      '2023-02-13',
      '2023-02-14',
      '2023-02-15',
      '2023-02-16',
      '2023-02-17',
      '2023-02-22',
      '2023-02-23',
      '2023-02-24',
      '2023-02-27',
      '2023-02-28',
      '2023-03-01',
      '2023-03-02',
      '2023-03-03',
      '2023-03-06',
      '2023-03-07',
      '2023-03-08',
      '2023-03-09',
      '2023-03-10',
    ].map((date) => ({ date, annualRatePct: rate }))
  );

  it('acumula Selic apenas em dias úteis entre vencimentos', () => {
    const start = parseISO('2023-02-10');
    const end = parseISO('2023-03-10');
    const { businessDays } = accumulateSelicOverBetween(map, start, end);
    expect(businessDays).toBeGreaterThan(15);
    expect(businessDays).toBeLessThan(28);
  });

  it('compõe spread × Selic (não soma linear) com proRataDieMode linear', () => {
    const spreadMensal = (Math.pow(1 + 6 / 100, 1 / 12) - 1) * 100;
    const memLinear = resolvePeriodRateMemory({
      spreadMonthPct: spreadMensal,
      varRateMonthPct: 0,
      varIndexMode: 'selic_over_diaria',
      temporalFactor: 1,
      proRataDieMode: 'linear',
      selicByDate: map,
      monthlyRateMap: null,
      accrualStart: parseISO('2023-02-10'),
      accrualEnd: parseISO('2023-03-10'),
    });
    const memCompound = resolvePeriodRateMemory({
      spreadMonthPct: spreadMensal,
      varRateMonthPct: 0,
      varIndexMode: 'selic_over_diaria',
      temporalFactor: 1,
      proRataDieMode: 'compound',
      selicByDate: map,
      monthlyRateMap: null,
      accrualStart: parseISO('2023-02-10'),
      accrualEnd: parseISO('2023-03-10'),
    });
    expect(memLinear.rateDecimal).toBeCloseTo(memCompound.rateDecimal, 12);
    const juros = 150_000 * memLinear.rateDecimal;
    expect(juros).toBeGreaterThan(1990);
    expect(juros).toBeLessThan(2020);
  });

  it('taxa exibida (6 casas) reproduz juros arredondados do mês 1', () => {
    const pct = effectivePctFromRoundedInterest(150_000, 2008.57)!;
    expect(pct).toBeCloseTo(1.339046666, 6);
    expect(150_000 * (pct / 100)).toBeCloseTo(2008.57, 2);
    expect(interestMatchesDisplayedRate(150_000, 2008.57, Number(pct.toFixed(4)))).toBe(false);
    expect(interestMatchesDisplayedRate(150_000, 2008.57, Number(pct.toFixed(6)))).toBe(true);
  });
});
