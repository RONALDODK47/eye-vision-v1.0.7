import { describe, expect, it } from 'vitest';
import { buildBalanceteUsoContasParaIa } from './regrasContasAiContext';
import { writeManagerData } from './companyWorkspace';

describe('buildBalanceteUsoContasParaIa', () => {
  it('resume contas com movimento por grupo', () => {
    writeManagerData('EMPRESA TESTE IA', 'razao', [
      {
        codigo: '432',
        nome: 'APLICACAO FINANCEIRA BB',
        debito: 5000,
        credito: 0,
        saldoInicial: 0,
        saldoFinal: 5000,
      },
      {
        codigo: '510',
        nome: 'RECEITA FINANCEIRA JUROS',
        debito: 0,
        credito: 120,
        saldoInicial: 0,
        saldoFinal: 120,
      },
      {
        codigo: '300',
        nome: 'CLIENTES DIVERSOS',
        debito: 100,
        credito: 8000,
        saldoInicial: 0,
        saldoFinal: 7900,
      },
    ]);
    writeManagerData('EMPRESA TESTE IA', 'plano', [
      { code: '1.1.1', name: 'APLICACAO FINANCEIRA BB', codigoReduzido: '432', group: 'ATIVO' },
      { code: '4.1.1', name: 'RECEITA FINANCEIRA JUROS', codigoReduzido: '510', group: 'RECEITA' },
      { code: '1.1.2', name: 'CLIENTES DIVERSOS', codigoReduzido: '300', group: 'ATIVO' },
    ]);

    const out = buildBalanceteUsoContasParaIa('EMPRESA TESTE IA');
    expect(out).toContain('MAPA DE USO DE CONTAS');
    expect(out).toContain('reduzido 432');
    expect(out).toContain('APLICACAO FINANCEIRA');
    expect(out).toContain('reduzido 510');
    expect(out).toContain('RECEITA FINANCEIRA');
    expect(out).toContain('GRUPO ATIVO');
    expect(out).toContain('GRUPO RECEITA');
  });

  it('retorna vazio sem razão importado', () => {
    writeManagerData('EMPRESA VAZIA', 'razao', []);
    expect(buildBalanceteUsoContasParaIa('EMPRESA VAZIA')).toBe('');
  });
});
