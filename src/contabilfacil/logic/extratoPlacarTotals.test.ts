import { describe, expect, it } from 'vitest';
import {
  calcExtratoSaldoConciliado,
  calcSaldoConciliadoAteMomento,
  resolveSaldoFinalExtrato,
  sumExtratoPlacarTotais,
} from './extratoPlacarTotals';

describe('extratoPlacarTotals', () => {
  it('soma créditos e débitos com Math.abs e ignora saldo informativo', () => {
    const { creditos, debitos, lancamentosConsiderados } = sumExtratoPlacarTotais([
      { id: '1', date: '2026-04-01', description: 'PIX', value: 100, nature: 'C' },
      { id: '2', date: '2026-04-02', description: 'TED', value: -50.05, nature: 'D' },
      { id: '3', date: '2026-04-01', description: 'SALDO ANTERIOR', value: 40844.13, nature: 'C' },
    ]);
    expect(creditos).toBe(100);
    expect(debitos).toBe(50.05);
    expect(lancamentosConsiderados).toBe(2);
  });

  it('deduplica lançamentos repetidos', () => {
    const row = { date: '2026-04-01', description: 'PIX', value: 10, nature: 'C' as const };
    const t = sumExtratoPlacarTotais([row, row]);
    expect(t.creditos).toBe(10);
    expect(t.lancamentosConsiderados).toBe(1);
  });

  it('calcExtratoSaldoConciliado', () => {
    expect(calcExtratoSaldoConciliado(40_844.13, 100, 50)).toBeCloseTo(40_894.13, 2);
  });

  it('calcSaldoConciliadoAteMomento usa só linhas com D+C', () => {
    const rows = [
      {
        id: '1',
        date: '2026-04-01',
        description: 'PIX',
        value: 100,
        nature: 'C' as const,
        accountDebit: '101',
        accountCredit: '201',
      },
      {
        id: '2',
        date: '2026-04-02',
        description: 'TED',
        value: 50,
        nature: 'D' as const,
      },
    ];
    expect(calcSaldoConciliadoAteMomento(1000, rows)).toBe(1100);
  });

  it('calcSaldoConciliadoAteMomento fica 0 sem nenhum conciliado (não repete saldo anterior/final)', () => {
    const rows = [
      {
        id: '1',
        date: '2026-04-01',
        description: 'PIX',
        value: 100,
        nature: 'C' as const,
      },
      {
        id: '2',
        date: '2026-04-02',
        description: 'TED',
        value: 50,
        nature: 'D' as const,
        accountDebit: '1000',
        accountCredit: '1000',
      },
    ];
    expect(calcSaldoConciliadoAteMomento(6268.75, rows)).toBe(0);
    expect(calcSaldoConciliadoAteMomento(6268.75, [])).toBe(0);
  });

  it('resolveSaldoFinalExtrato sempre calcula (nunca OCR/arquivo)', () => {
    expect(
      resolveSaldoFinalExtrato({
        saldoAnterior: 1000,
        creditos: 100,
        debitos: 50,
        saldoFinalArquivo: 2000,
      }),
    ).toEqual({ valor: 1050, origem: 'calculado' });
    expect(
      resolveSaldoFinalExtrato({
        saldoAnterior: 1000,
        creditos: 100,
        debitos: 50,
      }),
    ).toEqual({ valor: 1050, origem: 'calculado' });
  });

  it('sem natureza usa sinal do valor (negativo = débito)', () => {
    const t = sumExtratoPlacarTotais([
      { id: '1', description: 'ENTRADA', value: 200 },
      { id: '2', description: 'SAIDA', value: -80 },
    ]);
    expect(t.creditos).toBe(200);
    expect(t.debitos).toBe(80);
    expect(t.lancamentosConsiderados).toBe(2);
  });
});
