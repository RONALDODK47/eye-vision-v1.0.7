import { describe, expect, it } from 'vitest';
import {
  isPlanoDominioExcelGrid,
  parsePlanoDominioExcelGrid,
} from '../logic/dominioPlanoExcel';

/** Grade sintética no layout Domínio (como Contas.xls / A Econômica). */
function gridDominioFixture(): unknown[][] {
  const rows: unknown[][] = [
    ['Empresa:', '', '', '', '', 'A ECONOMICA COMERCIO LTDA'],
    ['C.N.P.J.:', '', '', '', '', '44.854.551/0001-98'],
    ['PLANO DE CONTAS'],
    [],
    ['', 'Código', '', 'T', '', '', '', 'Classificação', '', '', '', 'Nome', '', '', '', '', '', '', '', '', '', 'Grau'],
  ];
  const data: Array<[number, string, string, string, number, string]> = [
    [1, 'S', '1', 1, 'ATIVO'],
    [2, 'S', '1.1', 2, 'ATIVO CIRCULANTE'],
    [3, 'S', '1.1.1', 3, 'DISPONÍVEL'],
    [4, 'S', '1.1.1.01', 4, 'CAIXA'],
    [5, '', '1.1.1.01.00001', 5, 'CAIXA GERAL'],
    [1000, '', '1.1.2.01.00001', 5, 'CLIENTES DIVERSOS'],
  ];
  for (const [cod, tipo, classif, grau, nome] of data) {
    const row = new Array(23).fill('');
    row[0] = cod;
    row[3] = tipo;
    row[7] = classif;
    row[11 + Math.max(0, grau - 1)] = nome;
    row[21] = grau;
    rows.push(row);
  }
  return rows;
}

describe('dominioPlanoExcel', () => {
  it('detecta grade Domínio pelo cabeçalho PLANO DE CONTAS', () => {
    expect(isPlanoDominioExcelGrid(gridDominioFixture())).toBe(true);
  });

  it('importa classificação, nome, tipo e código reduzido', () => {
    const rows = parsePlanoDominioExcelGrid(gridDominioFixture());
    expect(rows.length).toBeGreaterThanOrEqual(6);
    const caixa = rows.find((r) => r.codigo === '1.1.1.01.00001');
    expect(caixa).toMatchObject({
      nome: 'CAIXA GERAL',
      tipo: 'A',
      codigoReduzido: '5',
      nivel: 5,
    });
    const ativo = rows.find((r) => r.codigo === '1');
    expect(ativo?.nome).toBe('ATIVO');
    expect(ativo?.tipo).toBe('S');
  });
});

import fs from 'node:fs';
import { parsePlanoContasSheet } from '../../extratoVision/utils/planilhaModelo';
import { readSpreadsheetGrid } from '../logic/dominioPlanoExcel';

const CONTAS_DOMINIO = 'P:/Contas.csv';
const contasDisponivel = fs.existsSync(CONTAS_DOMINIO);

describe.skipIf(!contasDisponivel)('dominioPlanoExcel — arquivo real Contas.csv', () => {
  it('lê exportação Domínio A Econômica com centenas de contas', () => {
    const bytes = new Uint8Array(fs.readFileSync(CONTAS_DOMINIO));
    const grid = readSpreadsheetGrid(bytes);
    expect(grid.length).toBeGreaterThan(50);
    const rows = parsePlanoContasSheet(grid);
    expect(rows.length).toBeGreaterThan(400);
    expect(rows.length).toBeGreaterThanOrEqual(460);
    expect(rows.some((r) => r.nome.includes('CAIXA GERAL'))).toBe(true);
    expect(rows.some((r) => r.codigo === '1.1.1.01.00001')).toBe(true);
  });
});
