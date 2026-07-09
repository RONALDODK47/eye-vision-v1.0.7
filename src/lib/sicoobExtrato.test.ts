/**
 * Teste fiel — SICOOB 397-2 (texto nativo PDF, 7 páginas).
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  isSicoobExtratoValorUnicoLayout,
  pdfPageToPosicionadoItems,
  suggestExtratoBancarioColumns,
} from './pdfNativeTextItems';
import {
  extractExtratoNativePdfAllPages,
  extractGenericRowsFromMapping,
  mappingGenericoEmCoordsOcr,
  type GenericOcrRow,
} from './parcelamentoColunasExtract';
import { parseExtratoMoneyValue } from '../extratoVision/utils/extratoMoneyParse';

const SICOOB_PDF = String.raw`p:\EMPRESAS\ATIVAS\LUCRO REAL\Fertilizantes Organo Buritis Ltda\FERTILIZANTES ORGANO\RECORRENTE\2026\CONTÁBIL\DOCUMENTOS PARA CONTABILIZAÇÃO\EXTRATOS BANCÁRIOS\02-2026\SICOOB 397-2.pdf`;

const RE_VALOR = /^(\d{1,3}(?:\.\d{3})*,\d{2})([DCdc*])?$/;
const RE_DATA = /^\d{1,2}\/\d{1,2}$/;
const RE_SKIP =
  /saldo\s+(?:anterior|do\s+dia|bloq)|saldo\s+bloq|saldo\s+dispon|cheque\s+especial|tarifas\s+vencid|custo\s+efetivo|extrato\s+para|folha\s+\d/i;

type TxKey = string;

function txKey(data: string, val: number, nature: string): TxKey {
  const d = data.replace(/\s+/g, '').slice(0, 5);
  return `${d}|${val.toFixed(2)}|${nature}`;
}

function rowValor(row: GenericOcrRow): { val: number; nature: 'C' | 'D' | '' } {
  const deb = parseExtratoMoneyValue(row.valorDebito ?? '');
  const cred = parseExtratoMoneyValue(row.valorCredito ?? '');
  const mistoRaw = row.valorMisto ?? '';
  const misto = parseExtratoMoneyValue(mistoRaw);
  if (deb > 0) return { val: deb, nature: 'D' };
  if (cred > 0) return { val: cred, nature: 'C' };
  if (misto > 0) {
    const n = /C\b/i.test(mistoRaw) ? 'C' : /D\b/i.test(mistoRaw) ? 'D' : '';
    return { val: misto, nature: n as 'C' | 'D' | '' };
  }
  return { val: 0, nature: '' };
}

/** Ground truth: todas as linhas com valor no PDF nativo (ordem do extrato). */
async function buildGroundTruthFromPdf(): Promise<{ keys: TxKey[]; byKey: Map<TxKey, number> }> {
  const buf = fs.readFileSync(SICOOB_PDF);
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const keys: TxKey[] = [];
  const byKey = new Map<TxKey, number>();

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const byY = new Map<number, { str: string; x: number }[]>();
    for (const raw of tc.items) {
      if (!raw.str?.trim()) continue;
      const y = Math.round(raw.transform[5]);
      const x = Math.round(raw.transform[4]);
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y)!.push({ str: raw.str.trim(), x });
    }
    const rows = [...byY.entries()].sort((a, b) => b[0] - a[0]);
    for (const [, items] of rows) {
      items.sort((a, b) => a.x - b.x);
      const line = items.map((i) => i.str).join(' ');
      const valorItem = items.find((i) => i.x > 360 && RE_VALOR.test(i.str.replace(/\s/g, '')));
      if (!valorItem) continue;
      if (RE_SKIP.test(line)) continue;
      const vm = valorItem.str.replace(/\s/g, '').match(RE_VALOR);
      if (!vm) continue;
      const val = parseExtratoMoneyValue(vm[1]!);
      if (val <= 0) continue;
      const nature = (vm[2] ?? '').toUpperCase().replace('*', '');
      if (nature !== 'C' && nature !== 'D') continue;
      const data = items.find((i) => i.x < 170 && RE_DATA.test(i.str))?.str ?? '';
      if (!data.trim()) continue;
      const key = txKey(data, val, nature);
      keys.push(key);
      byKey.set(key, (byKey.get(key) ?? 0) + 1);
    }
  }
  return { keys, byKey };
}

function multisetFromRows(rows: GenericOcrRow[]): Map<TxKey, number> {
  const map = new Map<TxKey, number>();
  for (const r of rows) {
    const v = rowValor(r);
    if (v.val <= 0 || !v.nature) continue;
    const data = (r.data ?? '').trim();
    const key = txKey(data, v.val, v.nature);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

describe.skipIf(!fs.existsSync(SICOOB_PDF))('SICOOB 397-2 — extrato nativo PDF', () => {
  it(
    'layout SICOOB detectado (valor único D/C)',
    async () => {
      const buf = fs.readFileSync(SICOOB_PDF);
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
      const page = await doc.getPage(1);
      const { items, imgWidth, imgHeight } = await pdfPageToPosicionadoItems(page, 2);
      const rawBlob = items.map((it) => it.str).join(' ');
      expect(/sicoob|sisbr/i.test(rawBlob)).toBe(true);
      expect(isSicoobExtratoValorUnicoLayout(items)).toBe(true);
      const suggested = suggestExtratoBancarioColumns(items, imgWidth);
      expect(suggested).not.toBeNull();
      expect(suggested!.columns.some((c) => c.id === 'valorMisto')).toBe(true);
      const mapping = mappingGenericoEmCoordsOcr(
        suggested!.columns,
        { startY: suggested!.faixaStart, endY: suggested!.faixaEnd },
        imgWidth,
        imgHeight,
        imgWidth,
        imgHeight,
      );
      const probe = extractGenericRowsFromMapping(items, mapping, imgHeight, imgWidth, {
        dataColIds: ['data', 'descricao', 'valorCredito', 'valorDebito', 'valorMisto'],
        extratoPositional: true,
        statementYear: '2026',
        allowFaixaFallback: true,
      });
      expect(probe.length).toBeGreaterThan(15);
    },
    30_000,
  );

  it(
    'extrai 100% dos lançamentos (valor + natureza D/C), linha a linha',
    async () => {
      const { keys: truthKeys, byKey: truthMap } = await buildGroundTruthFromPdf();
      expect(truthKeys.length).toBeGreaterThan(100);

      const buf = fs.readFileSync(SICOOB_PDF);
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;

      const rows = await extractExtratoNativePdfAllPages(doc, 2, {
        dataColIds: ['data', 'descricao', 'valorCredito', 'valorDebito', 'valorMisto'],
        headerKeywords: ['saldo anterior', 'data', 'historico', 'valor'],
        allowFaixaFallback: false,
        extratoPositional: true,
        statementYear: '2026',
        ignoreLineWords: ['saldo anterior', 'saldo bloq', 'saldo do dia'],
      });

      const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
      const RE_SKIP_COMPARE =
        /saldo\s+(?:anterior|do\s+dia|bloq)|saldo\s+bloq|saldo\s+dispon|cheque\s+especial|tarifas\s+vencid|custo\s+efetivo|extrato\s+para|folha\s+\d/i;
      const { extratoRowContemPalavraIgnorada, extratoRowTextoLinhaFiel } = await import('./ocrExtratoPositional');
      const rowsParaComparar = rows.filter((r) => {
        const linhaFiel = extratoRowTextoLinhaFiel(r);
        if (RE_SKIP_COMPARE.test(linhaFiel)) return false;
        return !extratoRowContemPalavraIgnorada(r, ignoreLineWords);
      });
      const extractedMap = multisetFromRows(rowsParaComparar);
      const fails: string[] = [];

      for (const [key, count] of truthMap) {
        const got = extractedMap.get(key) ?? 0;
        if (got < count) {
          fails.push(`falta ${count - got}x: ${key}`);
        } else if (got > count) {
          fails.push(`extra ${got - count}x: ${key}`);
        }
      }
      for (const [key, count] of extractedMap) {
        if (!truthMap.has(key)) {
          fails.push(`não está no PDF (${count}x): ${key}`);
        }
      }

      if (fails.length > 0) {
        console.log(`Truth: ${truthKeys.length} | Extraído: ${rows.length} | Com valor: ${[...extractedMap.values()].reduce((a, b) => a + b, 0)}`);
        console.log('Falhas:\n' + fails.slice(0, 50).join('\n'));
      }

      expect(fails, fails.slice(0, 20).join('\n')).toEqual([]);
    },
    120_000,
  );
});
