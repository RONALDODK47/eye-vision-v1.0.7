import { describe, expect, it } from 'vitest';
import {
  dataTypeSupportsExcelImport,
  downloadExcelModeloForDataType,
  EXCEL_IMPORT_DATA_TYPES,
} from '../logic/ingestExcelModelo';
import {
  parseAplicacoesSheet,
  parseEmprestimosSheet,
} from '../../extratoVision/utils/planilhaModelo';

describe('ingestExcelModelo', () => {
  it('lista módulos com importação Excel', () => {
    expect(EXCEL_IMPORT_DATA_TYPES).toEqual([
      'extrato',
      'plano',
      'balancete',
      'installments',
      'loans',
      'apps',
    ]);
    expect(dataTypeSupportsExcelImport('plano')).toBe(true);
    expect(dataTypeSupportsExcelImport('folha')).toBe(false);
  });

  it('expõe download por módulo sem lançar', () => {
    for (const dt of EXCEL_IMPORT_DATA_TYPES) {
      expect(() => downloadExcelModeloForDataType(dt)).not.toThrow();
    }
  });
});

describe('parseEmprestimosSheet', () => {
  it('lê planilha modelo de contratos', () => {
    const rows = [
      [
        'Empresa',
        'Contrato',
        'Tipo',
        'Principal',
        'Taxa (%)',
        'Parcelas',
        'Data Início',
        'Carência (meses)',
        'Tipo Carência',
        'Indexador',
        'IOF',
        'Custos',
      ],
      [
        'TECHNOVA INDUSTRIAL LTDA',
        '2026-CCB-402',
        'SAC',
        '150000',
        '11.5',
        '24',
        '2026-05-15',
        '3',
        'capitalized',
        'CDI',
        '2840',
        '120',
      ],
    ];
    const items = parseEmprestimosSheet(rows);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      companyName: 'TECHNOVA INDUSTRIAL LTDA',
      contractNumber: '2026-CCB-402',
      type: 'SAC',
      principal: 150000,
      installments: 24,
      indexType: 'CDI',
    });
  });
});

describe('parseAplicacoesSheet', () => {
  it('lê planilha modelo de aplicações', () => {
    const rows = [
      ['Nome Ativo', 'Valor Aplicado', 'Taxa (%)', 'Indexador', 'Data Aplicação'],
      ['CDB DI LIQUIDEZ DIÁRIA ITAÚ', '95000', '100', 'CDI', '2026-01-10'],
    ];
    const items = parseAplicacoesSheet(rows);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: 'CDB DI LIQUIDEZ DIÁRIA ITAÚ',
      amount: 95000,
      index: 'CDI',
      startDate: '2026-01-10',
    });
  });
});
