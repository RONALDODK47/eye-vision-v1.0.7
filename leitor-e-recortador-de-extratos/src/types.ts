/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ColumnRange {
  startX: number; // Percent of document width (0-100) or pixel value
  width: number;  // Percent or pixel value
}

export interface DocumentColumns {
  date: ColumnRange;
  history: ColumnRange;
  value: ColumnRange;
}

export interface ExtractedRow {
  id: string;
  // Extracted text fields (user editable)
  dateText: string;
  historyText: string;
  valueText: string;
  
  // Base64 image crops
  dateCropUrl: string;
  historyCropUrl: string;
  valueCropUrl: string;
  
  // Status
  isNegative: boolean;
  parsedValue: number | null;
  
  // Coordinates for rendering / debugging
  y: number;
  height: number;
}

export interface DocMetadata {
  name: string;
  type: 'pdf' | 'image';
  pageNumber: number;
  totalPages: number;
  width: number;
  height: number;
}
