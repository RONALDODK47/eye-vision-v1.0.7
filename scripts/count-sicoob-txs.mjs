import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const pdfPath = String.raw`p:\EMPRESAS\ATIVAS\LUCRO REAL\Fertilizantes Organo Buritis Ltda\FERTILIZANTES ORGANO\RECORRENTE\2026\CONTÁBIL\DOCUMENTOS PARA CONTABILIZAÇÃO\EXTRATOS BANCÁRIOS\02-2026\SICOOB 397-2.pdf`;

const RE_VALOR = /^(\d{1,3}(?:\.\d{3})*,\d{2})([DCdc*])?$/;
const RE_DATA = /^\d{1,2}\/\d{1,2}$/;
const RE_SKIP = /saldo\s+(?:anterior|do\s+dia|bloq)|saldo\s+bloq|saldo\s+dispon|cheque\s+especial|tarifas\s+vencid|custo\s+efetivo|extrato\s+mensal|folha\s+\d/i;

async function main() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const buf = fs.readFileSync(pdfPath);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const txs = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const byY = new Map();
    for (const raw of tc.items) {
      if (!raw.str?.trim()) continue;
      const y = Math.round(raw.transform[5]);
      const x = Math.round(raw.transform[4]);
      const key = y;
      if (!byY.has(key)) byY.set(key, []);
      byY.get(key).push({ str: raw.str.trim(), x });
    }
    const rows = [...byY.entries()].sort((a, b) => b[0] - a[0]);
    for (const [y, items] of rows) {
      items.sort((a, b) => a.x - b.x);
      const line = items.map((i) => i.str).join(' ');
      const valorItem = items.find((i) => i.x > 360 && RE_VALOR.test(i.str.replace(/\s/g, '')));
      if (!valorItem) continue;
      if (RE_SKIP.test(line)) continue;
      const vm = valorItem.str.match(RE_VALOR);
      txs.push({
        p,
        y,
        data: items.find((i) => i.x < 170 && RE_DATA.test(i.str))?.str ?? '',
        valor: vm[1] + (vm[2] ?? ''),
        hist: items.filter((i) => i.x >= 170 && i.x < 360).map((i) => i.str).join(' '),
        line: line.slice(0, 80),
      });
    }
  }
  console.log('Total lançamentos c/ valor:', txs.length);
  txs.forEach((t, i) => {
    console.log(`${String(i + 1).padStart(3)} p${t.p} ${t.data.padEnd(6)} ${t.valor.padEnd(14)} ${t.hist.slice(0, 45)}`);
  });
}

main().catch(console.error);
