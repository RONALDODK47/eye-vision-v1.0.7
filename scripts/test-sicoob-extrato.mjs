/**
 * Teste fiel linha a linha — SICOOB 397-2 (texto nativo PDF).
 * Uso: node scripts/test-sicoob-extrato.mjs [caminho.pdf]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const pdfPath =
  process.argv[2] ||
  String.raw`p:\EMPRESAS\ATIVAS\LUCRO REAL\Fertilizantes Organo Buritis Ltda\FERTILIZANTES ORGANO\RECORRENTE\2026\CONTÁBIL\DOCUMENTOS PARA CONTABILIZAÇÃO\EXTRATOS BANCÁRIOS\02-2026\SICOOB 397-2.pdf`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const RE_DATA = /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/;
const RE_VALOR_SICOOB = /^(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})([DCdc*])?$/;
const RE_RUIDO = /saldo\s+(?:anterior|do\s+dia|bloq)|saldo\s+bloq/i;

function parseMoney(token) {
  const m = String(token ?? '').match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/);
  if (!m) return 0;
  return parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
}

function norm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

async function loadAllPages(pdfjs) {
  const buf = fs.readFileSync(pdfPath);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const scale = 2;
  const allItems = [];
  let imgWidth = 0;
  let yOff = 0;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale });
    const tc = await page.getTextContent();
    for (const raw of tc.items) {
      if (!raw.str?.trim()) continue;
      const m = pdfjs.Util.transform(viewport.transform, raw.transform);
      const x = m[4];
      const yBaseline = m[5];
      const w = Math.max(1, (raw.width ?? 0) * viewport.scale);
      const h = Math.max(4, (raw.height ?? 10) * viewport.scale);
      const y = viewport.height - yBaseline - h;
      allItems.push({ str: raw.str.trim(), x, y: y + yOff, w, h, page: p });
    }
    imgWidth = viewport.width;
    yOff += viewport.height + 8;
  }
  return { allItems, imgWidth, imgHeight: yOff, numPages: doc.numPages };
}

/** Ground truth a partir do PDF nativo (layout SICOOB: DATA | HISTÓRICO | VALOR). */
function buildGroundTruth(items) {
  const heights = items.map((i) => i.h).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 10;
  const tol = Math.max(8, medianH * 0.9);

  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const it of sorted) {
    const cy = it.y + it.h / 2;
    let row = rows.find((r) => Math.abs(r.cy - cy) <= tol);
    if (!row) {
      row = { cy, items: [] };
      rows.push(row);
    }
    row.items.push(it);
  }
  rows.sort((a, b) => a.cy - b.cy);

  const txs = [];
  let cur = null;

  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    const dateTok = row.items.find((it) => it.x < 170 && RE_DATA.test(it.str));
    const valorTok = row.items.find((it) => it.x > 360 && RE_VALOR_SICOOB.test(it.str.replace(/\s/g, '')));
    const histParts = row.items
      .filter((it) => it.x >= 170 && it.x < 360)
      .map((it) => it.str)
      .join(' ')
      .trim();

    const lineAll = row.items.map((it) => it.str).join(' ');
    if (RE_RUIDO.test(norm(lineAll))) {
      cur = null;
      continue;
    }

    if (valorTok) {
      const vm = valorTok.str.replace(/\s/g, '').match(RE_VALOR_SICOOB);
      const amount = vm?.[1] ?? '';
      const nature = (vm?.[2] ?? '').toUpperCase().replace('*', '');
      const val = parseMoney(amount);
      if (val <= 0) continue;

      if (dateTok) {
        cur = {
          data: dateTok.str,
          historico: histParts,
          valor: amount,
          nature: nature === 'C' ? 'C' : nature === 'D' ? 'D' : '',
          page: row.items[0]?.page,
        };
        txs.push(cur);
      } else if (cur && histParts) {
        cur.historico = `${cur.historico} ${histParts}`.replace(/\s+/g, ' ').trim();
      } else if (!dateTok && histParts) {
        // valor sem data na mesma linha — novo lançamento do dia anterior
        cur = {
          data: cur?.data ?? '',
          historico: histParts,
          valor: amount,
          nature: nature === 'C' ? 'C' : nature === 'D' ? 'D' : '',
          page: row.items[0]?.page,
        };
        txs.push(cur);
      }
    } else if (cur && (histParts || row.items.some((it) => it.x >= 170))) {
      const extra = row.items
        .filter((it) => it.x >= 170)
        .map((it) => it.str)
        .join(' ')
        .trim();
      if (extra) cur.historico = `${cur.historico} ${extra}`.replace(/\s+/g, ' ').trim();
    }
  }

  return txs.filter((t) => t.valor && parseMoney(t.valor) > 0);
}

function rowValor(row) {
  const deb = parseMoney(row.valorDebito);
  const cred = parseMoney(row.valorCredito);
  const misto = parseMoney(row.valorMisto);
  if (deb > 0) return { val: deb, nature: 'D', token: row.valorDebito };
  if (cred > 0) return { val: cred, nature: 'C', token: row.valorCredito };
  if (misto > 0) {
    const n = /C\b/i.test(row.valorMisto ?? '') ? 'C' : /D\b/i.test(row.valorMisto ?? '') ? 'D' : '';
    return { val: misto, nature: n, token: row.valorMisto };
  }
  return { val: 0, nature: '', token: '' };
}

async function main() {
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF não encontrado:', pdfPath);
    process.exit(1);
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { allItems, imgWidth, imgHeight, numPages } = await loadAllPages(pdfjs);
  const truth = buildGroundTruth(allItems);

  const mod = await import(path.join(root, 'src/lib/pdfNativeTextItems.ts'));
  const extractMod = await import(path.join(root, 'src/lib/parcelamentoColunasExtract.ts'));

  const suggested = mod.suggestExtratoBancarioColumns(allItems, imgWidth);
  if (!suggested) {
    console.error('FALHA: suggestExtratoBancarioColumns retornou null');
    console.log('Header rows sample:', allItems.filter((i) => /data|histor|valor/i.test(i.str)).slice(0, 10));
    process.exit(1);
  }

  console.log('PDF:', path.basename(pdfPath));
  console.log('Páginas:', numPages, '| Itens:', allItems.length);
  console.log('Ground truth (lançamentos c/ valor):', truth.length);
  console.log('Colunas sugeridas:', suggested.columns.map((c) => `${c.id}(${Math.round(c.start)}-${Math.round(c.end)})`).join(', '));
  console.log('Faixa Y:', Math.round(suggested.faixaStart), '-', Math.round(suggested.faixaEnd));

  const mapping = extractMod.mappingGenericoEmCoordsOcr(
    suggested.columns,
    { startY: suggested.faixaStart, endY: suggested.faixaEnd },
    imgWidth,
    imgHeight,
    imgWidth,
    imgHeight,
  );

  const rows = extractMod.extractGenericRowsFromMapping(allItems, mapping, imgHeight, imgWidth, {
    dataColIds: ['data', 'descricao', 'valorCredito', 'valorDebito', 'valorMisto'],
    headerKeywords: ['saldo anterior', 'data', 'historico', 'valor', 'lancamento'],
    allowFaixaFallback: true,
    strictFaixaVertical: true,
    extratoPositional: true,
    statementYear: '2026',
    ignoreLineWords: ['saldo anterior', 'saldo bloq', 'saldo do dia'],
  });

  const extracted = rows
    .map((r) => {
      const v = rowValor(r);
      return {
        data: (r.data ?? '').trim(),
        historico: (r.descricao ?? r.historicoOperacao ?? '').trim(),
        valor: v.token,
        val: v.val,
        nature: v.nature,
      };
    })
    .filter((r) => r.val > 0);

  console.log('Extraídos (c/ valor):', extracted.length);
  console.log('---');

  const n = Math.max(truth.length, extracted.length);
  let ok = 0;
  let fails = [];

  for (let i = 0; i < n; i++) {
    const t = truth[i];
    const e = extracted[i];
    if (!t && e) {
      fails.push({ i, type: 'EXTRA', e });
      continue;
    }
    if (t && !e) {
      fails.push({ i, type: 'MISSING', t });
      continue;
    }
    if (!t || !e) continue;

    const valOk = Math.abs(parseMoney(t.valor) - e.val) < 0.02;
    const natOk = !t.nature || !e.nature || t.nature === e.nature;
    const dataOk = !t.data || !e.data || e.data.startsWith(t.data.slice(0, 5)) || t.data === e.data.slice(0, 5);

    if (valOk && natOk) {
      ok++;
    } else {
      fails.push({
        i,
        type: 'MISMATCH',
        truth: `${t.data} | ${t.historico.slice(0, 40)} | ${t.valor}${t.nature}`,
        got: `${e.data} | ${e.historico.slice(0, 40)} | ${e.valor}${e.nature}`,
        valOk,
        natOk,
        dataOk,
      });
    }
  }

  console.log(`Match valor+natureza: ${ok}/${truth.length}`);
  if (fails.length > 0) {
    console.log('\nFalhas (primeiras 25):');
    for (const f of fails.slice(0, 25)) {
      console.log(JSON.stringify(f, null, 0));
    }
    process.exit(1);
  }
  console.log('\n100% fiel — todos os lançamentos batem.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
