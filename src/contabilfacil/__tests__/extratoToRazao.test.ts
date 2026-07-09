import { describe, expect, it } from 'vitest';
import {
  buildRazaoFromExtratoLancamentos,
  EXTRATO_RAZAO_MARCA,
  isExtratoRazaoRow,
  mergeExtratoRazaoComExistente,
} from '../logic/extratoToRazao';

describe('extratoToRazao', () => {
  it('gera duas linhas de razão por movimento conciliado', () => {
    const { rows, gerados } = buildRazaoFromExtratoLancamentos([
      {
        id: 'a',
        date: '15/01/2026',
        description: 'TED RECEBIDA',
        value: 1000,
        nature: 'C',
        accountDebit: '1.1.1.01',
        accountCredit: '2.1.1.05',
        operationName: 'RECEBIMENTO',
      },
    ]);
    expect(gerados).toBe(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].debito).toBe(1000);
    expect(rows[1].credito).toBe(1000);
    expect(rows[0].nome).toContain(`${EXTRATO_RAZAO_MARCA}|a|`);
    expect(isExtratoRazaoRow(rows[0])).toBe(true);
  });

  it('converte data ISO do extrato para DD/MM/AAAA (não vira 2001)', () => {
    const { rows, gerados } = buildRazaoFromExtratoLancamentos([
      {
        id: 'iso',
        date: '2026-06-01',
        description: 'PIX',
        value: 2764.41,
        nature: 'C',
        accountDebit: '1.1.1.01',
        accountCredit: '4.1.1.01',
      },
    ]);
    expect(gerados).toBe(1);
    expect(rows[0].data).toBe('01/06/2026');
    expect(rows[1].data).toBe('01/06/2026');
    expect(rows[0].data).not.toBe('26/06/2001');
  });

  it('ignora linhas sem contas D/C completas', () => {
    const { rows, gerados } = buildRazaoFromExtratoLancamentos([
      {
        id: 'b',
        date: '15/01/2026',
        description: 'SEM CONTA',
        value: 100,
        nature: 'D',
        accountDebit: '1.1.1.01',
        accountCredit: '',
      },
    ]);
    expect(gerados).toBe(0);
    expect(rows).toHaveLength(0);
  });

  it('substitui lançamentos do extrato anteriores no merge', () => {
    const existente = [
      {
        codigo: '1',
        classificacao: '1.1.1.01',
        nome: `${EXTRATO_RAZAO_MARCA}|antigo|X`,
        debito: 1,
        credito: 0,
        saldoInicial: 0,
        saldoFinal: 0,
      },
      {
        codigo: '9',
        classificacao: 'MANUAL',
        nome: 'Y',
        debito: 2,
        credito: 0,
        saldoInicial: 0,
        saldoFinal: 0,
      },
    ];
    const { rows: novos } = buildRazaoFromExtratoLancamentos([
      {
        id: 'novo',
        date: '01/02/2026',
        description: 'NOVO',
        value: 10,
        nature: 'D',
        accountDebit: '3.1',
        accountCredit: '1.1',
      },
    ]);
    const merged = mergeExtratoRazaoComExistente(existente, novos);
    expect(merged.filter(isExtratoRazaoRow)).toHaveLength(2);
    expect(merged.filter((r) => r.classificacao === 'MANUAL')).toHaveLength(1);
    expect(merged.some((r) => r.nome?.includes('|novo|'))).toBe(true);
    expect(merged.some((r) => r.nome?.includes('|antigo|'))).toBe(false);
  });
});
