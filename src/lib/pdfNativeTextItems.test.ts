import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  pdfNativeItemsLookLikeExtrato,
  pdfPageToPosicionadoItems,
  suggestExtratoBancarioColumns,
} from './pdfNativeTextItems';
import { extractGenericRowsFromMapping, mappingGenericoEmCoordsOcr } from './parcelamentoColunasExtract';

const BRADESCO_PDF = String.raw`p:\EMPRESAS\ATIVAS\LUCRO REAL\Carol Alimentos e Utilidades Ltda\RECORRENTE\2026\CONTABIL\DOCUMENTOS CONTABEIS\04-2026\Bradesco_04052026_142621.PDF`;

describe.skip('pdfNativeTextItems — Bradesco (parser nativo desativado)', () => {
  it.skipIf(!fs.existsSync(BRADESCO_PDF))(
    'extrai lançamentos com texto nativo e colunas sugeridas',
    async () => {
      const buf = fs.readFileSync(BRADESCO_PDF);
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
      const page = await doc.getPage(1);
      const scale = 2;
      const { items, imgWidth, imgHeight } = await pdfPageToPosicionadoItems(page, scale);

      expect(items.length).toBeGreaterThan(80);
      expect(pdfNativeItemsLookLikeExtrato(items)).toBe(true);

      const suggested = suggestExtratoBancarioColumns(items, imgWidth);
      expect(suggested).not.toBeNull();
      expect(suggested!.columns.some((c) => c.id === 'data')).toBe(true);
      expect(suggested!.columns.some((c) => c.id === 'valorCredito')).toBe(true);
      expect(suggested!.columns.some((c) => c.id === 'valorDebito')).toBe(true);

      const saldoAnt = items.find((it) => /saldo\s+anterior/i.test(it.str));
      if (saldoAnt) {
        expect(suggested!.faixaStart).toBeLessThanOrEqual(saldoAnt.y + 2);
      }
      const dataCol = suggested!.columns.find((c) => c.id === 'data');
      const debCol = suggested!.columns.find((c) => c.id === 'valorDebito');
      expect(dataCol && debCol && dataCol.end < debCol.start).toBe(true);

      const mapping = mappingGenericoEmCoordsOcr(
        suggested!.columns,
        { startY: suggested!.faixaStart, endY: suggested!.faixaEnd },
        imgWidth,
        imgHeight,
        imgWidth,
        imgHeight,
      );
      const rows = extractGenericRowsFromMapping(items, mapping, imgHeight, imgWidth, {
        dataColIds: ['data', 'descricao', 'valorCredito', 'valorDebito', 'valorMisto'],
        headerKeywords: ['saldo anterior', 'data', 'lançamento', 'crédito', 'débito'],
        allowFaixaFallback: true,
        extratoPositional: true,
        statementYear: '2026',
      });

      expect(rows.length).toBeGreaterThan(5);
      const comValor = rows.filter(
        (r) =>
          (r.valorCredito && parseFloat(r.valorCredito.replace(/\./g, '').replace(',', '.')) > 0) ||
          (r.valorDebito && parseFloat(r.valorDebito.replace(/\./g, '').replace(',', '.')) > 0),
      );
      expect(comValor.length).toBeGreaterThan(3);
    },
    60_000,
  );
});
