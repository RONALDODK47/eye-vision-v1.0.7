import { describe, expect, it } from 'vitest';
import {
  applyFlatContasToNestedConfig,
  getModuloContasCampoDefs,
  sugerirContasLocalDoPlano,
} from '../logic/moduloContasAiSchemas';

describe('moduloContasAiSchemas', () => {
  it('define campos para todos os módulos', () => {
    expect(getModuloContasCampoDefs('emprestimo').length).toBeGreaterThan(5);
    expect(getModuloContasCampoDefs('aplicacao').length).toBeGreaterThan(3);
    expect(getModuloContasCampoDefs('parcelamento').length).toBeGreaterThan(5);
    expect(getModuloContasCampoDefs('folha').length).toBe(16);
    expect(getModuloContasCampoDefs('fiscal').length).toBe(24);
    expect(getModuloContasCampoDefs('honorarios').length).toBe(2);
  });

  it('sugere contas locais por keywords', () => {
    const plano = [
      { code: '1.01.02.001', name: 'BANCO DO BRASIL' },
      { code: '2.01.03.001', name: 'EMPRESTIMOS A PAGAR' },
      { code: '5.01.01.001', name: 'DESPESAS FINANCEIRAS JUROS' },
    ];
    const campos = getModuloContasCampoDefs('emprestimo');
    const sug = sugerirContasLocalDoPlano(campos, plano, {}, true);
    expect(sug.accEmprestimoDebit).toBe('1.01.02.001');
    expect(sug.accEmprestimoCredit).toBe('2.01.03.001');
  });

  it('aplica flat em config aninhada', () => {
    const current = {
      SALARIO: { debito: '', credito: '' },
      PROLABORE: { debito: 'x', credito: 'y' },
    };
    const next = applyFlatContasToNestedConfig(current, {
      'SALARIO.debito': '5.1.01',
      'SALARIO.credito': '2.1.01',
    });
    expect(next.SALARIO).toEqual({ debito: '5.1.01', credito: '2.1.01' });
    expect(next.PROLABORE).toEqual({ debito: 'x', credito: 'y' });
  });
});
