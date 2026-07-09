import { describe, expect, it } from 'vitest';
import {
  buildTxtPlusFromExtratoRows,
  resolvePartidaDominioExtrato,
} from './dominioTxtIO';

describe('resolvePartidaDominioExtrato / TXT Domínio', () => {
  it('entrada (C): banco no débito, contrapartida no crédito', () => {
    const p = resolvePartidaDominioExtrato(
      {
        date: '2026-06-01',
        description: 'TED RECEBIDA MARCIA',
        value: 3404.83,
        nature: 'C',
        accountDebit: '1000',
        accountCredit: '2001',
      },
      '1000',
    );
    expect(p).toEqual({ contaDebito: '1000', contaCredito: '2001' });
  });

  it('saída (D): banco no crédito, contrapartida no débito', () => {
    const p = resolvePartidaDominioExtrato(
      {
        date: '2026-06-01',
        description: 'SISPAG FORNECEDORES',
        value: 10604.83,
        nature: 'D',
        accountDebit: '3001',
        accountCredit: '1004',
      },
      '1004',
    );
    expect(p).toEqual({ contaDebito: '3001', contaCredito: '1004' });
  });

  it('corrige par invertido na entrada usando conta banco preferida', () => {
    const p = resolvePartidaDominioExtrato(
      {
        date: '2026-06-01',
        description: 'TED RECEBIDA',
        value: 100,
        nature: 'C',
        accountDebit: '2001',
        accountCredit: '1000',
      },
      '1000',
    );
    expect(p).toEqual({ contaDebito: '1000', contaCredito: '2001' });
  });

  it('nunca devolve débito = crédito', () => {
    const p = resolvePartidaDominioExtrato(
      {
        date: '2026-06-01',
        description: 'TED',
        value: 100,
        nature: 'C',
        accountDebit: '1000',
        accountCredit: '1000',
      },
      '1000',
    );
    expect(p).toBeNull();
  });

  it('buildTxtPlus gera linha Domínio com contas distintas', () => {
    const txt = buildTxtPlusFromExtratoRows(
      [
        {
          date: '2026-06-01',
          description: 'TED RECEBIDA MARCIA',
          value: 3404.83,
          nature: 'C',
          accountDebit: '1000',
          accountCredit: '2001',
        },
        {
          date: '2026-06-01',
          description: 'SISPAG FORNECEDORES',
          value: 10.5,
          nature: 'D',
          accountDebit: '3001',
          accountCredit: '1000',
        },
        {
          // Mesma conta nos dois lados = banco → descartada
          date: '2026-06-01',
          description: 'INVALIDO IGUAL BANCO',
          value: 1,
          nature: 'D',
          accountDebit: '1000',
          accountCredit: '1000',
        },
      ],
      '1000',
    );
    const lines = txt.split(/\r?\n/).filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^01\/06\/2026;1000;2001;3404,83;/);
    expect(lines[1]).toMatch(/^01\/06\/2026;3001;1000;10,50;/);
  });

  it('buildTxtPlus sem banco preferida usa o par já conciliado', () => {
    const txt = buildTxtPlusFromExtratoRows([
      {
        date: '2026-06-01',
        description: 'SISPAG FORNECEDORES',
        value: 10.5,
        nature: 'D',
        accountDebit: '3001',
        accountCredit: '1004',
      },
    ]);
    expect(txt).toMatch(/^01\/06\/2026;3001;1004;10,50;/);
  });
});
