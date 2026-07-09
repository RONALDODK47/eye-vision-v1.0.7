import { describe, expect, it } from 'vitest';
import {
  calcularAliquotaInterestadual,
  compararIcmsInterestadual,
} from '../logic/icmsInterestadual';

describe('ICMS interestadual', () => {
  it('SP → RJ usa 12% interestadual (Sul/Sudeste)', () => {
    const { aliquota } = calcularAliquotaInterestadual('SP', 'RJ');
    expect(aliquota).toBe(12);
  });

  it('SP → BA usa 7% interestadual', () => {
    const { aliquota } = calcularAliquotaInterestadual('SP', 'BA');
    expect(aliquota).toBe(7);
  });

  it('calcula DIFAL e diferença de alíquota', () => {
    const r = compararIcmsInterestadual({
      ufOrigem: 'SP',
      ufDestino: 'RJ',
      valorBase: 1000,
      consumidorFinalNaoContribuinte: true,
    });
    expect(r.aliquotaInterestadual).toBe(12);
    expect(r.aliquotaInternaDestino).toBe(20);
    expect(r.diferencaPercentualPontos).toBe(8);
    expect(r.valorDifalEstimado).toBe(80);
  });

  it('produto importado usa 4%', () => {
    const { aliquota } = calcularAliquotaInterestadual('SP', 'PE', true);
    expect(aliquota).toBe(4);
  });
});
