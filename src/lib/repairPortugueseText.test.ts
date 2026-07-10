import { describe, expect, it } from 'vitest';
import { repairPortugueseText } from './repairPortugueseText';

describe('repairPortugueseText', () => {
  it('repara DISPONÍVEL com caractere perdido', () => {
    expect(repairPortugueseText('DISPON\uFFFDVEL')).toBe('DISPONÍVEL');
  });

  it('repara APLICAÇÕES FINANCEIRAS', () => {
    expect(repairPortugueseText('APLICA\uFFFD\uFFFDES FINANCEIRAS LIQUIDEZ IMEDIATA')).toBe(
      'APLICAÇÕES FINANCEIRAS LIQUIDEZ IMEDIATA',
    );
  });

  it('repara CARTÃO DE CRÉDITO', () => {
    expect(repairPortugueseText('CART\uFFFDO DE CR\uFFFDDITO')).toBe('CARTÃO DE CRÉDITO');
  });

  it('repara SALÁRIOS E ORDENADOS', () => {
    expect(repairPortugueseText('SAL\uFFFDRIOS E ORDENADOS')).toBe('SALÁRIOS E ORDENADOS');
  });

  it('mantém texto já correto', () => {
    expect(repairPortugueseText('CAIXA GERAL')).toBe('CAIXA GERAL');
  });
});
