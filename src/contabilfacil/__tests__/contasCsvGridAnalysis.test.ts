import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  findDominioPlanoColumns,
  isOleCompoundFile,
  parseBiff8SheetToGrid,
  extractOleWorkbookStream,
  readSpreadsheetGrid,
  parsePlanoDominioExcelGrid,
} from '../logic/dominioPlanoExcel';
import { parsePlanoContasSheet } from '../../extratoVision/utils/planilhaModelo';

const CONTAS = 'P:/Contas.csv';

function rowsWithReduzido(grid: unknown[][]): number {
  let n = 0;
  for (const row of grid) {
    if (!Array.isArray(row)) continue;
    const c0 = String(row[0] ?? '').trim();
    if (/^\d{1,7}$/.test(c0)) n++;
  }
  return n;
}

describe.skipIf(!fs.existsSync(CONTAS))('Contas.csv grid analysis', () => {
  it('compara leitores e contas por código reduzido', () => {
    const bytes = new Uint8Array(fs.readFileSync(CONTAS));
    const grid = readSpreadsheetGrid(bytes);
    const parsed = parsePlanoContasSheet(grid);

    let xlsxRows: unknown[][] = [];
    try {
      const wb = XLSX.read(bytes, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      if (sheet) xlsxRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
    } catch {
      /* ignore */
    }

    let biffRows: unknown[][] = [];
    if (isOleCompoundFile(bytes)) {
      const stream = extractOleWorkbookStream(bytes);
      if (stream) biffRows = parseBiff8SheetToGrid(stream);
    }

    const layout = findDominioPlanoColumns(grid);
    console.log({
      grid: grid.length,
      xlsx: xlsxRows.length,
      biff: biffRows.length,
      reduzidoGrid: rowsWithReduzido(grid),
      reduzidoXlsx: rowsWithReduzido(xlsxRows),
      reduzidoBiff: rowsWithReduzido(biffRows),
      parsed: parsed.length,
      headerRow: layout?.headerRow,
      cols: layout?.cols,
    });

    expect(parsed.length).toBeGreaterThan(100);
    // Todas as linhas com código reduzido devem virar conta
    expect(parsed.length).toBeGreaterThanOrEqual(rowsWithReduzido(grid) - 2);
  });
});
