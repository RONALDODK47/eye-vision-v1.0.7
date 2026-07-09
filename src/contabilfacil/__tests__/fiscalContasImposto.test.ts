import { describe, expect, it } from 'vitest';
import { contasParaImposto, contasParaImpostoLancamento, emptyFiscalContasImposto, resolveFiscalImpostoId } from '../logic/fiscalContasImposto';

describe('fiscalContasImposto', () => {
  it('resolve rótulos do SPED', () => {
    expect(resolveFiscalImpostoId('PIS/Pasep')).toBe('PIS');
    expect(resolveFiscalImpostoId('COFINS')).toBe('COFINS');
    expect(resolveFiscalImpostoId('ICMS')).toBe('ICMS');
    expect(resolveFiscalImpostoId('IPI')).toBe('ICMS');
    expect(resolveFiscalImpostoId('Simples Nacional')).toBe('SIMPLES_NACIONAL');
    expect(resolveFiscalImpostoId('DAS — parcela 03/2026')).toBe('SIMPLES_NACIONAL');
  });

  it('retorna contas configuradas por imposto', () => {
    const cfg = emptyFiscalContasImposto();
    cfg.PIS = {
      debito: '3.1.01.01',
      credito: '2.1.08.05',
      debitoRecuperar: '1.1.08.01',
      creditoRecuperar: '3.1.01.02',
    };
    expect(contasParaImposto(cfg, 'PIS/Pasep')).toEqual(cfg.PIS);
    expect(contasParaImpostoLancamento(cfg, 'PIS/Pasep', 'credora')).toEqual({
      debito: '3.1.01.01',
      credito: '2.1.08.05',
    });
    expect(contasParaImpostoLancamento(cfg, 'PIS/Pasep', 'devedora')).toEqual({
      debito: '1.1.08.01',
      credito: '3.1.01.02',
    });
  });
});
