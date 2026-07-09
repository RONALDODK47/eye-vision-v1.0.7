import { describe, expect, it } from 'vitest';
import {
  buildRazaoFromExtratoConciliation,
  countExtratoConciliationPending,
} from '../../extratoVision/utils/extratoConciliationToRazao';
import type { Transaction } from '../../extratoVision/types';

const txs: Transaction[] = [
  {
    id: 'a',
    data: '15/01/2026',
    historico: 'TED RECEBIDA',
    valor: 1000,
    cd: 'C',
  },
];

describe('extratoConciliationToRazao', () => {
  it('gera duas linhas de razão por movimento conciliado', () => {
    const rows = buildRazaoFromExtratoConciliation(txs, {
      a: { contaDebito: '1.1.1.01', contaCredito: '2.1.1.05', historicoOperacao: 'RECEBIMENTO' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].debito).toBe(1000);
    expect(rows[0].credito).toBe(0);
    expect(rows[1].credito).toBe(1000);
    expect(rows[0].nome).toBe('RECEBIMENTO');
  });

  it('ignora linhas sem contas D/C', () => {
    const rows = buildRazaoFromExtratoConciliation(txs, {
      a: { contaDebito: '1.1.1.01', contaCredito: '', historicoOperacao: '' },
    });
    expect(rows).toHaveLength(0);
    expect(countExtratoConciliationPending(txs, { a: { contaDebito: '1', contaCredito: '', historicoOperacao: '' } })).toBe(1);
  });
});
