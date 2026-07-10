import { describe, expect, it } from 'vitest';
import { buildPlanoNomeLookup, resolveContaNome } from './ExtratoContaPicker';

const plano = [
  { code: '1.01.02.001', name: 'BANCO DO BRASIL', codigoReduzido: '0000008' },
  { code: '5.01.02.001', name: 'DESPESAS BANCARIAS', codigoReduzido: '147' },
  { code: '2.01', name: 'PASSIVO CIRCULANTE', codigoReduzido: undefined },
];

describe('resolveContaNome (Desc. débito/crédito)', () => {
  const lookup = buildPlanoNomeLookup(plano);

  it('resolve pelo reduzido sem zeros', () => {
    expect(resolveContaNome(lookup, '8', plano)).toBe('BANCO DO BRASIL');
  });

  it('resolve pelo reduzido Domínio com zeros', () => {
    expect(resolveContaNome(lookup, '0000008', plano)).toBe('BANCO DO BRASIL');
  });

  it('resolve pela classificação', () => {
    expect(resolveContaNome(lookup, '5.01.02.001', plano)).toBe('DESPESAS BANCARIAS');
  });

  it('resolve classificação → nome via reduzido do plano', () => {
    expect(resolveContaNome(lookup, '1.01.02.001', plano)).toBe('BANCO DO BRASIL');
  });

  it('retorna vazio se código vazio', () => {
    expect(resolveContaNome(lookup, '', plano)).toBe('');
  });
});
