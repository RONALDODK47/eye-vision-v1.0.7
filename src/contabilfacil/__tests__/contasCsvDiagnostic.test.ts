import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  findDominioPlanoColumns,
  isPlanoDominioExcelGrid,
  parsePlanoDominioExcelGrid,
  readSpreadsheetGrid,
} from '../logic/dominioPlanoExcel';
import { parsePlanoContasSheet } from '../../extratoVision/utils/planilhaModelo';

const CONTAS = 'P:/Contas.csv';

function countClassificationsInGrid(rows: unknown[][]): number {
  const layout = findDominioPlanoColumns(rows);
  if (!layout) return 0;
  const { headerRow, cols } = layout;
  let n = 0;
  for (let ri = headerRow + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!Array.isArray(row)) continue;
    const classificacao = String(row[cols.classificacao] ?? '').trim();
    if (/^\d+(\.\d+)*$/.test(classificacao.replace(/\s/g, ''))) n++;
  }
  return n;
}

describe.skipIf(!fs.existsSync(CONTAS))('Contas.csv diagnostic', () => {
  it('importa todas as linhas com classificação válida', () => {
    const bytes = new Uint8Array(fs.readFileSync(CONTAS));
    const grid = readSpreadsheetGrid(bytes);
    const expected = countClassificationsInGrid(grid);
    const parsed = parsePlanoContasSheet(grid);
    console.log({ gridRows: grid.length, expected, parsed: parsed.length });
    expect(isPlanoDominioExcelGrid(grid)).toBe(true);
    expect(parsed.length).toBe(expected);
  });

  it('lista linhas com classificação mas sem nome (perdidas)', () => {
    const bytes = new Uint8Array(fs.readFileSync(CONTAS));
    const grid = readSpreadsheetGrid(bytes);
    const layout = findDominioPlanoColumns(grid);
    expect(layout).not.toBeNull();
    const { headerRow, cols } = layout!;
    const perdidas: string[] = [];
    const parsedCodes = new Set(parsePlanoContasSheet(grid).map((r) => r.codigo));
    for (let ri = headerRow + 1; ri < grid.length; ri++) {
      const row = grid[ri];
      if (!Array.isArray(row)) continue;
      const classificacao = String(row[cols.classificacao] ?? '').trim();
      if (!/^\d+(\.\d+)*$/.test(classificacao.replace(/\s/g, ''))) continue;
      if (!parsedCodes.has(classificacao)) {
        perdidas.push(`${ri}:${classificacao}`);
      }
    }
    console.log('perdidas', perdidas.length, perdidas.slice(0, 20));
    expect(perdidas).toEqual([]);
  });
});
