/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ColumnMapping,
  ColumnRange,
  ExtractedRow,
  GenericExtractedRow,
  PDFTextItem,
} from './types';
import { parseExtratoDataOcrText } from '../ocrExtratoPositional';
import { getOcrDatePropagationMode } from '../ocrCloudRulesStorage';

/** Linha entra no recorte se qualquer parte cruza a faixa — não usa só o centro. */
export function rowIntersectsCropBand(
  row: { y: number; height: number },
  startY: number,
  endY: number,
): boolean {
  const rowTop = row.y;
  const rowBottom = row.y + row.height;
  return rowBottom > startY && rowTop < endY;
}

export function filterRowsInCropBand<T extends { y: number; height: number }>(
  rows: T[],
  startY: number,
  endY: number,
): T[] {
  return rows.filter((row) => rowIntersectsCropBand(row, startY, endY));
}

function horizontalOverlap(aLeft: number, aRight: number, bLeft: number, bRight: number): number {
  return Math.max(0, Math.min(aRight, bRight) - Math.max(aLeft, bLeft));
}

function verticalOverlap(aTop: number, aBottom: number, bTop: number, bBottom: number): number {
  return Math.max(0, Math.min(aBottom, bBottom) - Math.max(aTop, bTop));
}

/** Atribui texto à coluna com maior sobreposição horizontal (não só pelo centro). */
function assignItemToBestColumn(
  item: PDFTextItem,
  columns: Array<{ id: string; startX: number; width: number }>,
  edgeMargin = 3,
): string | null {
  const itemLeft = item.x;
  const itemRight = item.x + item.width;
  let bestId: string | null = null;
  let bestOverlap = 0;
  for (const col of columns) {
    const colRight = col.startX + col.width;
    const overlap = horizontalOverlap(itemLeft, itemRight, col.startX - edgeMargin, colRight + edgeMargin);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestId = col.id;
    }
  }
  return bestOverlap > 0.5 ? bestId : null;
}

/** Atribui texto à linha com maior sobreposição vertical. */
function assignItemToBestRow(
  item: PDFTextItem,
  rowConfigs: { y: number; height: number }[],
  edgeMargin = 4,
): number {
  const itemTop = item.y;
  const itemBottom = item.y + item.height;
  let bestIdx = -1;
  let bestOverlap = 0;
  rowConfigs.forEach((row, idx) => {
    const overlap = verticalOverlap(
      itemTop,
      itemBottom,
      row.y - edgeMargin,
      row.y + row.height + edgeMargin,
    );
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestIdx = idx;
    }
  });
  return bestOverlap > 0.5 ? bestIdx : -1;
}

function extratoRowTemLancamento(row: Pick<ExtractedRow, 'historyText' | 'valueText' | 'parsedValue'>): boolean {
  const hasValue =
    !!(row.valueText?.trim()) ||
    (row.parsedValue != null && Math.abs(row.parsedValue) > 0.0001);
  const hasHist = !!(row.historyText?.trim());
  return hasValue || hasHist;
}

export type ExtractedRowPrunePrefs = {
  removeNoNumericValue?: boolean;
  removeNoHistory?: boolean;
  removeNoDate?: boolean;
};

const PRUNE_STORAGE_PREFIX = 'extrato-row-prune:';

/** Valor monetário real — precisa ter dígito e parse válido (exclui «Agência», «VALORES»). */
export function rowHasNumericValue(
  row: Pick<ExtractedRow, 'valueText' | 'parsedValue'>,
): boolean {
  const v = (row.valueText || '').trim();
  if (!v || !/\d/.test(v)) return false;
  if (row.parsedValue != null && !Number.isNaN(row.parsedValue)) return true;
  const { parsedValue } = analyzeValueString(v);
  return parsedValue != null && !Number.isNaN(parsedValue);
}

export function rowHasMeaningfulHistory(row: Pick<ExtractedRow, 'historyText'>): boolean {
  return (row.historyText || '').trim().length > 0;
}

export function rowHasMeaningfulDate(row: Pick<ExtractedRow, 'dateText'>): boolean {
  const d = (row.dateText || '').trim();
  return d.length > 0 && /\d/.test(d);
}

export function pruneExtractedRows(
  rows: ExtractedRow[],
  prefs: ExtractedRowPrunePrefs,
): ExtractedRow[] {
  return rows.filter((row) => {
    if (prefs.removeNoNumericValue && !rowHasNumericValue(row)) return false;
    if (prefs.removeNoHistory && !rowHasMeaningfulHistory(row)) return false;
    if (prefs.removeNoDate && !rowHasMeaningfulDate(row)) return false;
    return true;
  });
}

export function loadExtractedRowPrunePrefs(storageKey: string): ExtractedRowPrunePrefs {
  if (!storageKey) return {};
  try {
    const raw = sessionStorage.getItem(PRUNE_STORAGE_PREFIX + storageKey);
    return raw ? (JSON.parse(raw) as ExtractedRowPrunePrefs) : {};
  } catch {
    return {};
  }
}

export function clearExtractedRowPrunePrefs(storageKey: string): void {
  if (!storageKey) return;
  try {
    sessionStorage.removeItem(PRUNE_STORAGE_PREFIX + storageKey);
  } catch {
    /* ignore */
  }
}

export function saveExtractedRowPrunePrefs(
  storageKey: string,
  patch: ExtractedRowPrunePrefs,
): ExtractedRowPrunePrefs {
  if (!storageKey) return patch;
  const merged = { ...loadExtractedRowPrunePrefs(storageKey), ...patch };
  try {
    sessionStorage.setItem(PRUNE_STORAGE_PREFIX + storageKey, JSON.stringify(merged));
  } catch {
    /* ignore quota */
  }
  return merged;
}

function resolveExtratoStatementYear(rows: ExtractedRow[], statementYear?: string): string {
  if (statementYear?.trim()) return statementYear.trim();
  const blob = rows.map((r) => r.dateText).join(' ');
  const fromBlob = blob.match(/\b(20\d{2})\b/)?.[1];
  return fromBlob ?? String(new Date().getFullYear());
}

/**
 * Extrato bancário (Bradesco/Itaú etc.): só a 1ª linha do dia traz data na coluna;
 * as demais herdam a última data válida até aparecer outra.
 */
export function propagateExtractedRowDates(
  rows: ExtractedRow[],
  statementYear?: string,
): ExtractedRow[] {
  if (rows.length === 0) return rows;
  if (typeof window !== 'undefined' && getOcrDatePropagationMode() === 'one-per-tx') {
    return rows;
  }

  const year = resolveExtratoStatementYear(rows, statementYear);
  let lastDate = '';

  return rows.map((row) => {
    const parsed = parseExtratoDataOcrText(row.dateText, year);
    if (parsed) {
      lastDate = parsed;
      return parsed !== row.dateText ? { ...row, dateText: parsed } : row;
    }

    if (!lastDate) return row;

    if (extratoRowTemLancamento(row)) {
      return { ...row, dateText: lastDate };
    }

    // Linha só com data (âncora do dia) — mantém lastDate para as próximas.
    return { ...row, dateText: lastDate };
  });
}

/**
 * Groups text items into horizontal rows based on their vertical coordinates.
 */
export function detectRowsFromText(textItems: PDFTextItem[], toleranceY: number = 12): { y: number; height: number; items: PDFTextItem[] }[] {
  if (textItems.length === 0) return [];

  // Sort items primarily by Y coordinate of their center
  const sortedItems = [...textItems].sort((a, b) => {
    const centerY_A = a.y + a.height / 2;
    const centerY_B = b.y + b.height / 2;
    return centerY_A - centerY_B;
  });

  const rows: { y: number; height: number; items: PDFTextItem[] }[] = [];

  sortedItems.forEach((item) => {
    const itemCenterY = item.y + item.height / 2;
    
    // Check if there is an existing row whose center is close to this item's center
    let foundRow = rows.find((r) => {
      const rowCenterY = r.y + r.height / 2;
      return Math.abs(rowCenterY - itemCenterY) <= toleranceY;
    });

    if (foundRow) {
      foundRow.items.push(item);
      // Recalculate average Y, starting X, and max height based on the items in this row
      const minY = Math.min(...foundRow.items.map(i => i.y));
      const maxY = Math.max(...foundRow.items.map(i => i.y + i.height));
      foundRow.y = minY;
      foundRow.height = Math.max(maxY - minY, foundRow.height);
    } else {
      rows.push({
        y: item.y,
        height: item.height,
        items: [item],
      });
    }
  });

  // Post-processing merge: sometimes adjacent lines are still too close.
  // Let's sort the detected rows and merge any rows where distance between centers is very small.
  let mergedRows: typeof rows = [];
  const sortedRows = [...rows].sort((a, b) => a.y - b.y);

  sortedRows.forEach((row) => {
    if (mergedRows.length === 0) {
      mergedRows.push(row);
      return;
    }

    const lastRow = mergedRows[mergedRows.length - 1];
    const lastRowCenter = lastRow.y + lastRow.height / 2;
    const currentRowCenter = row.y + row.height / 2;

    // If the distance between centers is extremely small (e.g. less than 12px), merge them
    if (Math.abs(lastRowCenter - currentRowCenter) < 14) {
      lastRow.items = [...lastRow.items, ...row.items];
      const minY = Math.min(lastRow.y, row.y);
      const maxY = Math.max(lastRow.y + lastRow.height, row.y + row.height);
      lastRow.y = minY;
      lastRow.height = maxY - minY;
    } else {
      mergedRows.push(row);
    }
  });

  // Filter out noise rows (e.g., extremely empty, or rows without enough text spaced out)
  const cleanRows = mergedRows
    .filter((r) => r.items.length > 0)
    .sort((a, b) => a.y - b.y);

  return cleanRows;
}

/**
 * Extracts text and crops images for each column of a row.
 */
export function extractDataFromCanvas(
  canvas: HTMLCanvasElement,
  textItems: PDFTextItem[],
  columns: { date: ColumnRange; history: ColumnRange; value: ColumnRange },
  rowConfigs: { y: number; height: number }[],
  isPercent: boolean = true
): ExtractedRow[] {
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const docWidth = canvas.width;
  const docHeight = canvas.height;

  // Deduplicate text items that have identical text and very close coordinates
  const uniqueTextItems: PDFTextItem[] = [];
  textItems.forEach((item) => {
    const isDuplicate = uniqueTextItems.some((existing) => {
      return (
        existing.text === item.text &&
        Math.abs(existing.x - item.x) < 2 &&
        Math.abs(existing.y - item.y) < 2
      );
    });
    if (!isDuplicate) {
      uniqueTextItems.push(item);
    }
  });

  // Helper to convert column percentage coordinates to pixels
  const getColPixels = (col: ColumnRange) => {
    if (isPercent) {
      return {
        startX: (col.startX / 100) * docWidth,
        width: (col.width / 100) * docWidth,
      };
    }
    return {
      startX: col.startX,
      width: col.width,
    };
  };

  const dateCol = getColPixels(columns.date);
  const histCol = getColPixels(columns.history);
  const valCol = getColPixels(columns.value);

  // Helper function to crop a section of the canvas
  const cropCanvasSection = (
    srcX: number,
    srcY: number,
    srcW: number,
    srcH: number
  ): string => {
    try {
      // Boundaries check
      const x = Math.max(0, Math.min(srcX, docWidth - 1));
      const y = Math.max(0, Math.min(srcY, docHeight - 1));
      const w = Math.max(1, Math.min(srcW, docWidth - x));
      const h = Math.max(1, Math.min(srcH, docHeight - y));

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = w;
      cropCanvas.height = h;
      const cropCtx = cropCanvas.getContext('2d');
      if (!cropCtx) return '';

      cropCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
      return cropCanvas.toDataURL('image/png');
    } catch (e) {
      console.error('Error cropping canvas:', e);
      return '';
    }
  };

  // 1. Group text items by their closest row config to prevent duplicates across rows
  const rowItemsMap = new Map<number, PDFTextItem[]>();
  rowConfigs.forEach((_, idx) => rowItemsMap.set(idx, []));

  uniqueTextItems.forEach((item) => {
    const closestRowIndex = assignItemToBestRow(item, rowConfigs);
    if (closestRowIndex !== -1) {
      rowItemsMap.get(closestRowIndex)!.push(item);
    }
  });

  const rawExtractedRows = rowConfigs.map((row, index) => {
    // Collect the assigned text items for this row index
    const rowItems = rowItemsMap.get(index) || [];

    // Sort items horizontally (left to right)
    rowItems.sort((a, b) => a.x - b.x);

    // 2. Map items to columns by horizontal overlap (precisão nas bordas)
    const dateTextParts: string[] = [];
    const histTextParts: string[] = [];
    const valTextParts: string[] = [];

    const dateColDef = { id: 'date', startX: dateCol.startX, width: dateCol.width };
    const histColDef = { id: 'history', startX: histCol.startX, width: histCol.width };
    const valColDef = { id: 'value', startX: valCol.startX, width: valCol.width };

    rowItems.forEach((item) => {
      const colId = assignItemToBestColumn(item, [dateColDef, histColDef, valColDef]);
      if (colId === 'date') dateTextParts.push(item.text);
      else if (colId === 'history') histTextParts.push(item.text);
      else if (colId === 'value') valTextParts.push(item.text);
    });

    const dateText = dateTextParts.join(' ').trim();
    const historyText = histTextParts.join(' ').trim();
    const valueText = valTextParts.join(' ').trim();

    // 3. Extract exact visual crops - increased verticalPadding to 7 for highest fidelity ("SER FIL")
    const verticalPadding = 7;
    const cropY = row.y - verticalPadding;
    const cropH = row.height + verticalPadding * 2;

    const dateCropUrl = cropCanvasSection(dateCol.startX, cropY, dateCol.width, cropH);
    const historyCropUrl = cropCanvasSection(histCol.startX, cropY, histCol.width, cropH);
    const valueCropUrl = cropCanvasSection(valCol.startX, cropY, valCol.width, cropH);

    // 4. Analyze value (negative vs positive)
    const { isNegative, parsedValue } = analyzeValueString(valueText);

    return {
      id: `row-${index}-${Date.now()}`,
      dateText,
      historyText,
      valueText,
      dateCropUrl,
      historyCropUrl,
      valueCropUrl,
      isNegative,
      parsedValue,
      y: row.y,
      height: row.height,
    };
  });

  // 5. Merge description-only continuation rows into the preceding row
  const mergedExtractedRows: ExtractedRow[] = [];
  rawExtractedRows.forEach((row, index) => {
    if (index === 0) {
      mergedExtractedRows.push(row);
      return;
    }

    const prev = mergedExtractedRows[mergedExtractedRows.length - 1];
    
    // Check if this row is empty of both date and value, but has history text
    const hasValue = row.valueText && row.valueText.trim() !== '';
    const hasDate = row.dateText && row.dateText.trim() !== '';

    if (!hasValue && !hasDate && row.historyText && row.historyText.trim() !== '') {
      // Append history text to previous row
      prev.historyText = `${prev.historyText} ${row.historyText}`.trim();
    } else {
      mergedExtractedRows.push(row);
    }
  });

  return mergedExtractedRows;
}

/**
 * Extrai texto e recortes para N colunas genéricas (plano de contas, balancete, etc.).
 * Mesmo algoritmo de extractDataFromCanvas, sem merge específico de extrato.
 */
export function extractGenericDataFromCanvas(
  canvas: HTMLCanvasElement,
  textItems: PDFTextItem[],
  columnIds: string[],
  columns: ColumnMapping,
  rowConfigs: { y: number; height: number }[],
  pageNumber = 1,
): GenericExtractedRow[] {
  const ctx = canvas.getContext('2d');
  if (!ctx || columnIds.length === 0) return [];

  const docWidth = canvas.width;
  const docHeight = canvas.height;

  const uniqueTextItems: PDFTextItem[] = [];
  textItems.forEach((item) => {
    const isDuplicate = uniqueTextItems.some(
      (existing) =>
        existing.text === item.text &&
        Math.abs(existing.x - item.x) < 2 &&
        Math.abs(existing.y - item.y) < 2,
    );
    if (!isDuplicate) uniqueTextItems.push(item);
  });

  const getColPixels = (col: ColumnRange) => ({
    startX: (col.startX / 100) * docWidth,
    width: (col.width / 100) * docWidth,
  });

  const colPixels = columnIds.map((id) => {
    const col = columns[id] ?? { startX: 0, width: 0 };
    return { id, ...getColPixels(col) };
  });

  const cropCanvasSection = (srcX: number, srcY: number, srcW: number, srcH: number): string => {
    try {
      const x = Math.max(0, Math.min(srcX, docWidth - 1));
      const y = Math.max(0, Math.min(srcY, docHeight - 1));
      const w = Math.max(1, Math.min(srcW, docWidth - x));
      const h = Math.max(1, Math.min(srcH, docHeight - y));
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = w;
      cropCanvas.height = h;
      const cropCtx = cropCanvas.getContext('2d');
      if (!cropCtx) return '';
      cropCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
      return cropCanvas.toDataURL('image/png');
    } catch (e) {
      console.error('Error cropping canvas:', e);
      return '';
    }
  };

  const rowItemsMap = new Map<number, PDFTextItem[]>();
  rowConfigs.forEach((_, idx) => rowItemsMap.set(idx, []));

  uniqueTextItems.forEach((item) => {
    const closestRowIndex = assignItemToBestRow(item, rowConfigs);
    if (closestRowIndex !== -1) {
      rowItemsMap.get(closestRowIndex)!.push(item);
    }
  });

  return rowConfigs.map((row, index) => {
    const rowItems = [...(rowItemsMap.get(index) || [])].sort((a, b) => a.x - b.x);
    const fields: Record<string, string> = {};
    const cropUrls: Record<string, string> = {};
    const partsByCol: Record<string, string[]> = {};
    columnIds.forEach((id) => {
      partsByCol[id] = [];
    });

    rowItems.forEach((item) => {
      const colId = assignItemToBestColumn(item, colPixels);
      if (colId) partsByCol[colId]!.push(item.text);
    });

    const verticalPadding = 7;
    const cropY = row.y - verticalPadding;
    const cropH = row.height + verticalPadding * 2;

    columnIds.forEach((id) => {
      fields[id] = (partsByCol[id] || []).join(' ').trim();
      const col = colPixels.find((c) => c.id === id);
      cropUrls[id] = col ? cropCanvasSection(col.startX, cropY, col.width, cropH) : '';
    });

    return {
      id: `row-${pageNumber}-${index}-${Date.now()}`,
      fields,
      cropUrls,
      y: row.y,
      height: row.height,
      pageNumber,
    };
  });
}

/**
 * Analyzes a monetary value string (Portuguese format) to check if it's positive or negative.
 */
export function analyzeValueString(valStr: string): { isNegative: boolean; parsedValue: number | null } {
  if (!valStr || valStr.trim() === '') {
    return { isNegative: false, parsedValue: null };
  }

  const clean = valStr.toUpperCase().trim();

  // Rules for Brazilian Bank Statements negative values:
  // 1. Contains "-" sign (e.g., -150,00 or 150,00-)
  // 2. Contains "D" or "DÉBITO" or "DEBITO" suffix/prefix (e.g. 150,00 D)
  // 3. Inside parentheses (e.g. (150,00))
  let isNegative = false;
  if (clean.includes('-') || clean.includes('D') || (clean.startsWith('(') && clean.endsWith(')'))) {
    isNegative = true;
  }

  // Parse numeric value
  // Remove currency signs (R$), spacing, dots (thousand separators), and map comma to dot
  try {
    let numericPart = clean
      .replace('R$', '')
      .replace('$', '')
      .replace('C', '')
      .replace('D', '')
      .replace('-', '')
      .replace('(', '')
      .replace(')', '')
      .trim();

    // In Portuguese, "1.250,50" -> "1250.50"
    // Remove dots first, then replace comma with dot
    numericPart = numericPart.replace(/\./g, '').replace(',', '.');
    const parsedValue = parseFloat(numericPart);

    return {
      isNegative,
      parsedValue: isNaN(parsedValue) ? null : (isNegative ? -parsedValue : parsedValue),
    };
  } catch (e) {
    return {
      isNegative,
      parsedValue: null,
    };
  }
}
