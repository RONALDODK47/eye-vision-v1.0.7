import { describe, expect, it } from 'vitest';
import { evaluateBcbReadiness } from './bcbIndexadorReadiness';
import type { SimTabFields } from '../lib/simTabFields';
import { createDefaultSimTabFields } from '../lib/simTabFields';

describe('evaluateBcbReadiness', () => {
  const baseTab: SimTabFields = { ...createDefaultSimTabFields(), varMode: 'pronampe' };

  it('exige série diária para PRONAMPE', () => {
    const r = evaluateBcbReadiness({
      tab: baseTab,
      selicLoadState: 'error',
      selicDailyCount: 0,
      monthlyLoadState: 'idle',
      monthlyIndexCount: 0,
      indicators: null,
      indicatorsLoadState: 'error',
    });
    expect(r.ready).toBe(false);
    expect(r.message).toContain('Série 11');
  });

  it('libera quando há cotações BCB', () => {
    const r = evaluateBcbReadiness({
      tab: baseTab,
      selicLoadState: 'ok',
      selicDailyCount: 240,
      monthlyLoadState: 'idle',
      monthlyIndexCount: 0,
      indicators: { selicAnual: 10, selicMensal: 0.8, cdiMensal: 0.8, source: 'bcb' },
      indicatorsLoadState: 'ok',
    });
    expect(r.ready).toBe(true);
    expect(r.message).toContain('240');
  });
});
