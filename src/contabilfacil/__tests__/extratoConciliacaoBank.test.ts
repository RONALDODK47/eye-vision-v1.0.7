import { describe, expect, it } from 'vitest';
import {
  countExtratoConciliados,
  countExtratoPendentes,
  filterExtratoByConciliacaoFiltro,
  isExtratoLancamentoConciliado,
  resolveExtratoRowContas,
  syncExtratoConciliacaoStatus,
} from '../logic/extratoConciliacaoBank';

const conciliado = {
  id: '1',
  accountDebit: '3.1.01.01',
  accountCredit: '1.1.1.01',
  nature: 'D' as const,
  value: 100,
};

const pendente = {
  id: '2',
  accountDebit: '1.1.1.01',
  accountCredit: '',
  nature: 'C' as const,
  value: 50,
};

describe('extratoConciliacaoBank', () => {
  it('resolve contas D/C com fallback legado em accountCode', () => {
    // Entrada (C): accountCode = banco no débito
    expect(
      resolveExtratoRowContas({
        id: 'x',
        nature: 'C',
        accountCode: '1.1.1.01',
        accountDebit: '',
        accountCredit: '',
      }),
    ).toEqual({ accountDebit: '1.1.1.01', accountCredit: '' });
    // Saída (D): accountCode = banco no crédito
    expect(
      resolveExtratoRowContas({
        id: 'y',
        nature: 'D',
        accountCode: '1.1.1.01',
        accountDebit: '',
        accountCredit: '',
      }),
    ).toEqual({ accountDebit: '', accountCredit: '1.1.1.01' });
  });

  it('identifica conciliado somente com débito e crédito', () => {
    expect(isExtratoLancamentoConciliado(conciliado)).toBe(true);
    expect(isExtratoLancamentoConciliado(pendente)).toBe(false);
  });

  it('filtra por status de conciliação', () => {
    const rows = [conciliado, pendente];
    expect(filterExtratoByConciliacaoFiltro(rows, 'todas')).toHaveLength(2);
    expect(filterExtratoByConciliacaoFiltro(rows, 'conciliadas')).toHaveLength(1);
    expect(filterExtratoByConciliacaoFiltro(rows, 'pendentes')).toHaveLength(1);
    expect(countExtratoConciliados(rows)).toBe(1);
    expect(countExtratoPendentes(rows)).toBe(1);
  });

  it('sincroniza status CONCILIADO/PENDENTE', () => {
    const synced = syncExtratoConciliacaoStatus([conciliado, pendente]);
    expect(synced[0].status).toBe('CONCILIADO');
    expect(synced[1].status).toBe('PENDENTE');
  });
});
