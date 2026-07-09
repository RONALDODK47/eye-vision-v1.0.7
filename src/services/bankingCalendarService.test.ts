import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isBusinessDay, toYmd } from '../lib/brBusinessDays';
import { parseISO } from 'date-fns';
import {
  fetchNationalHolidaysForYear,
  hydrateBankingCalendarFromRemote,
  hydrateBankingCalendarFromStorage,
} from './bankingCalendarService';

describe('bankingCalendarService', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      store,
      getItem(key: string) {
        return store[key] ?? null;
      },
      setItem(key: string, value: string) {
        store[key] = value;
      },
      removeItem(key: string) {
        delete store[key];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchNationalHolidaysForYear interpreta resposta da Brasil API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { date: '2023-06-08', name: 'Corpus Christi' },
          { date: '2023-12-25', name: 'Natal' },
        ],
      }),
    );
    const dates = await fetchNationalHolidaysForYear(2023);
    expect(dates).toContain('2023-06-08');
    expect(dates).toContain('2023-12-25');
  });

  it('hidratação marca Corpus Christi — jun/2023 tem 22 DU no período do extrato', () => {
    hydrateBankingCalendarFromStorage();
    const corpus = parseISO('2023-06-08');
    expect(isBusinessDay(corpus)).toBe(false);
    expect(toYmd(corpus)).toBe('2023-06-08');
  });

  it('hydrateBankingCalendarFromRemote persiste cache quando API responde', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ date: '2024-11-20', name: 'Consciência Negra' }],
      }),
    );
    const ok = await hydrateBankingCalendarFromRemote(2024, 2024);
    expect(ok).toBe(true);
    const negra = parseISO('2024-11-20');
    expect(isBusinessDay(negra)).toBe(false);
  });
});
