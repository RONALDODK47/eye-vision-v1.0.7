import { describe, expect, it } from 'vitest';
import { fiscalDataNoIntervalo, parseFiscalDataRef } from '../logic/fiscalDateFilter';

describe('fiscalDateFilter', () => {
  it('interpreta data única em DD/MM/AAAA', () => {
    const { start, end } = parseFiscalDataRef('15/03/2026');
    expect(start?.getFullYear()).toBe(2026);
    expect(start?.getMonth()).toBe(2);
    expect(end?.getDate()).toBe(15);
  });

  it('interpreta intervalo de período SPED', () => {
    const { start, end } = parseFiscalDataRef('01/01/2026 — 31/01/2026');
    expect(start?.getDate()).toBe(1);
    expect(end?.getDate()).toBe(31);
  });

  it('filtra por data início e fim', () => {
    expect(fiscalDataNoIntervalo('10/02/2026', '2026-02-01', '2026-02-28')).toBe(true);
    expect(fiscalDataNoIntervalo('10/01/2026', '2026-02-01', '2026-02-28')).toBe(false);
    expect(fiscalDataNoIntervalo('01/01/2026 — 31/01/2026', '2026-01-15', '2026-02-01')).toBe(true);
  });

  it('sem filtro retorna tudo', () => {
    expect(fiscalDataNoIntervalo('10/01/2026')).toBe(true);
  });
});
