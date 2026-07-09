import { describe, expect, it } from 'vitest';
import type { VisionBalanceteRow } from '../../extratoVision/types/accounting';
import {
  consolidarBalanceteParaNota,
  extractNotaDadosFromBalancete,
  parseBalanceteTextLines,
} from './notaExplicativaBalanceteImport';
import { parseBalanceteSheet } from '../../extratoVision/utils/planilhaModelo';

function row(partial: Partial<VisionBalanceteRow>): VisionBalanceteRow {
  return {
    codigo: '',
    classificacao: '',
    nome: '',
    saldoInicial: 0,
    debito: 0,
    credito: 0,
    saldoFinal: 0,
    ...partial,
  };
}

describe('notaExplicativaBalanceteImport', () => {
  it('extrai receita, PL, capital e endividamento de balancete sintético', () => {
    const balancete: VisionBalanceteRow[] = [
      row({
        codigo: '301',
        classificacao: '3.1.1.01.00001',
        nome: 'RECEITA DE SERVICOS',
        credito: 500_000,
        debito: 0,
        saldoFinal: 500_000,
        naturezaSaldoFinal: 'C',
        tipo: 'A',
      }),
      row({
        codigo: '2301',
        classificacao: '2.3.1.01.00001',
        nome: 'CAPITAL SOCIAL',
        saldoFinal: 100_000,
        naturezaSaldoFinal: 'C',
        tipo: 'A',
      }),
      row({
        codigo: '2309',
        classificacao: '2.3.9.01.00001',
        nome: 'LUCROS ACUMULADOS',
        saldoFinal: 50_000,
        naturezaSaldoFinal: 'C',
        tipo: 'A',
      }),
      row({
        codigo: '2106',
        classificacao: '2.1.1.01.00001',
        nome: 'EMPRESTIMOS BANCARIOS',
        saldoFinal: 30_000,
        naturezaSaldoFinal: 'C',
        tipo: 'A',
      }),
      row({
        codigo: '2201',
        classificacao: '2.2.1.01.00001',
        nome: 'FINANCIAMENTO DE VEICULOS',
        saldoFinal: 80_000,
        naturezaSaldoFinal: 'C',
        tipo: 'A',
      }),
      row({
        classificacao: '2.3',
        nome: 'PATRIMONIO LIQUIDO',
        saldoFinal: 150_000,
        naturezaSaldoFinal: 'C',
        tipo: 'S',
      }),
    ];

    const result = extractNotaDadosFromBalancete(balancete);

    expect(result.patch.receitaBrutaExercicio).toBe('500.000,00');
    expect(result.patch.patrimonioLiquido).toBe('150.000,00');
    expect(result.patch.capitalSocial).toBe('100.000,00');
    expect(result.patch.possuiEmprestimos).toBe(true);
    expect(result.patch.saldoEmprestimosCP).toBe('30.000,00');
    expect(result.patch.possuiFinanciamentos).toBe(true);
    expect(result.patch.saldoFinanciamentosLP).toBe('80.000,00');
    expect(result.patch.tiposEndividamento).toContain('emprestimo_bancario');
  });

  it('consolida razão por conta antes de extrair', () => {
    const razao: VisionBalanceteRow[] = [
      row({
        codigo: '301',
        classificacao: '3.1.1.01.00001',
        nome: 'Receita de serviços',
        data: '10/01/2025',
        debito: 0,
        credito: 100_000,
      }),
      row({
        codigo: '301',
        classificacao: '3.1.1.01.00001',
        nome: 'Receita de serviços',
        data: '20/06/2025',
        debito: 0,
        credito: 50_000,
      }),
    ];

    const consolidado = consolidarBalanceteParaNota(razao);
    expect(consolidado.length).toBe(1);
    expect(consolidado[0].credito).toBe(150_000);

    const result = extractNotaDadosFromBalancete(razao);
    expect(result.patch.receitaBrutaExercicio).toBe('150.000,00');
    expect(result.exercicioDetectado).toBe('2025');
  });

  it('parseBalanceteSheet lê colunas de saldo Domínio', () => {
    const grid = [
      ['Código', 'Classificação', 'Conta', 'Saldo Anterior', 'Débito', 'Crédito', 'Saldo Atual'],
      ['1106', '2.1.1.01.00001', 'EMPRESTIMOS', '0,00', '0,00', '0,00', '15.000,00 C'],
      ['301', '3.1.1.01.00001', 'RECEITAS', '0,00', '0,00', '200.000,00', '200.000,00 C'],
    ];
    const rows = parseBalanceteSheet(grid);
    expect(rows).toHaveLength(2);
    expect(rows[0].saldoFinal).toBe(15_000);
    expect(rows[0].naturezaSaldoFinal).toBe('C');
    expect(rows[1].credito).toBe(200_000);
  });

  it('parseBalanceteTextLines interpreta linha de relatório', () => {
    const lines = [
      '0001106 2.1.1.01.00001 EMPRESTIMOS BANCARIOS 0,00 5.000,00 0,00 5.000,00 D',
    ];
    const rows = parseBalanceteTextLines(lines);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].classificacao).toBe('2.1.1.01.00001');
  });
});
