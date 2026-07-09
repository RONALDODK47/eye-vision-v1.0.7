import { describe, expect, it } from 'vitest';
import { parseISO } from 'date-fns';
import {
  buildLongoInicioAnoCivil,
  calcCurtoAlvo31DezAno,
  calcTransferencia31DezAno,
  indiceLinhaDezembroNoAno,
  somaParcelasLiquidasNoAnoCivil,
} from './cpcFiscalYearEnd';
import type { LoanRow } from './loanCalculator';

function row(partial: Partial<LoanRow> & Pick<LoanRow, 'month' | 'date'>): LoanRow {
  return {
    accrualDays: 30,
    referenceMonthDays: 30,
    die30Factor: 1,
    opCostPeriodFactor: 1,
    initialBalance: 1000,
    interest: 10,
    amortization: 0,
    monthlyCost: 0,
    iof: 0,
    installment: 1000,
    finalBalance: 1010,
    shortTermBalance: 0,
    longTermBalance: 1010,
    cpcShortTermWindowMonths: [],
    cpcShortTermWindowDescribe: '—',
    isGrace: false,
    ...partial,
  };
}

describe('cpcFiscalYearEnd', () => {
  it('somaParcelasLiquidasNoAnoCivil limita a 12 parcelas no ano civil', () => {
    const schedule: LoanRow[] = [
      row({ month: 0, date: parseISO('2024-01-01') }),
      ...Array.from({ length: 14 }, (_, i) =>
        row({
          month: i + 1,
          date: parseISO(`2025-${String(i + 1).padStart(2, '0')}-10`),
          installment: 1000 + i,
        }),
      ),
    ];
    expect(somaParcelasLiquidasNoAnoCivil(schedule, 2025, 12)).toBe(
      Array.from({ length: 12 }, (_, i) => 1000 + i).reduce((a, b) => a + b, 0),
    );
  });

  it('calcCurtoAlvo31DezAno provisiona parcelas do ano seguinte (até 12)', () => {
    const schedule: LoanRow[] = [
      row({ month: 0, date: parseISO('2024-01-01') }),
      row({ month: 1, date: parseISO('2024-12-10'), installment: 500, shortTermBalance: 1500 }),
      row({ month: 2, date: parseISO('2025-01-10'), installment: 500 }),
      row({ month: 3, date: parseISO('2025-02-10'), installment: 500 }),
    ];
    const curto = (r: LoanRow) => r.shortTermBalance;
    expect(calcCurtoAlvo31DezAno(schedule, 2024, curto)).toBe(1500);
    expect(calcCurtoAlvo31DezAno(schedule, 2024, () => 0)).toBe(1000);
  });

  it('calcCurtoAlvo31DezAno com empréstimo encerrando no ano usa parcelas restantes', () => {
    const schedule: LoanRow[] = [
      row({ month: 0, date: parseISO('2024-06-01') }),
      row({ month: 1, date: parseISO('2024-11-10'), installment: 5000, shortTermBalance: 0 }),
    ];
    expect(calcCurtoAlvo31DezAno(schedule, 2024, () => 0)).toBe(0);
  });

  it('calcTransferencia31DezAno reclassifica uma vez quando empréstimo encerra no ano', () => {
    const schedule: LoanRow[] = [
      row({ month: 0, date: parseISO('2024-01-15') }),
      row({
        month: 9,
        date: parseISO('2024-10-15'),
        installment: 5100,
        shortTermBalance: 5100,
      }),
      row({
        month: 10,
        date: parseISO('2024-11-15'),
        installment: 5050,
        shortTermBalance: 0,
      }),
    ];
    const curto = (r: LoanRow) => r.shortTermBalance;
    expect(calcTransferencia31DezAno(schedule, 2024, curto)).toBe(5100);
  });

  it('calcTransferencia31DezAno provisiona só 3 parcelas se o ano seguinte tiver apenas 3', () => {
    const schedule: LoanRow[] = [
      row({ month: 0, date: parseISO('2024-01-01') }),
      row({ month: 1, date: parseISO('2024-12-10'), shortTermBalance: 0 }),
      row({ month: 2, date: parseISO('2025-01-10'), installment: 100 }),
      row({ month: 3, date: parseISO('2025-02-10'), installment: 100 }),
      row({ month: 4, date: parseISO('2025-03-10'), installment: 100 }),
    ];
    expect(calcTransferencia31DezAno(schedule, 2024, () => 0)).toBe(300);
  });

  it('indiceLinhaDezembroNoAno usa o dia mais tardio de dezembro (31/12, não 01/12)', () => {
    const schedule: LoanRow[] = [
      row({ month: 8, date: parseISO('2025-12-01'), installment: 0 }),
      row({ month: 9, date: parseISO('2025-12-31'), installment: 0 }),
    ];
    expect(indiceLinhaDezembroNoAno(schedule, 2025)).toBe(1);
  });

  it('jan–nov: longo congelado e curto = saldo − longo (não zera curto no meio do ano)', () => {
    const schedule: LoanRow[] = [
      row({ month: 0, date: parseISO('2027-01-01'), finalBalance: 20_000 }),
      row({
        month: 1,
        date: parseISO('2027-12-31'),
        installment: 1_500,
        finalBalance: 18_500,
        shortTermBalance: 1_500,
        longTermBalance: 17_000,
      }),
      row({
        month: 2,
        date: parseISO('2028-01-31'),
        installment: 1_500,
        finalBalance: 17_000,
      }),
      row({
        month: 3,
        date: parseISO('2028-02-28'),
        installment: 1_500,
        finalBalance: 15_500,
      }),
      row({
        month: 4,
        date: parseISO('2028-11-30'),
        installment: 1_500,
        finalBalance: 10_500,
      }),
      row({
        month: 5,
        date: parseISO('2028-12-31'),
        installment: 1_500,
        finalBalance: 9_000,
      }),
      row({
        month: 6,
        date: parseISO('2029-01-31'),
        installment: 1_500,
        finalBalance: 7_500,
      }),
    ];

    const longoMap = buildLongoInicioAnoCivil(schedule);
    expect(longoMap.get(2028)).toBeCloseTo(12_500, 2);

    const nov = schedule[4]!;
    const longoFixo2028 = longoMap.get(2028)!;
    const curtoNov = Math.max(0, nov.finalBalance - longoFixo2028);
    expect(curtoNov).toBe(0);
    expect(nov.finalBalance - curtoNov).toBeCloseTo(nov.finalBalance, 2);

    const jan2029 = schedule[6]!;
    const longoFixo2029 = longoMap.get(2029)!;
    expect(longoFixo2029).toBeGreaterThan(0);
    expect(longoFixo2029).toBeLessThan(jan2029.finalBalance + 1_500);
  });
});
