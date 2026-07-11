/**
 * Valida detecção Nubank contra PDF de referência (Castelo de Açúcar 06/2026).
 * Uso: node scripts/test-nubank-layout.mjs [caminho.pdf]
 */
import fs from 'fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath =
  process.argv[2] ||
  'p:/EMPRESAS/ATIVAS/SIMPLES NACIONAL/Castelo de Acucar Ltda/RECORRENTE/2026/CONTABIL/06-2026/nubank.pdf';

const RE_NUBANK_DATE = /^\d{1,2}\s+[A-ZÁÉÍÓÚÇ]{3,9}\s+\d{4}$/i;
const RE_NUBANK_VAL = /^[+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2}$/;
const RE_NUBANK_TX_HINT =
  /transfer[eê]ncia|pagamento de fatura|valor adicionado|pix|tarifa|compra|estorno|recebido|enviad/i;

function normVal(str) {
  return str.trim().replace(/\s+/g, ' ');
}
function isValueToken(str) {
  return RE_NUBANK_VAL.test(normVal(str));
}

function calibrateNubankGeometry(items, imgWidth, imgHeight, pageNumber = 1) {
  const heights = items.map((i) => i.h).filter((h) => h > 0).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 12;
  const pad = Math.max(6, medianH * 0.35);

  const dateTokens = items.filter((it) => it.x < imgWidth * 0.22 && RE_NUBANK_DATE.test(it.str.trim()));
  const valTokens = items.filter((it) => it.x > imgWidth * 0.65 && isValueToken(it.str));
  const histTokens = items.filter((it) => it.x >= imgWidth * 0.17 && it.x < imgWidth * 0.72 && it.str.trim().length > 2);

  const dateMaxX = dateTokens.length ? Math.max(...dateTokens.map((t) => t.x + t.w)) + pad : imgWidth * 0.175;
  const valueMinX = valTokens.length ? Math.min(...valTokens.map((t) => t.x)) - pad : imgWidth * 0.815;
  const histMinX = histTokens.length ? Math.min(...histTokens.map((t) => t.x)) - pad * 0.5 : imgWidth * 0.19;

  const mov = items.find((it) => /^movimenta/i.test(it.str.trim()));
  const movimentacoesY = mov ? mov.y : null;

  const footerYs = items
    .filter((it) =>
      /tem alguma dúvida|extrato gerado|ouvidoria|o saldo líquido corresponde/i.test(it.str),
    )
    .map((it) => it.y);

  const firstTx = items
    .filter((it) => {
      if (it.x < histMinX || it.x >= valueMinX) return false;
      if (!RE_NUBANK_TX_HINT.test(it.str)) return false;
      return items.some((o) => Math.abs(o.y - it.y) < medianH * 0.65 && o.x >= valueMinX && isValueToken(o.str));
    })
    .sort((a, b) => a.y - b.y)[0];

  let faixaStart = pad;
  if (movimentacoesY != null && pageNumber <= 1) faixaStart = mov.y + mov.h + pad;
  else if (firstTx) faixaStart = Math.max(pad, firstTx.y - pad * 0.5);
  else if (dateTokens.length) faixaStart = Math.max(pad, Math.min(...dateTokens.map((d) => d.y)) - pad);

  const bodyBottom = items.length ? Math.max(...items.map((i) => i.y + i.h)) : imgHeight;
  let faixaEnd =
    footerYs.length > 0 && Math.min(...footerYs) > faixaStart + medianH * 2
      ? Math.min(...footerYs) - pad
      : bodyBottom - pad;
  faixaEnd = Math.max(faixaEnd, faixaStart + medianH * 3);

  return { dateMaxX, histMinX, valueMinX, movimentacoesY, faixaStart, faixaEnd, medianH };
}

function detectRowsFromText(textItems, tolerance = 8) {
  const sorted = [...textItems].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const item of sorted) {
    let row = rows.find((r) => Math.abs(r.y - item.y) < tolerance);
    if (!row) {
      row = { y: item.y, height: item.height, items: [] };
      rows.push(row);
    }
    row.items.push(item);
    row.height = Math.max(row.height, item.y + item.height - row.y);
  }
  return rows.sort((a, b) => a.y - b.y);
}

function inZoneDate(item, geo) {
  return item.x + item.width <= geo.dateMaxX + 4;
}
function inZoneHist(item, geo) {
  const cx = item.x + item.width / 2;
  return cx >= geo.histMinX && cx < geo.valueMinX;
}
function inZoneValue(item, geo) {
  return item.x >= geo.valueMinX - 4;
}

function detectNubankTransactionRows(textItems, imgWidth, imgHeight, pageNumber = 1, carryDate = '') {
  const pos = textItems.map((t) => ({ str: t.text, x: t.x, y: t.y, w: t.width, h: t.height }));
  const geo = calibrateNubankGeometry(pos, imgWidth, imgHeight, pageNumber);
  const rawRows = detectRowsFromText(textItems, 8);
  let currentDate = carryDate.trim();
  if (!currentDate) {
    const minY = geo.movimentacoesY ?? geo.faixaStart;
    const d = pos
      .filter((it) => it.x < geo.dateMaxX && RE_NUBANK_DATE.test(it.str.trim()) && it.y >= minY - 4)
      .sort((a, b) => b.y - a.y)[0];
    currentDate = d?.str.trim() ?? '';
  }
  const out = [];
  let pending = null;

  const flush = () => {
    if (pending) {
      out.push(pending);
      pending = null;
    }
  };

  for (const row of rawRows) {
    const rowCenterY = row.y + row.height / 2;
    const blob = row.items
      .sort((a, b) => a.x - b.x)
      .map((i) => i.text)
      .join(' ')
      .toUpperCase();

    const anchor = row.items.find((it) => inZoneDate(it, geo) && RE_NUBANK_DATE.test(it.text.trim()));
    if (anchor) currentDate = anchor.text.trim();

    if (rowCenterY < geo.faixaStart || rowCenterY > geo.faixaEnd) {
      flush();
      continue;
    }
    if (geo.movimentacoesY != null && rowCenterY < geo.movimentacoesY) {
      flush();
      continue;
    }
    if (/SALDO INICIAL|RENDIMENTO|TOTAL DE ENTRADAS|TOTAL DE SAÍDAS|SALDO FINAL|SALDO DO DIA|MOVIMENTAÇÕES|TEM ALGUMA|EXTRATO GERADO|OUVIDORIA/i.test(blob)) {
      flush();
      continue;
    }
    if (anchor && /TOTAL DE ENTRADAS|TOTAL DE SAÍDAS/.test(blob)) {
      flush();
      continue;
    }

    const hasVal = row.items.some((it) => inZoneValue(it, geo) && isValueToken(it.text));
    const hasHist = row.items.some((it) => inZoneHist(it, geo) && it.text.trim().length > 1);

    if (hasVal && hasHist && !/SALDO|TOTAL DE/i.test(blob)) {
      flush();
      pending = { y: row.y, height: row.height, anchorDate: currentDate, blob };
      continue;
    }
    if (pending && hasHist && !hasVal) {
      pending.height = row.y + row.height - pending.y;
      continue;
    }
    flush();
  }
  flush();
  const rows = out.map((r) => ({ ...r, anchorDate: r.anchorDate || currentDate }));
  return { rows, geo };
}

function pdfItems(page, scale = 1.5) {
  const vp = page.getViewport({ scale });
  return page.getTextContent().then((tc) => {
    const items = [];
    for (const item of tc.items) {
      if (!item.str?.trim()) continue;
      const [cx, cy] = vp.convertToViewportPoint(item.transform[4], item.transform[5]);
      const h = (item.height || 12) * scale;
      items.push({
        text: item.str,
        x: cx,
        y: cy - h,
        width: (item.width || 0) * scale,
        height: h,
      });
    }
    return { items, width: vp.width, height: vp.height };
  });
}

const data = new Uint8Array(fs.readFileSync(pdfPath));
const doc = await pdfjs.getDocument({ data }).promise;

const expected = [
  { date: '08 JUN 2026', val: '936,47', hint: 'cartão' },
  { date: '08 JUN 2026', val: '936,47', hint: 'ALCANCE' },
  { date: '10 JUN 2026', val: '9.335,00', hint: 'Castelo' },
  { date: '10 JUN 2026', val: '9.334,05', hint: 'fatura' },
  { date: '16 JUN 2026', val: '200,00', hint: 'cartão' },
  { date: '16 JUN 2026', val: '200,00', hint: 'JESSICA' },
];

let allRows = [];
let carryDate = '';
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const { items, width, height } = await pdfItems(page);
  const { rows, geo } = detectNubankTransactionRows(items, width, height, p, carryDate);
  carryDate = items
    .filter((it) => it.x < geo.dateMaxX && RE_NUBANK_DATE.test(it.text.trim()))
    .sort((a, b) => b.y - a.y)[0]?.text.trim() || carryDate;
  console.log(`\n=== Página ${p} ===`);
  console.log('Geometria:', geo);
  console.log('Faixa:', geo.faixaStart.toFixed(0), '-', geo.faixaEnd.toFixed(0), 'de', height);
  for (const r of rows) {
    const hist = items
      .filter((it) => {
        const cy = it.y + it.height / 2;
        return cy >= r.y && cy <= r.y + r.height && inZoneHist(it, geo);
      })
      .map((i) => i.text)
      .join(' ');
    const val = items
      .filter((it) => {
        const cy = it.y + it.height / 2;
        return cy >= r.y && cy <= r.y + r.height && inZoneValue(it, geo) && isValueToken(it.text);
      })
      .map((i) => i.text)
      .join(' ');
    console.log(`  [${r.anchorDate}] y=${r.y} h=${r.height} | ${hist.slice(0, 60)} | ${val}`);
    allRows.push({ ...r, hist, val, page: p });
  }
}

console.log('\n=== RESULTADO ===');
console.log('Esperados:', expected.length, '| Detectados:', allRows.length);
if (allRows.length !== expected.length) {
  console.error('FALHA: quantidade de lançamentos incorreta');
  process.exit(1);
}
console.log('OK —', allRows.length, 'lançamentos detectados com precisão');
for (let i = 0; i < expected.length; i++) {
  const exp = expected[i];
  const got = allRows[i];
  if (!got || !got.hist.toUpperCase().includes(exp.hint.toUpperCase())) {
    console.error('FALHA linha', i + 1, exp, got);
    process.exit(1);
  }
  if (got.anchorDate !== exp.date) {
    console.error('FALHA data linha', i + 1, 'esperado', exp.date, 'obtido', got.anchorDate);
    process.exit(1);
  }
}
