/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ColumnRange,
  ExtractedRow,
  GenericExtractedRow,
  PDFTextItem,
  DocumentColumns,
  ColumnMapping,
} from './types';

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

    // If the distance between centers is extremely small (e.g. less than 14px), merge them
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

  return mergedRows
    .filter((r) => r.items.length > 0)
    .sort((a, b) => a.y - b.y);
}

/**
 * Extracts text and crops images for each column of a row.
 * Esta versão foi substituída pela lógica "cirúrgica" do software de referência.
 */
export function extractDataFromCanvas(
  canvas: HTMLCanvasElement,
  textItems: PDFTextItem[],
  columns: DocumentColumns,
  rowConfigs: { y: number; height: number }[],
  isPercent: boolean = true,
  minY?: number,
  maxY?: number
): ExtractedRow[] {
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const docWidth = canvas.width;
  const docHeight = canvas.height;

  // Deduplicate text items
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

  const cropCanvasSection = (
    srcX: number,
    srcY: number,
    srcW: number,
    srcH: number
  ): string => {
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
    const itemCenterY = item.y + item.height / 2;
    let closestRowIndex = -1;
    let minDistance = Infinity;

    rowConfigs.forEach((row, idx) => {
      const rowCenterY = row.y + row.height / 2;
      const distance = Math.abs(itemCenterY - rowCenterY);
      const isInsideRow = itemCenterY >= row.y - 20 && itemCenterY <= row.y + row.height + 20;

      if (isInsideRow && distance < minDistance) {
        minDistance = distance;
        closestRowIndex = idx;
      }
    });

    if (closestRowIndex !== -1) {
      rowItemsMap.get(closestRowIndex)!.push(item);
    }
  });

  const rawExtractedRows = rowConfigs.map((row, index) => {
    const rowItems = rowItemsMap.get(index) || [];
    const processedRowItems: PDFTextItem[] = [];

    rowItems.forEach((item) => {
      let currentText = item.text;
      let currentX = item.x;
      let currentWidth = item.width;

      // Split Date at start
      const dateMatch = currentText.match(/^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+/);
      if (dateMatch) {
        const dateText = dateMatch[1];
        const dateLen = dateText.length;
        const totalLen = currentText.length;
        const dateWidth = (dateLen / totalLen) * currentWidth;

        processedRowItems.push({
          text: dateText,
          x: currentX,
          y: item.y,
          width: dateWidth,
          height: item.height,
        });

        const consumedLen = dateMatch[0].length;
        currentText = currentText.substring(consumedLen);
        currentX += (consumedLen / totalLen) * currentWidth;
        currentWidth -= (consumedLen / totalLen) * currentWidth;
      }

      // Split Value at end
      const valueMatch = currentText.match(/(-?[0-9][0-9.,]*(?:[0-9]+,[0-9]{2}|,[0-9]{2})\s*[CDcd]?)$/) ||
        currentText.match(/(-?[0-9]+(?:\s*[CDcd]))$/);

      if (valueMatch && valueMatch.index !== undefined && valueMatch.index > 0) {
        const valText = valueMatch[1];
        const valLen = valText.length;
        const totalLen = currentText.length;
        const valIndex = valueMatch.index;

        const prefixLen = valIndex;
        const prefixWidth = (prefixLen / totalLen) * currentWidth;
        const valWidth = (valLen / totalLen) * currentWidth;

        const prefixText = currentText.substring(0, prefixLen).trim();
        if (prefixText) {
          processedRowItems.push({
            text: prefixText,
            x: currentX,
            y: item.y,
            width: prefixWidth,
            height: item.height,
          });
        }

        processedRowItems.push({
          text: valText,
          x: currentX + prefixWidth,
          y: item.y,
          width: valWidth,
          height: item.height,
        });
      } else {
        if (currentText.trim()) {
          processedRowItems.push({
            text: currentText,
            x: currentX,
            y: item.y,
            width: currentWidth,
            height: item.height,
          });
        }
      }
    });

    processedRowItems.sort((a, b) => a.x - b.x);

    const getColumnOverlap = (item: PDFTextItem, col: { startX: number; width: number }) => {
      const itemLeft = item.x;
      const itemRight = item.x + item.width;
      const colLeft = col.startX;
      const colRight = col.startX + col.width;
      const overlapLeft = Math.max(itemLeft, colLeft);
      const overlapRight = Math.min(itemRight, colRight);
      return Math.max(0, overlapRight - overlapLeft);
    };

    // Date Column Assignment
    const rowDateItems = processedRowItems.filter((item) => {
      const itemCenterX = item.x + item.width / 2;
      const dateOverlap = getColumnOverlap(item, dateCol);
      const overlapThreshold = item.width * 0.4;
      const inDateCenter = itemCenterX >= dateCol.startX && itemCenterX <= dateCol.startX + dateCol.width;
      return inDateCenter || (dateOverlap > 0 && dateOverlap >= overlapThreshold);
    });

    // Value Column Assignment
    const valCandidates = processedRowItems.filter((item) => {
      const cleanText = item.text.trim();
      if (!cleanText || !/\d/.test(cleanText)) return false;
      const itemCenterX = item.x + item.width / 2;
      return itemCenterX >= valCol.startX - 5 && itemCenterX <= valCol.startX + valCol.width + 5;
    });
    valCandidates.sort((a, b) => a.x - b.x);

    const rowValItems: PDFTextItem[] = [];
    if (valCandidates.length > 0) {
      rowValItems.push(valCandidates[0]);
      for (let i = 1; i < valCandidates.length; i++) {
        const prevItem = rowValItems[rowValItems.length - 1];
        const currentItem = valCandidates[i];
        const gap = currentItem.x - (prevItem.x + prevItem.width);
        if (gap <= 6) {
          rowValItems.push(currentItem);
        } else {
          break;
        }
      }
    }

    // Sign handling for Value
    if (rowValItems.length > 0) {
      const minValX = rowValItems[0].x;
      const maxValX = rowValItems[rowValItems.length - 1].x + rowValItems[rowValItems.length - 1].width;

      const leftSignItem = processedRowItems.find((item) => {
        const isToLeft = item.x + item.width >= minValX - 20 && item.x + item.width <= minValX + 2;
        const cleanText = item.text.trim();
        return isToLeft && (cleanText === '-' || cleanText === '+');
      });
      if (leftSignItem && !rowValItems.includes(leftSignItem)) {
        rowValItems.unshift(leftSignItem);
      }

      const rightSignItem = processedRowItems.find((item) => {
        const isToRight = item.x >= maxValX - 2 && item.x <= maxValX + 35;
        const cleanText = item.text.trim().toUpperCase();
        const isSign = /^[CDCDcd\-+]$/.test(cleanText) ||
          cleanText === 'DÉBITO' || cleanText === 'DEBITO' ||
          cleanText === 'CRÉDITO' || cleanText === 'CREDITO';
        const hasDigits = /\d/.test(cleanText);
        return isToRight && isSign && !hasDigits;
      });
      if (rightSignItem && !rowValItems.includes(rightSignItem)) {
        rowValItems.push(rightSignItem);
      }
      rowValItems.sort((a, b) => a.x - b.x);
    }

    // History Column Assignment
    const rowHistItems = processedRowItems.filter((item) => {
      if (rowDateItems.includes(item) || rowValItems.includes(item)) return false;
      const itemCenterX = item.x + item.width / 2;
      const histOverlap = getColumnOverlap(item, histCol);
      const overlapThreshold = item.width * 0.4;
      const inHistCenter = itemCenterX >= histCol.startX && itemCenterX <= histCol.startX + histCol.width;

      if (inHistCenter || (histOverlap > 0 && histOverlap >= overlapThreshold)) {
        return true;
      }
      const dateEndX = dateCol.startX + dateCol.width;
      const valStartX = valCol.startX;
      return itemCenterX >= dateEndX && itemCenterX <= valStartX;
    });

    const dateText = rowDateItems.map(i => i.text).join(' ').trim();
    const historyText = rowHistItems.map(i => i.text).join(' ').trim();
    const valueText = rowValItems.map(i => i.text).join(' ').trim();

    // 3. Extract exact visual crops - using dynamic boundaries if we have classified text items
    // This ensures that the cropped image is EXACTLY identical to the extracted text
    const verticalPadding = 7;
    let cropY = row.y - verticalPadding;
    let cropH = row.height + verticalPadding * 2;

    // Enforce strict vertical clipping matching the visual start/end delimiters
    if (minY !== undefined) {
      if (cropY < minY) {
        const diff = minY - cropY;
        cropY = minY;
        cropH = Math.max(1, cropH - diff);
      }
    }
    if (maxY !== undefined) {
      if (cropY + cropH > maxY) {
        cropH = Math.max(1, maxY - cropY);
      }
    }

    // Crop Date Column
    let dateCropUrl = '';
    if (rowDateItems.length > 0) {
      const minX = Math.max(dateCol.startX, Math.min(...rowDateItems.map(i => i.x)));
      const maxX = Math.min(dateCol.startX + dateCol.width, Math.max(...rowDateItems.map(i => i.x + i.width)));
      const cropStartX = Math.max(dateCol.startX, minX - 2);
      const cropEndX = Math.min(dateCol.startX + dateCol.width, maxX + 2);
      dateCropUrl = cropCanvasSection(cropStartX, cropY, Math.max(1, cropEndX - cropStartX), cropH);
    } else {
      dateCropUrl = cropCanvasSection(dateCol.startX, cropY, dateCol.width, cropH);
    }

    // Crop History Column
    let historyCropUrl = '';
    if (rowHistItems.length > 0) {
      const minX = Math.max(histCol.startX, Math.min(...rowHistItems.map(i => i.x)));
      const maxX = Math.min(histCol.startX + histCol.width, Math.max(...rowHistItems.map(i => i.x + i.width)));
      const cropStartX = Math.max(histCol.startX, minX - 2);
      const cropEndX = Math.min(histCol.startX + histCol.width, maxX + 2);
      historyCropUrl = cropCanvasSection(cropStartX, cropY, Math.max(1, cropEndX - cropStartX), cropH);
    } else {
      historyCropUrl = cropCanvasSection(histCol.startX, cropY, histCol.width, cropH);
    }

    // Crop Value Column (Surgically aligned to the extracted value items + sign, strictly within bounds)
    let valueCropUrl = '';
    if (rowValItems.length > 0) {
      const minX = Math.max(valCol.startX, Math.min(...rowValItems.map(i => i.x)));
      const maxX = Math.min(valCol.startX + valCol.width, Math.max(...rowValItems.map(i => i.x + i.width)));
      const cropStartX = Math.max(valCol.startX, minX - 2);
      const cropEndX = Math.min(valCol.startX + valCol.width, maxX + 2);
      valueCropUrl = cropCanvasSection(cropStartX, cropY, Math.max(1, cropEndX - cropStartX), cropH);
    } else {
      valueCropUrl = cropCanvasSection(valCol.startX, cropY, valCol.width, cropH);
    }

    // 4. Analyze value (negative vs positive)
    let { isNegative, parsedValue } = analyzeValueString(valueText);

    // Keep the secondary check just in case, but now that we expand rowValItems, this is a fallback
    const cleanValText = valueText.toUpperCase();
    const isExplicitlyPositive = cleanValText.includes('C') || cleanValText.includes('CRÉDITO') || cleanValText.includes('CREDITO') || cleanValText.includes('+');
    const isExplicitlyNegative = cleanValText.includes('D') || cleanValText.includes('DÉBITO') || cleanValText.includes('DEBITO') || cleanValText.includes('-');

    if (isExplicitlyPositive) {
      isNegative = false;
      if (parsedValue !== null) {
        parsedValue = Math.abs(parsedValue);
      }
    } else if (isExplicitlyNegative) {
      isNegative = true;
      if (parsedValue !== null) {
        parsedValue = -Math.abs(parsedValue);
      }
    } else if (valueText) {
      // If no explicit sign is in valueText, search for a sign item in the vicinity to the right
      const valEndX = valCol.startX + valCol.width;
      const rightItems = processedRowItems.filter((item) => {
        const itemLeft = item.x;
        return itemLeft >= valEndX - 5 && itemLeft <= valEndX + 45;
      });

      // Filter rightItems to look for a sign item (strictly NO digits to avoid grabbing other columns!)
      const signItem = rightItems.find((item) => {
        const cleanText = item.text.toUpperCase().trim();
        const isSign = /^[CDCDcd\-+]$/.test(cleanText) ||
          cleanText === 'DÉBITO' || cleanText === 'DEBITO' ||
          cleanText === 'CRÉDITO' || cleanText === 'CREDITO';
        const hasDigits = /\d/.test(cleanText);
        return isSign && !hasDigits;
      });

      if (signItem) {
        const signText = signItem.text.toUpperCase().trim();
        if (
          signText.includes('-') ||
          /\bD\b/.test(signText) ||
          signText.endsWith('D') ||
          signText.includes('DÉBITO') ||
          signText.includes('DEBITO')
        ) {
          isNegative = true;
          if (parsedValue !== null) {
            parsedValue = -Math.abs(parsedValue);
          }
        } else if (
          signText.includes('+') ||
          /\bC\b/.test(signText) ||
          signText.endsWith('C') ||
          signText.includes('CRÉDITO') ||
          signText.includes('CREDITO')
        ) {
          isNegative = false;
          if (parsedValue !== null) {
            parsedValue = Math.abs(parsedValue);
          }
        }
      }
    }

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

  const mergedExtractedRows: ExtractedRow[] = [];
  rawExtractedRows.forEach((row, index) => {
    if (index === 0) {
      mergedExtractedRows.push(row);
      return;
    }
    const prev = mergedExtractedRows[mergedExtractedRows.length - 1];
    const hasValue = row.valueText && row.valueText.trim() !== '';
    const hasDate = row.dateText && row.dateText.trim() !== '';
    if (!hasValue && !hasDate && row.historyText && row.historyText.trim() !== '') {
      prev.historyText = `${prev.historyText} ${row.historyText}`.trim();
    } else {
      mergedExtractedRows.push(row);
    }
  });

  let lastSeenDate = '';
  mergedExtractedRows.forEach((row) => {
    if (row.dateText && row.dateText.trim() !== '') {
      lastSeenDate = row.dateText.trim();
    } else if (lastSeenDate) {
      row.dateText = lastSeenDate;
    }
  });

  return mergedExtractedRows;
}

/**
 * Versão genérica do extrator de dados para N colunas.
 * Usado por Plano de Contas, Razão Contábil e outros layouts flexíveis.
 */
export function extractGenericDataFromCanvas(
  canvas: HTMLCanvasElement,
  textItems: PDFTextItem[],
  columnIds: string[],
  columns: DocumentColumns | ColumnMapping,
  rowConfigs: { y: number; height: number }[],
  pageNumber?: number,
  isPercent: boolean = true,
): GenericExtractedRow[] {
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const docWidth = canvas.width;
  const docHeight = canvas.height;

  const cropCanvasSection = (
    srcX: number,
    srcY: number,
    srcW: number,
    srcH: number,
  ): string => {
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

  return rowConfigs.map((row, index) => {
    const fields: Record<string, string> = {};
    const cropUrls: Record<string, string> = {};

    const verticalPadding = 2;
    const cropY = Math.max(0, row.y - verticalPadding);
    const cropH = Math.min(docHeight - cropY, row.height + verticalPadding * 2);

    columnIds.forEach((id) => {
      const col = (columns as any)[id];
      if (!col) return;

      const startX = isPercent ? (col.startX / 100) * docWidth : col.startX;
      const width = isPercent ? (col.width / 100) * docWidth : col.width;

      // Extração de texto para esta coluna
      const colText = textItems
        .filter((item) => {
          const itemCenterX = item.x + item.width / 2;
          const itemCenterY = item.y + item.height / 2;
          return (
            itemCenterX >= startX &&
            itemCenterX <= startX + width &&
            itemCenterY >= row.y &&
            itemCenterY <= row.y + row.height
          );
        })
        .map((i) => i.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      fields[id] = colText;
      cropUrls[id] = cropCanvasSection(startX, cropY, width, cropH);
    });

    return {
      id: `row-${index}-${Date.now()}`,
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
  let isNegative = false;
  if (
    clean.includes('-') ||
    /\bD\b/.test(clean) ||
    clean.endsWith('D') ||
    clean.includes('DÉBITO') ||
    clean.includes('DEBITO') ||
    (clean.startsWith('(') && clean.endsWith(')'))
  ) {
    isNegative = true;
  }

  try {
    let numericPart = clean
      .replace(/R\$/g, '')
      .replace(/\$/g, '')
      .replace(/C/g, '')
      .replace(/D/g, '')
      .replace(/-/g, '')
      .replace(/\(/g, '')
      .replace(/\)/g, '')
      .replace(/\s/g, '')
      .trim();

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

/** Utility functions needed by other parts of the system */
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

/**
 * Persistência de linhas removidas (pruned) pelo usuário.
 */
export function loadExtractedRowPrunePrefs(storageKey: string): string[] {
  try {
    const data = localStorage.getItem(`prune::${storageKey}`);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveExtractedRowPrunePrefs(storageKey: string, ids: string[]): void {
  try {
    localStorage.setItem(`prune::${storageKey}`, JSON.stringify(ids));
  } catch (e) {
    console.error('Failed to save prune prefs', e);
  }
}

export function clearExtractedRowPrunePrefs(storageKey: string): void {
  localStorage.removeItem(`prune::${storageKey}`);
}

export function pruneExtractedRows(rows: ExtractedRow[], pruneIds: string[]): ExtractedRow[] {
  if (!pruneIds.length) return rows;
  const set = new Set(pruneIds);
  return rows.filter((r) => !set.has(r.id));
}

/**
 * Propaga a última data válida para linhas com data vazia.
 */
export function propagateExtractedRowDates(rows: ExtractedRow[], stmtYear?: string): ExtractedRow[] {
  let lastDate = '';
  return rows.map((row) => {
    let current = row.dateText?.trim() || '';
    if (current) {
      // Se tiver ano no formato DD/MM e stmtYear for passado, completa
      if (stmtYear && /^\d{2}\/\d{2}$/.test(current)) {
        current = `${current}/${stmtYear}`;
      }
      lastDate = current;
      return { ...row, dateText: current };
    }
    return { ...row, dateText: lastDate };
  });
}
