import { suggestRazaoDominioColumns } from '../pdfNativeTextItems';
import type { PosicionadoItem } from '../parcelamentoColunasExtract';
import { genericColumnsToPercentMapping } from './layoutBridge';
import type { ColumnMapping, PDFTextItem } from './types';

export function toPosicionadoItems(textItems: PDFTextItem[]): PosicionadoItem[] {
  return textItems.map((t) => ({ str: t.text, x: t.x, y: t.y, w: t.width, h: t.height }));
}

export type RazaoColPixel = { id: string; startX: number; endX: number; width: number };

export function mappingToRazaoColPixels(
  columns: ColumnMapping,
  columnIds: string[],
  imgWidth: number,
): RazaoColPixel[] {
  return columnIds
    .filter((id) => columns[id])
    .map((id) => {
      const col = columns[id]!;
      const startX = (col.startX / 100) * imgWidth;
      const endX = ((col.startX + col.width) / 100) * imgWidth;
      return { id, startX, endX, width: endX - startX };
    });
}

function fracInColumn(
  item: PDFTextItem,
  colLeft: number,
  colRight: number,
  pad: number,
): number {
  const overlap = Math.max(
    0,
    Math.min(item.x + item.width, colRight + pad) - Math.max(item.x, colLeft - pad),
  );
  if (overlap <= 0) return 0;
  return overlap / Math.max(item.width, 1);
}

export function itemInRazaoColumn(
  item: PDFTextItem,
  colLeft: number,
  colRight: number,
  imgWidth: number,
): boolean {
  const pad = Math.min(6, Math.max(1.5, imgWidth * 0.003));
  if (fracInColumn(item, colLeft, colRight, pad) >= 0.42) return true;
  const cx = item.x + item.width / 2;
  return cx >= colLeft + pad * 0.5 && cx <= colRight - pad * 0.5;
}

export function assignRazaoRowTokens(
  rowItems: PDFTextItem[],
  colPixels: RazaoColPixel[],
  imgWidth: number,
  columnIds: string[],
): Record<string, string[]> {
  const parts: Record<string, string[]> = {};
  columnIds.forEach((id) => {
    parts[id] = [];
  });
  const sorted = [...rowItems].sort((a, b) => a.x - b.x);
  for (const item of sorted) {
    const cx = item.x + item.width / 2;
    let bestId: string | null = null;

    // 1. Encontra se o centro do item está contido na coluna (sem padding, maior precisão)
    for (const col of colPixels) {
      if (cx >= col.startX && cx <= col.endX) {
        bestId = col.id;
        break;
      }
    }

    // 2. Se o centro não estiver contido, usamos a maior fração de sobreposição
    if (!bestId) {
      let bestFrac = 0;
      for (const col of colPixels) {
        const frac = fracInColumn(item, col.startX, col.endX, Math.min(6, imgWidth * 0.003));
        if (frac > bestFrac) {
          bestFrac = frac;
          bestId = col.id;
        }
      }
      if (bestFrac < 0.35) {
        bestId = null;
      }
    }

    if (bestId) {
      parts[bestId]!.push(item.text.trim());
    }
  }
  return parts;
}

export function resolveRazaoColumnsForPage(
  textItems: PDFTextItem[],
  imgWidth: number,
  columnIds: string[],
  templateColumns: ColumnMapping,
): ColumnMapping {
  if (imgWidth <= 0 || textItems.length < 10) return templateColumns;
  const suggested = suggestRazaoDominioColumns(toPosicionadoItems(textItems), imgWidth);
  if (!suggested?.columns.some((c) => c.start !== c.end)) return templateColumns;
  const mapped = genericColumnsToPercentMapping(suggested.columns, imgWidth);
  const out: ColumnMapping = { ...templateColumns };
  for (const id of columnIds) {
    if (mapped[id]) out[id] = mapped[id]!;
  }
  for (const col of suggested.columns) {
    if (col.id.startsWith('ignorar') && mapped[col.id]) {
      out[col.id] = mapped[col.id]!;
    }
  }
  return out;
}
