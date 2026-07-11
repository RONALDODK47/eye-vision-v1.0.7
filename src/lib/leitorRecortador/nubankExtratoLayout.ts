import type { PDFTextItem } from './types';
import type { DocumentColumns } from './types';
import { detectRowsFromText, extractDataFromCanvas, type ExtractedRow } from './cropper';
import { parseExtratoDataOcrText } from '../ocrExtratoPositional';

export type PosicionadoLike = { str: string; x: number; y: number; w: number; h: number };

const RE_NUBANK_DATE = /^\d{1,2}\s+[A-ZÁÉÍÓÚÇ]{3,9}\s+\d{4}$/i;
const RE_NUBANK_VAL = /^[+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2}$/;

export const NUBANK_EXCLUSION_RULES = [
  'SALDO ANTERIOR',
  'SALDO DO DIA',
  'SALDO ATUAL',
  'SALDO FINAL',
  'SALDO INICIAL',
  'SALDO FINAL DO PERÍODO',
  'TOTAL DE ENTRADAS',
  'TOTAL DE SAÍDAS',
  'RENDIMENTO LÍQUIDO',
  'VALORES EM R$',
  'MOVIMENTAÇÕES',
  'TEM ALGUMA DÚVIDA',
  'EXTRATO GERADO',
  'OUVIDORIA',
  'NU PAGAMENTOS',
  'NU FINANCEIRA',
];

export function pdfTextItemsToPosicionado(items: PDFTextItem[]): PosicionadoLike[] {
  return items.map((t) => ({ str: t.text, x: t.x, y: t.y, w: t.width, h: t.height }));
}

export function isNubankExtratoLayout(items: PosicionadoLike[], imgWidth: number): boolean {
  if (items.length < 15 || imgWidth <= 0) return false;
  const blob = items.map((i) => i.str).join(' ').toUpperCase();
  const looksNu =
    /NUBANK|NU\s+PAGAMENTOS|NU\s+FINANCEIRA|4020\s+0185|0800\s+591\s+2117|NUPAGAMENTOS/i.test(blob);
  const hasMov = /MOVIMENTAÇÕES|VALORES EM R\$/i.test(blob);
  const nubankDates = items.filter(
    (it) => it.x < imgWidth * 0.2 && RE_NUBANK_DATE.test(it.str.trim()),
  );
  return looksNu && hasMov && nubankDates.length >= 1;
}

export function nubankDefaultColumns(): DocumentColumns {
  return {
    date: { startX: 0, width: 17 },
    history: { startX: 16, width: 62 },
    value: { startX: 78, width: 22 },
  };
}

export type NubankPageLayout = {
  columns: DocumentColumns;
  faixaStartPct: number;
  faixaEndPct: number;
};

export function suggestNubankExtratoPageLayout(
  items: PosicionadoLike[],
  imgWidth: number,
  imgHeight: number,
  pageNumber = 1,
): NubankPageLayout {
  const heights = items.map((i) => i.h).filter((h) => h > 0).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 12;
  const pad = Math.max(6, medianH * 0.4);

  const mov = items.find((it) => /^movimenta/i.test(it.str.trim()));
  const footerYs = items
    .filter((it) =>
      /tem alguma dúvida|extrato gerado|ouvidoria|nubank\.com\.br\/contatos|o saldo líquido corresponde/i.test(
        it.str,
      ),
    )
    .map((it) => it.y);

  const txStart = items
    .filter((it) => {
      const isHist =
        it.x >= imgWidth * 0.17 &&
        it.x < imgWidth * 0.72 &&
        /transferência|pagamento de fatura|valor adicionado/i.test(it.str);
      const hasValSibling = items.some(
        (o) =>
          Math.abs(o.y - it.y) < medianH * 0.6 &&
          o.x > imgWidth * 0.74 &&
          RE_NUBANK_VAL.test(o.str.trim()),
      );
      return isHist && hasValSibling;
    })
    .sort((a, b) => a.y - b.y)[0];

  let faixaStart = pad;
  if (mov && pageNumber <= 1) {
    faixaStart = mov.y + mov.h + pad;
  } else if (txStart) {
    faixaStart = Math.max(pad, txStart.y - pad);
  } else {
    const firstDate = items
      .filter((it) => it.x < imgWidth * 0.2 && RE_NUBANK_DATE.test(it.str.trim()))
      .sort((a, b) => a.y - b.y)[0];
    if (firstDate) faixaStart = Math.max(pad, firstDate.y - pad * 0.5);
  }

  const bodyBottom = items.length ? Math.max(...items.map((i) => i.y + i.h)) : imgHeight;
  let faixaEnd =
    footerYs.length > 0 && Math.min(...footerYs) > faixaStart + medianH * 3
      ? Math.min(...footerYs) - pad
      : bodyBottom - pad;

  faixaEnd = Math.max(faixaEnd, faixaStart + medianH * 4);

  return {
    columns: nubankDefaultColumns(),
    faixaStartPct: Math.max(0, (faixaStart / imgHeight) * 100),
    faixaEndPct: Math.min(100, (faixaEnd / imgHeight) * 100),
  };
}

export type NubankRowConfig = { y: number; height: number; anchorDate: string };

function rowBlob(items: PDFTextItem[]): string {
  return [...items]
    .sort((a, b) => a.x - b.x)
    .map((i) => i.text)
    .join(' ')
    .toUpperCase();
}

function shouldSkipNubankRow(blob: string): boolean {
  if (!blob.trim()) return true;
  if (/^CASTELO DE ACUCAR|^CNPJ\s|^AGÊNCIA\s|^CONTA\s|^\d{2}\.\d{3}\.\d{3}/i.test(blob)) return true;
  if (/^\d{1,2}\s+DE\s+[A-Z]+\s+DE\s+\d{4}\s+A\s/i.test(blob)) return true;
  if (/SALDO INICIAL|RENDIMENTO LÍQUIDO|TOTAL DE ENTRADAS|TOTAL DE SAÍDAS|SALDO FINAL DO PERÍODO|SALDO DO DIA|VALORES EM R\$|^MOVIMENTAÇÕES$/i.test(blob)) {
    return true;
  }
  if (/^SALDO FINAL DO PERÍODO/i.test(blob)) return true;
  if (/TEM ALGUMA DÚVIDA|EXTRATO GERADO|OUVIDORIA|NU PAGAMENTOS|NU FINANCEIRA|NUPAGAMENTOS/i.test(blob)) {
    return true;
  }
  if (/TOTAL DE ENTRADAS|TOTAL DE SAÍDAS/.test(blob) && RE_NUBANK_DATE.test(blob)) return true;
  return false;
}

function findDateAnchor(items: PDFTextItem[], imgWidth: number): string {
  const tok = items.find((it) => it.x < imgWidth * 0.2 && RE_NUBANK_DATE.test(it.text.trim()));
  return tok?.text.trim() ?? '';
}

function rowHasTransactionValue(items: PDFTextItem[], imgWidth: number): boolean {
  return items.some(
    (it) => it.x > imgWidth * 0.74 && RE_NUBANK_VAL.test(it.text.trim().replace(/\s+/g, ' ')),
  );
}

function rowHasHistory(items: PDFTextItem[], imgWidth: number): boolean {
  return items.some((it) => it.x >= imgWidth * 0.16 && it.x < imgWidth * 0.76 && it.text.trim().length > 2);
}

/** Agrupa lançamentos Nubank (descrição multilinha + valor à direita). */
export function detectNubankTransactionRows(
  textItems: PDFTextItem[],
  imgWidth: number,
): NubankRowConfig[] {
  if (!textItems.length) return [];

  const rawRows = detectRowsFromText(textItems, 8);
  let currentDate = '';
  const out: NubankRowConfig[] = [];
  let pending: NubankRowConfig | null = null;

  const flush = () => {
    if (pending) {
      out.push(pending);
      pending = null;
    }
  };

  for (const row of rawRows) {
    const blob = rowBlob(row.items);
    const anchor = findDateAnchor(row.items, imgWidth);
    if (anchor) currentDate = anchor;

    if (shouldSkipNubankRow(blob)) {
      flush();
      continue;
    }

    const hasVal = rowHasTransactionValue(row.items, imgWidth);
    const hasHist = rowHasHistory(row.items, imgWidth);

    if (hasVal && hasHist) {
      flush();
      pending = {
        y: row.y,
        height: row.height,
        anchorDate: currentDate,
      };
      continue;
    }

    if (pending && hasHist && !hasVal) {
      const bottom = row.y + row.height;
      pending.height = bottom - pending.y;
      continue;
    }

    if (hasVal && !hasHist) {
      flush();
    }
  }

  flush();
  return out;
}

export function extractNubankDataFromCanvas(
  canvas: HTMLCanvasElement,
  textItems: PDFTextItem[],
  columns: DocumentColumns,
  rowConfigs: NubankRowConfig[],
  statementYear?: string,
): ExtractedRow[] {
  const base = extractDataFromCanvas(
    canvas,
    textItems,
    columns,
    rowConfigs.map((r) => ({ y: r.y, height: r.height })),
    true,
  );
  return base.map((row, idx) => {
    const anchor = rowConfigs[idx]?.anchorDate;
    if (!anchor) return row;
    const parsed = parseExtratoDataOcrText(anchor, statementYear);
    return parsed ? { ...row, dateText: parsed } : row;
  });
}
