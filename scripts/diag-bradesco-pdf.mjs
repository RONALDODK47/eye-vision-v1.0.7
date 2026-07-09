/**
 * Diagnóstico rápido do PDF Bradesco (texto nativo + amostra OCR posicional).
 * Uso: node scripts/diag-bradesco-pdf.mjs "caminho\arquivo.PDF"
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const pdfPath =
  process.argv[2] ||
  String.raw`p:\EMPRESAS\ATIVAS\LUCRO REAL\Carol Alimentos e Utilidades Ltda\RECORRENTE\2026\CONTABIL\DOCUMENTOS CONTABEIS\04-2026\Bradesco_04052026_142621.PDF`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

async function main() {
  if (!fs.existsSync(pdfPath)) {
    console.error('Arquivo não encontrado:', pdfPath);
    process.exit(1);
  }
  const buf = fs.readFileSync(pdfPath);
  console.log('PDF:', pdfPath, 'bytes:', buf.length);

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(buf);
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  console.log('Páginas:', doc.numPages);

  for (let p = 1; p <= Math.min(doc.numPages, 2); p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items
      .filter((it) => it.str?.trim())
      .map((it) => ({
        str: it.str.trim(),
        x: Math.round(it.transform[4]),
        y: Math.round(it.transform[5]),
      }));
    console.log(`\n--- Página ${p}: ${items.length} trechos de texto nativo ---`);
    const byY = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
    const sample = byY.slice(0, 40).map((i) => `[${i.x},${i.y}] ${i.str}`);
    console.log(sample.join('\n'));
    const dates = byY.filter((i) => /\d{1,2}\/\d{1,2}/.test(i.str)).slice(0, 15);
    console.log('Datas amostra:', dates.map((d) => d.str).join(' | '));
    const valores = byY.filter((i) => /[\d.,]+/.test(i.str) && /,(\d{2})\b/.test(i.str)).slice(0, 15);
    console.log('Valores amostra:', valores.map((v) => v.str).join(' | '));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
