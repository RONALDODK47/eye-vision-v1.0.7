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

  const sortedItems = [...textItems].sort((a, b) => {
    const centerY_A = a.y + a.height / 2;
    const centerY_B = b.y + b.height / 2;
    return centerY_A - centerY_B;
  });

  const rows: { y: number; height: number; items: PDFTextItem[] }[] = [];

  const verticalOverlap = (item: PDFTextItem, row: { y: number; height: number }) => {
    const itemTop = item.y;
    const itemBottom = item.y + item.height;
    const rowTop = row.y;
    const rowBottom = row.y + row.height;
    return Math.max(0, Math.min(itemBottom, rowBottom) - Math.max(itemTop, rowTop));
  };

  sortedItems.forEach((item) => {
    const itemCenterY = item.y + item.height / 2;
    const itemTop = item.y;
    const itemBottom = item.y + item.height;

    let foundRow = rows.find((r) => {
      const rowCenterY = r.y + r.height / 2;
      const overlap = verticalOverlap(item, r);
      const minOverlap = Math.max(8, Math.min(item.height, r.height) * 0.5);
      const isNearCenter = Math.abs(rowCenterY - itemCenterY) <= toleranceY;
      const hasRealOverlap = overlap >= minOverlap;
      return isNearCenter && hasRealOverlap && itemCenterY >= r.y + 2 && itemCenterY <= r.y + r.height - 2;
    });

    if (foundRow) {
      foundRow.items.push(item);
      const minY = Math.min(...foundRow.items.map((i) => i.y));
      const maxY = Math.max(...foundRow.items.map((i) => i.y + i.height));
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

  let mergedRows: typeof rows = [];
  const sortedRows = [...rows].sort((a, b) => a.y - b.y);

  const rowVerticalOverlap = (a: { y: number; height: number }, b: { y: number; height: number }) => {
    const top = Math.max(a.y, b.y);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    return Math.max(0, bottom - top);
  };

  sortedRows.forEach((row) => {
    if (mergedRows.length === 0) {
      mergedRows.push(row);
      return;
    }

    const lastRow = mergedRows[mergedRows.length - 1];
    const lastRowCenter = lastRow.y + lastRow.height / 2;
    const currentRowCenter = row.y + row.height / 2;
    const overlap = rowVerticalOverlap(lastRow, row);
    const minMergeOverlap = Math.max(4, Math.min(lastRow.height, row.height) * 0.3);

    if (Math.abs(lastRowCenter - currentRowCenter) < 10 && overlap >= minMergeOverlap) {
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

function detectColorFromCanvas(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number
): 'red' | 'blue' | 'black' {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'black';
    const rx = Math.max(0, Math.floor(x));
    const ry = Math.max(0, Math.floor(y));
    const rw = Math.max(1, Math.min(Math.floor(w), canvas.width - rx));
    const rh = Math.max(1, Math.min(Math.floor(h), canvas.height - ry));
    const imgData = ctx.getImageData(rx, ry, rw, rh);
    const data = imgData.data;
    let redCount = 0;
    let blueCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!;
      const g = data[i+1]!;
      const b = data[i+2]!;
      // Red: high R compared to G and B
      if (r > 130 && r > g + 40 && r > b + 40) {
        redCount++;
      }
      // Blue: high B compared to R and G
      else if (b > 130 && b > r + 40 && b > g + 25) {
        blueCount++;
      }
    }
    if (redCount > 5 && redCount > blueCount) return 'red';
    if (blueCount > 5 && blueCount > redCount) return 'blue';
  } catch (e) {
    console.error('Error detecting color from canvas:', e);
  }
  return 'black';
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
  maxY?: number,
  options?: { valorSignHeuristic?: 'automatic' | 'color_blue_c_red_d' | 'color_blue_d_red_c' }
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

  // ─── Hard pre-filter: discard any text item that does not overlap ANY of the
  //     three selected column bands. This prevents values from adjacent columns
  //     (like Saldo or Documento) from ever being captured, regardless of
  //     distance-based adjacency expansion below.
  const itemOverlapsCol = (item: PDFTextItem, col: { startX: number; width: number }, marginPx = 0) => {
    const colLeft  = col.startX - marginPx;
    const colRight = col.startX + col.width + marginPx;
    const itemLeft  = item.x;
    const itemRight = item.x + item.width;
    return itemRight > colLeft && itemLeft < colRight;
  };

  const columnFilteredItems = uniqueTextItems.filter((item) =>
    itemOverlapsCol(item, dateCol) ||
    itemOverlapsCol(item, histCol) ||
    // Value column: only 2px extra on the right to capture C/D sign letter
    itemOverlapsCol(item, valCol, 2)
  );

  const cropCanvasSection = (
    srcX: number,
    srcY: number,
    srcW: number,
    srcH: number,
    allowedMinX?: number,
    allowedMaxX?: number
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

      // Discard everything outside the allowed column coordinates (white-out mask)
      if (allowedMinX !== undefined) {
        const cutLeft = allowedMinX - x;
        if (cutLeft > 0) {
          cropCtx.fillStyle = '#FFFFFF';
          cropCtx.fillRect(0, 0, cutLeft, h);
        }
      }
      if (allowedMaxX !== undefined) {
        const cutRight = allowedMaxX - x;
        if (cutRight < w) {
          cropCtx.fillStyle = '#FFFFFF';
          cropCtx.fillRect(cutRight, 0, w - cutRight, h);
        }
      }

      return cropCanvas.toDataURL('image/png');
    } catch (e) {
      console.error('Error cropping canvas:', e);
      return '';
    }
  };

  const rowItemsMap = new Map<number, PDFTextItem[]>();
  rowConfigs.forEach((_, idx) => rowItemsMap.set(idx, []));

  const verticalOverlap = (item: PDFTextItem, row: { y: number; height: number }) => {
    const itemTop = item.y;
    const itemBottom = item.y + item.height;
    const rowTop = row.y;
    const rowBottom = row.y + row.height;
    return Math.max(0, Math.min(itemBottom, rowBottom) - Math.max(itemTop, rowTop));
  };

  columnFilteredItems.forEach((item) => {
    const itemCenterY = item.y + item.height / 2;
    let closestRowIndex = -1;
    let minDistance = Infinity;

    rowConfigs.forEach((row, idx) => {
      const rowCenterY = row.y + row.height / 2;
      const distance = Math.abs(itemCenterY - rowCenterY);
      const overlapY = verticalOverlap(item, row);
      const minRequiredOverlap = Math.max(6, item.height * 0.6);
      const isInsideRow = overlapY >= minRequiredOverlap && itemCenterY >= row.y - 4 && itemCenterY <= row.y + row.height + 4;

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

    const getColumnOverlapRatio = (item: PDFTextItem, col: { startX: number; width: number }) => {
      const overlap = getColumnOverlap(item, col);
      return item.width <= 0 ? 0 : overlap / item.width;
    };

    const isMostlyInColumn = (item: PDFTextItem, col: { startX: number; width: number }, threshold = 0.65) => {
      const overlapRatio = getColumnOverlapRatio(item, col);
      return overlapRatio >= threshold;
    };

    // Date Column Assignment
    const rowDateItems = processedRowItems.filter((item) => {
      const itemCenterX = item.x + item.width / 2;
      const dateOverlap = getColumnOverlap(item, dateCol);
      const overlapThreshold = item.width * 0.4;
      const inDateCenter = itemCenterX >= dateCol.startX && itemCenterX <= dateCol.startX + dateCol.width;
      return inDateCenter || (dateOverlap > 0 && dateOverlap >= overlapThreshold);
    });

    if (rowDateItems.length > 0) {
      let changed = true;
      while (changed) {
        changed = false;
        const minDateX = Math.min(...rowDateItems.map((i) => i.x));
        const maxDateX = Math.max(...rowDateItems.map((i) => i.x + i.width));
        const adjacent = processedRowItems.find((item) => {
          if (rowDateItems.includes(item)) return false;

          // Adjacent to the right
          const distRight = item.x - maxDateX;
          const isRight = distRight >= -10 && distRight <= 15 && item.x <= dateCol.startX + dateCol.width + 24 && item.text.trim().length <= 15;
          if (isRight) return true;

          // Adjacent to the left
          const distLeft = minDateX - (item.x + item.width);
          const isLeft = distLeft >= -10 && distLeft <= 15;
          return isLeft;
        });
        if (adjacent) {
          rowDateItems.push(adjacent);
          changed = true;
        }
      }
      rowDateItems.sort((a, b) => a.x - b.x);
    }

    // Value Column Assignment: find core item mainly inside the value column.
    const coreValCandidates = processedRowItems
      .filter((item) => {
        const cleanText = item.text.trim();
        if (!cleanText || !/\d/.test(cleanText)) return false;
        const overlapRatio = getColumnOverlapRatio(item, valCol);
        const itemCenterX = item.x + item.width / 2;
        const centeredInValue = itemCenterX >= valCol.startX && itemCenterX <= valCol.startX + valCol.width;
        const leftMarginOk = item.x >= valCol.startX - 8;
        const rightMarginOk = item.x + item.width <= valCol.startX + valCol.width + 8;
        return (overlapRatio >= 0.7 && leftMarginOk && rightMarginOk) || (centeredInValue && overlapRatio >= 0.45 && leftMarginOk);
      })
      .sort((a, b) => {
        const overlapA = getColumnOverlapRatio(a, valCol);
        const overlapB = getColumnOverlapRatio(b, valCol);
        if (overlapA !== overlapB) return overlapB - overlapA;
        return a.x - b.x;
      });

    const rowValItems: PDFTextItem[] = [];
    if (coreValCandidates.length > 0) {
      rowValItems.push(coreValCandidates[0]);

      let changed = true;
      while (changed) {
        changed = false;
        const minValX = Math.min(...rowValItems.map((i) => i.x));
        const maxValX = Math.max(...rowValItems.map((i) => i.x + i.width));
        const adjacent = processedRowItems.find((item) => {
          if (rowValItems.includes(item)) return false;
          const text = item.text.trim();
          const hasDigits = /\d/.test(text);
          const overlapRatio = getColumnOverlapRatio(item, valCol);

          // Adjacent digits must still overlap the value column significantly.
          if (hasDigits) {
            const distRight = item.x - maxValX;
            const isRight = distRight >= -8 && distRight <= 10 && overlapRatio >= 0.45;
            if (isRight) return true;

            const distLeft = minValX - (item.x + item.width);
            const isLeft = distLeft >= -8 && distLeft <= 10 && overlapRatio >= 0.45;
            return isLeft;
          }

          // Signs may sit slightly outside the guide but must be close to the value.
          const dist = item.x - maxValX;
          return (/^[CDcd]$/.test(text) || /^(DEBITO|DEBIT|CREDITO|CREDITO)$/i.test(text)) && dist >= -6 && dist <= 40 && item.x <= valCol.startX + valCol.width + 40;
        });
        if (adjacent) {
          rowValItems.push(adjacent);
          changed = true;
        }
      }
      rowValItems.sort((a, b) => a.x - b.x);
    }

    // Sign handling for Value
    if (rowValItems.length > 0) {
      const maxValX = rowValItems[rowValItems.length - 1].x + rowValItems[rowValItems.length - 1].width;

      processedRowItems.forEach((item) => {
        if (rowValItems.includes(item)) return;
        const text = item.text.trim().toUpperCase();
        if (text === 'D' || text === 'C' || text === 'DEBITO' || text === 'CREDITO') {
          const dist = item.x - maxValX;
          // Sign must be close to the value digits and within column right edge + 55px
          if (dist >= -10 && dist <= 55 && item.x <= valCol.startX + valCol.width + 55) {
            rowValItems.push(item);
          }
        }
      });
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

    /**
     * Returns only the portion of item.text that falls inside [colLeft, colRight].
     * Uses pixel-width proportionality to estimate character count.
     */
    const clipTextToColumn = (
      item: PDFTextItem,
      colLeft: number,
      colRight: number
    ): string => {
      const itemLeft  = item.x;
      const itemRight = item.x + item.width;
      const totalPx   = itemRight - itemLeft;
      if (totalPx <= 0) return item.text;

      const visLeft  = Math.max(itemLeft,  colLeft);
      const visRight = Math.min(itemRight, colRight);
      const visPx    = visRight - visLeft;
      if (visPx <= 0) return '';

      // Fully inside — no clipping needed
      if (visPx >= totalPx - 1) return item.text;

      const fraction  = visPx / totalPx;
      const charCount = Math.max(1, Math.round(item.text.length * fraction));

      // Item starts within/after column → take from the left
      if (itemLeft >= colLeft - 1) {
        return item.text.substring(0, charCount).trimEnd();
      }
      // Item starts before column → take from the right
      return item.text.substring(item.text.length - charCount).trimStart();
    };

    const dateText    = rowDateItems.map(i =>
      clipTextToColumn(i, dateCol.startX, dateCol.startX + dateCol.width)
    ).join(' ').trim();

    const historyText = rowHistItems.map(i =>
      clipTextToColumn(i, histCol.startX, histCol.startX + histCol.width)
    ).join(' ').trim();

    const valueText   = rowValItems.map(i =>
      clipTextToColumn(i, valCol.startX, valCol.startX + valCol.width + 2)
    ).join(' ').trim();

    // 3. Extract exact visual crops - increased verticalPadding to 7 for highest fidelity ("SER FIL")
    const verticalPadding = 7;
    const cropY = row.y - verticalPadding;
    let cropH = row.height + verticalPadding * 2;

    if (minY != null && maxY != null) {
      if (cropY < minY) {
        cropH = Math.max(1, cropY + cropH - minY);
      }
      if (cropY + cropH > maxY) {
        cropH = Math.max(1, maxY - cropY);
      }
    }

    // Crop Date Column (Aligned to text items bounds with text-width fallback buffer)
    let dateCropUrl = '';
    if (rowDateItems.length > 0) {
      const minX = Math.min(...rowDateItems.map(i => i.x));
      const maxX = Math.max(...rowDateItems.map(i => i.x + i.width));
      // Strictly clamp to guide boundaries — zero bleed
      const cropStartX = Math.max(0, dateCol.startX);
      const cropEndX   = Math.min(docWidth, Math.min(dateCol.startX + dateCol.width, maxX + 2));
      dateCropUrl = cropCanvasSection(
        cropStartX,
        cropY,
        Math.max(1, cropEndX - cropStartX),
        cropH,
        dateCol.startX,               // allowedMinX: exact left guide
        dateCol.startX + dateCol.width // allowedMaxX: exact right guide
      );
    } else {
      const cropStartX = Math.max(0, dateCol.startX);
      const cropEndX   = Math.min(docWidth, dateCol.startX + dateCol.width);
      dateCropUrl = cropCanvasSection(
        cropStartX,
        cropY,
        Math.max(1, cropEndX - cropStartX),
        cropH,
        dateCol.startX,
        dateCol.startX + dateCol.width
      );
    }

    // Crop History Column (Aligned to text items bounds)
    let historyCropUrl = '';
    if (rowHistItems.length > 0) {
      const minX = Math.min(...rowHistItems.map(i => i.x));
      const maxX = Math.max(...rowHistItems.map(i => i.x + i.width));
      // Strictly clamp to guide boundaries
      const cropStartX = Math.max(0, histCol.startX);
      const cropEndX   = Math.min(docWidth, Math.min(histCol.startX + histCol.width, maxX + 2));
      historyCropUrl = cropCanvasSection(
        cropStartX,
        cropY,
        Math.max(1, cropEndX - cropStartX),
        cropH,
        histCol.startX,
        histCol.startX + histCol.width
      );
    } else {
      const cropStartX = Math.max(0, histCol.startX);
      const cropEndX   = Math.min(docWidth, histCol.startX + histCol.width);
      historyCropUrl = cropCanvasSection(
        cropStartX,
        cropY,
        Math.max(1, cropEndX - cropStartX),
        cropH,
        histCol.startX,
        histCol.startX + histCol.width
      );
    }

    // Crop Value Column — pixel-precise to guide boundaries
    let valueCropUrl = '';
    if (rowValItems.length > 0) {
      const minX = Math.min(...rowValItems.map(i => i.x));
      const maxX = Math.max(...rowValItems.map(i => i.x + i.width));
      // Left edge: guide start (never before it)
      const cropStartX = Math.max(0, valCol.startX);
      // Right edge: actual text right edge capped at guide right boundary
      // (the sign letter C/D may sit slightly outside the guide — allow up to +2px only)
      const cropEndX = Math.min(docWidth, Math.min(valCol.startX + valCol.width + 2, maxX + 2));
      valueCropUrl = cropCanvasSection(
        cropStartX,
        cropY,
        Math.max(1, cropEndX - cropStartX),
        cropH,
        valCol.startX,                  // allowedMinX: exact left guide
        Math.min(valCol.startX + valCol.width + 2, maxX + 2) // allowedMaxX: guide right (+2px safety)
      );
    } else {
      const cropStartX = Math.max(0, valCol.startX);
      const cropEndX   = Math.min(docWidth, valCol.startX + valCol.width);
      valueCropUrl = cropCanvasSection(
        cropStartX,
        cropY,
        Math.max(1, cropEndX - cropStartX),
        cropH,
        valCol.startX,
        valCol.startX + valCol.width
      );
    }

    // 4. Analyze value (negative vs positive)
    let { isNegative, parsedValue } = analyzeValueString(valueText);
    let finalValueText = valueText;

    // Override by color heuristic
    if (options?.valorSignHeuristic === 'color_blue_c_red_d' || options?.valorSignHeuristic === 'color_blue_d_red_c') {
      const cropStartX = rowValItems.length > 0 ? Math.max(valCol.startX, Math.min(...rowValItems.map(i => i.x)) - 2) : valCol.startX;
      const cropEndX = rowValItems.length > 0 ? Math.min(valCol.startX + valCol.width, Math.max(...rowValItems.map(i => i.x + i.width)) + 2) : valCol.startX + valCol.width;
      const detectedColor = detectColorFromCanvas(canvas, cropStartX, cropY, cropEndX - cropStartX, cropH);
      if (detectedColor === 'blue') {
        isNegative = options.valorSignHeuristic === 'color_blue_d_red_c';
        const suffix = options.valorSignHeuristic === 'color_blue_d_red_c' ? ' D' : ' C';
        if (!finalValueText.toUpperCase().includes('C') && !finalValueText.toUpperCase().includes('D')) {
          finalValueText += suffix;
        }
      } else if (detectedColor === 'red') {
        isNegative = options.valorSignHeuristic === 'color_blue_c_red_d';
        const suffix = options.valorSignHeuristic === 'color_blue_c_red_d' ? ' D' : ' C';
        if (!finalValueText.toUpperCase().includes('C') && !finalValueText.toUpperCase().includes('D')) {
          finalValueText += suffix;
        }
      }
      if (parsedValue !== null) {
        parsedValue = isNegative ? -Math.abs(parsedValue) : Math.abs(parsedValue);
      }
    }

    // Keep the secondary check just in case, but now that we expand rowValItems, this is a fallback
    const cleanValText = finalValueText.toUpperCase();
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
    } else if (finalValueText) {
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

    // Format visual text for editable spreadsheet cell: keep ONLY digits, comma, dot, and leading minus if negative
    let cleanVisualText = finalValueText
      .replace(/[CDcd]/g, '')
      .replace(/[^0-9,\.\-]/g, '')
      .trim();

    cleanVisualText = cleanVisualText.replace(/\-/g, ''); // strip all minuses first
    if (isNegative && cleanVisualText !== '' && cleanVisualText !== '0,00' && cleanVisualText !== '0.00' && cleanVisualText !== '0') {
      cleanVisualText = '-' + cleanVisualText;
    }
    finalValueText = cleanVisualText;

    return {
      id: `row-${index}-${Date.now()}`,
      dateText,
      historyText,
      valueText: finalValueText,
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
  options?: { valorSignHeuristic?: 'automatic' | 'color_blue_c_red_d' | 'color_blue_d_red_c' }
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

  const parseNum = (str: string | undefined): number => {
    if (!str) return 0;
    const clean = str.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
  };

  return rowConfigs
    .map((row, index) => {
      const fields: Record<string, string> = {};
      const cropUrls: Record<string, string> = {};
      const cropBounds: Record<string, { x: number; y: number; w: number; h: number }> = {};

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
        cropUrls[id] = '';
        cropBounds[id] = { x: startX, y: cropY, w: width, h: cropH };
      });

      // Se temos colunas individuais de debito e credito, combinamos em valorDc
      if (fields.debito || fields.credito) {
        const dVal = parseNum(fields.debito);
        const cVal = parseNum(fields.credito);
        if (dVal > 0) {
          fields.valorDc = fields.debito;
        } else if (cVal > 0) {
          fields.valorDc = '-' + fields.credito;
        }
      }

      // Se a heurística de sinal for por cor, aplicamos na coluna valorDc
      if (fields.valorDc && (options?.valorSignHeuristic === 'color_blue_c_red_d' || options?.valorSignHeuristic === 'color_blue_d_red_c')) {
        const col = (columns as any)['valorDc'];
        if (col) {
          const startX = isPercent ? (col.startX / 100) * docWidth : col.startX;
          const width = isPercent ? (col.width / 100) * docWidth : col.width;
          const detectedColor = detectColorFromCanvas(canvas, startX, cropY, width, cropH);
          let isNegativeVal = false;
          if (detectedColor === 'blue') {
            isNegativeVal = options.valorSignHeuristic === 'color_blue_d_red_c';
          } else if (detectedColor === 'red') {
            isNegativeVal = options.valorSignHeuristic === 'color_blue_c_red_d';
          }
          
          let cleanVal = fields.valorDc.replace(/[CDcd]/g, '').trim();
          if (isNegativeVal) {
            if (!cleanVal.startsWith('-')) {
              cleanVal = '-' + cleanVal;
            }
          } else {
            if (cleanVal.startsWith('-')) {
              cleanVal = cleanVal.substring(1);
            }
          }
          fields.valorDc = cleanVal;
        }
      }

      // Se a coluna de data estiver mapeada, exigimos formato de data válido (filtra cabeçalhos/textos)
      if (fields.data !== undefined) {
        const dStr = fields.data.trim();
        const isDate = /^\s*\d{2}\s*[\/\-]\s*\d{2}\s*[\/\-]\s*\d{2,4}\s*$/.test(dStr);
        if (!isDate) {
          return null;
        }
      }

      return {
        id: `row-${index}-${Date.now()}`,
        fields,
        cropUrls,
        cropBounds,
        y: row.y,
        height: row.height,
        pageNumber,
      };
    })
    .filter((row): row is Exclude<typeof row, null> => row !== null);
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

  // Only accept rows whose full vertical span is inside the crop band.
  // Partial overlap is not enough, because values must be strictly within the colored crop band.
  return rowTop >= startY && rowBottom <= endY;
}

export function filterRowsInCropBand<T extends { y: number; height: number }>(
  rows: T[],
  startY: number,
  endY: number,
): T[] {
  return rows.filter((row) => rowIntersectsCropBand(row, startY, endY));
}

export type ExtractedRowPrunePrefs = {
  removeNoNumericValue?: boolean;
  removeNoHistory?: boolean;
  removeNoDate?: boolean;
  prunedRowIds?: string[];
};

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

/**
 * Persistência de linhas removidas (pruned) pelo usuário.
 */
export function loadExtractedRowPrunePrefs(storageKey: string): ExtractedRowPrunePrefs {
  if (!storageKey) return {};
  try {
    const data = localStorage.getItem(`prune::${storageKey}`);
    return data ? (JSON.parse(data) as ExtractedRowPrunePrefs) : {};
  } catch {
    return {};
  }
}

export function saveExtractedRowPrunePrefs(
  storageKey: string,
  patch: ExtractedRowPrunePrefs,
): ExtractedRowPrunePrefs {
  if (!storageKey) return patch;
  const merged = { ...loadExtractedRowPrunePrefs(storageKey), ...patch };
  try {
    localStorage.setItem(`prune::${storageKey}`, JSON.stringify(merged));
  } catch (e) {
    console.error('Failed to save prune prefs', e);
  }
  return merged;
}

export function clearExtractedRowPrunePrefs(storageKey: string): void {
  if (!storageKey) return;
  try {
    localStorage.removeItem(`prune::${storageKey}`);
  } catch {
    /* ignore */
  }
}

export function pruneExtractedRows(
  rows: ExtractedRow[],
  prefs: ExtractedRowPrunePrefs,
): ExtractedRow[] {
  return rows.filter((row) => {
    if (prefs.removeNoNumericValue && !rowHasNumericValue(row)) return false;
    if (prefs.removeNoHistory && !rowHasMeaningfulHistory(row)) return false;
    if (prefs.removeNoDate && !rowHasMeaningfulDate(row)) return false;
    if (prefs.prunedRowIds && prefs.prunedRowIds.includes(row.id)) return false;
    return true;
  });
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
