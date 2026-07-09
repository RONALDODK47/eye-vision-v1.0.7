/**
 * Extração nativa do PDF A Econômica (Domínio: Código | T | Classificação | Nome | Grau).
 */
import { describe, expect, it, vi } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
}));

import { suggestPlanoContasColumns } from '../../lib/pdfNativeTextItems';
import {
  extractGenericRowsFromMapping,
  mappingGenericoEmCoordsOcr,
  type PosicionadoItem,
} from '../../lib/parcelamentoColunasExtract';
import { mapOcrRowsToImportItemsWithPlanoInfer } from '../logic/ocrImportMapper';

const PDF = 'P:\\Plano de Contas A Economica.pdf';
const pdfDisponivel = existsSync(PDF);

function loadPdfPageItems(pageIndex: number): { items: PosicionadoItem[]; w: number; h: number } {
  const script = 'scripts/dump-pdf-page-items.py';
  const out = execSync(`python "${script}" "${PDF}" ${pageIndex}`, {
    encoding: 'utf8',
    maxBuffer: 20_000_000,
    cwd: process.cwd(),
  });
  return JSON.parse(out) as { items: PosicionadoItem[]; w: number; h: number };
}

function extractPlanoPage(pageIndex: number) {
  const { items, w: refW, h: refH } = loadPdfPageItems(pageIndex);
  const suggested = suggestPlanoContasColumns(items, refW);
  expect(suggested).not.toBeNull();
  const mapping = mappingGenericoEmCoordsOcr(
    suggested!.columns,
    { startY: suggested!.faixaStart, endY: suggested!.faixaEnd },
    refW,
    refH,
    refW,
    refH,
  );
  return extractGenericRowsFromMapping(items, mapping, refH, refW, {
    dataColIds: ['codigoReduzido', 'codigoClassificacao', 'descricao', 'tipo', 'nivel'],
    headerKeywords: ['classifica', 'codigo', 'nome', 'grau'],
    planoPositional: true,
    strictFaixaVertical: true,
  });
}

describe.skipIf(!pdfDisponivel)('Plano A Econômica (PDF Domínio)', () => {
  it('sugere colunas Código, T, Classificação, Nome, Grau', () => {
    const { items, w } = loadPdfPageItems(0);
    const suggested = suggestPlanoContasColumns(items, w);
    expect(suggested).not.toBeNull();
    const ids = suggested!.columns.map((c) => c.id);
    expect(ids).toContain('codigoReduzido');
    expect(ids).toContain('codigoClassificacao');
    expect(ids).toContain('descricao');
    expect(ids).toContain('tipo');
    expect(ids).toContain('nivel');
    const ordered = suggested!.columns
      .filter((c) => !c.id.startsWith('ignorar'))
      .sort((a, b) => a.start - b.start)
      .map((c) => c.id);
    expect(ordered.indexOf('tipo')).toBeLessThan(ordered.indexOf('codigoClassificacao'));
    expect(ordered.indexOf('codigoClassificacao')).toBeLessThan(ordered.indexOf('descricao'));
  });

  it('extrai contas conhecidas da página 1', () => {
    const rows = extractPlanoPage(0);
    const { items } = mapOcrRowsToImportItemsWithPlanoInfer('plano', rows);
    expect(items.length).toBeGreaterThan(40);
    expect(items.some((c) => c.code === '1.1.1.01.00001' && c.name === 'CAIXA GERAL')).toBe(true);
    expect(items.some((c) => c.code === '1' && c.name === 'ATIVO' && c.tipo === 'S')).toBe(true);
    expect(items.some((c) => c.code === '1.1.1.02.00001' && c.name.includes('BANCO DO BRASIL'))).toBe(
      true,
    );
  });

  it('extrai contas de todas as 9 páginas sem duplicar cabeçalho', { timeout: 120_000 }, () => {
    let allRows: ReturnType<typeof extractPlanoPage> = [];
    for (let p = 0; p < 9; p++) {
      allRows = allRows.concat(extractPlanoPage(p));
    }
    const { items } = mapOcrRowsToImportItemsWithPlanoInfer('plano', allRows);
    expect(items.length).toBeGreaterThan(200);
    expect(items.filter((c) => /plano de contas/i.test(c.name))).toHaveLength(0);
    expect(items.some((c) => c.code === '2' && c.name === 'PASSIVO')).toBe(true);
  });
});
