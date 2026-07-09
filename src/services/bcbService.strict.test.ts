import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEconomicIndicatorsFromBcb, fetchSelicOverDailySeries } from './bcbService';

describe('bcbService — somente API BCB', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchEconomicIndicatorsFromBcb retorna null se BCB falhar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => '' }),
    );
    await expect(fetchEconomicIndicatorsFromBcb()).resolves.toBeNull();
  });

  it('fetchSelicOverDailySeries propaga erro se BCB falhar e período fora do pacote offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => '' }),
    );
    await expect(
      fetchSelicOverDailySeries(new Date(2099, 0, 1), new Date(2099, 11, 31)),
    ).rejects.toThrow();
  });

  it('fetchSelicOverDailySeries usa cache local se BCB falhar', async () => {
    const store = {
      updatedAt: '2024-01-01T00:00:00.000Z',
      points: [
        { date: '2023-02-01', annualRatePct: 0.05 },
        { date: '2023-02-10', annualRatePct: 0.050788 },
        { date: '2023-03-15', annualRatePct: 0.051 },
      ],
    };
    vi.stubGlobal('localStorage', {
      getItem: (key: string) =>
        key === 'contabilfacil_bcb_serie11_v1' ? JSON.stringify(store) : null,
      setItem: () => {},
      removeItem: () => {},
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => '' }),
    );
    const pts = await fetchSelicOverDailySeries(new Date(2023, 1, 10), new Date(2023, 2, 10));
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.some((p) => p.date === '2023-02-10')).toBe(true);
  });

  it('fetchSelicOverDailySeries usa pacote offline embutido para 2023', async () => {
    const pts = await fetchSelicOverDailySeries(new Date(2023, 1, 10), new Date(2023, 1, 15));
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.some((p) => p.date === '2023-02-10')).toBe(true);
  });
});
