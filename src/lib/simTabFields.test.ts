import { describe, expect, it } from 'vitest';
import { createDefaultSimTabFields, mergeStoredSimTab } from './simTabFields';

describe('mergeStoredSimTab — PRONAMPE amortização SAC', () => {
  it('PRONAMPE sem base explícita usa principal do contrato ÷ parcelas', () => {
    const tab = mergeStoredSimTab({ varMode: 'pronampe', system: 'SAC' });
    expect(tab.sacAmortizationBase).toBe('contractPrincipal');
  });

  it('PRONAMPE respeita incorporated quando salvo explicitamente', () => {
    const tab = mergeStoredSimTab({
      varMode: 'pronampe',
      system: 'SAC',
      sacAmortizationBase: 'incorporated',
    });
    expect(tab.sacAmortizationBase).toBe('incorporated');
  });

  it('modos não-PRONAMPE mantêm padrão incorporated', () => {
    const tab = mergeStoredSimTab({ varMode: 'cdi', system: 'SAC' });
    expect(tab.sacAmortizationBase).toBe(createDefaultSimTabFields().sacAmortizationBase);
  });
});
