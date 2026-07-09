import { describe, expect, it } from 'vitest';
import {
  computeFirstInstallmentDate,
  computeGraceMonthDates,
} from './loanScheduleDates';

describe('loanScheduleDates — carência após o mês do contrato', () => {
  const contract = '2023-02-10';

  it('11 meses de carência → última 10/01/2024 e 1ª parcela 10/02/2024', () => {
    const graceDates = computeGraceMonthDates(contract, 11);
    expect(graceDates).toHaveLength(11);
    expect(graceDates[0]).toBe('2023-03-10');
    expect(graceDates[10]).toBe('2024-01-10');
    expect(computeFirstInstallmentDate(contract, 11)).toBe('2024-02-10');
  });

  it('12 meses de carência → última 10/02/2024 e 1ª parcela 10/03/2024', () => {
    expect(computeGraceMonthDates(contract, 12)).toHaveLength(12);
    expect(computeGraceMonthDates(contract, 12)[11]).toBe('2024-02-10');
    expect(computeFirstInstallmentDate(contract, 12)).toBe('2024-03-10');
  });

  it('carência 0 mantém 1ª parcela na data do contrato', () => {
    expect(computeFirstInstallmentDate(contract, 0)).toBe(contract);
    expect(computeGraceMonthDates(contract, 0)).toEqual([]);
  });
});
