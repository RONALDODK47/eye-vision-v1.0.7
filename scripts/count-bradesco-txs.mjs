/**
 * Conta linhas com valor monetário no PDF vs lançamentos extraídos pelo parser.
 */
import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fileURLToPath } from 'url';
import path from 'path';

const pdfPath =
  process.argv[2] ||
  String.raw`p:\EMPRESAS\ATIVAS\LUCRO REAL\Carol Alimentos e Utilidades Ltda\RECORRENTE\2026\CONTABIL\DOCUMENTOS CONTABEIS\04-2026\Bradesco_04052026_142621.PDF`;

const RE_VALOR = /\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/;

function clusterRows(items, tol = 10) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const it of sorted) {
    const cy = it.y + (it.h || 0) / 2;
    let row = rows.find((r) => Math.abs(r[0].y + r[0].h / 2 - cy) <= tol);
    if (!row) rows.push([it]);
    else row.push(it);
  }
  for (const r of rows) r.sort((a, b) => a.x - b.x);
  return rows;
}

async function main() {
  const buf = fs.readFileSync(pdfPath);
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  let moneyRows = 0;
  let dateRows = 0;
  const samples = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = (tc.items || [])
      .map((it) => ({
        str: (it.str || '').trim(),
        x: it.transform[4] * 2,
        y: it.transform[5] * 2,
        w: (it.width || 0) * 2,
        h: (it.height || 10) * 2,
      }))
      .filter((it) => it.str);
    const rows = clusterRows(items, 8);
    for (const row of rows) {
      const text = row.map((i) => i.str).join(' ');
      const hasMoney = RE_VALOR.test(text);
      const hasDate = /\d{1,2}\/\d{1,2}/.test(text);
      if (hasMoney && !/saldo anterior/i.test(text)) {
        const vals = text.match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/g) || [];
        moneyRows++;
        if (samples.length < 15) samples.push({ p, text: text.slice(0, 80), vals });
      }
      if (hasDate) dateRows++;
    }
  }

  console.log('Páginas:', doc.numPages);
  console.log('Linhas com valor (exc. saldo ant.):', moneyRows);
  console.log('Linhas com data:', dateRows);
  console.log('Amostras valor:', samples);
}

main().catch(console.error);
