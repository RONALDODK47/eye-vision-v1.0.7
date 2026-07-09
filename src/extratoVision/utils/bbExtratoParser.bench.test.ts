/**
 * @vitest-environment happy-dom
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractLinesFromPDF } from './parser';

const PDF_PATH =
  String.raw`p:\EMPRESAS\ATIVAS\LUCRO REAL\Fertilizantes Organo Buritis Ltda\FERTILIZANTES ORGANO\RECORRENTE\2026\CONTÁBIL\DOCUMENTOS PARA CONTABILIZAÇÃO\EXTRATOS BANCÁRIOS\03-2026\Extrato BB - 03-2026.pdf`;

/** Ground truth parcial — extrato BB 03/2026 (OCR página 1). */
const EXPECTED = [
  { data: '02/03/2026', histContains: 'FCO AMORT', debito: 5809.74 },
  { data: '02/03/2026', histContains: 'ESTORNO DE DEBITO', credito: 20913.65 },
  { data: '02/03/2026', histContains: 'OUROCAP', debito: 1065.6 },
  { data: '02/03/2026', histContains: 'COBRANCA DE 1.O.F', debito: 49.87 },
  { data: '02/03/2026', histContains: 'BB RENDE', credito: 16364.33 },
  { data: '03/03/2026', histContains: 'FCO AMORT', debito: 10815.93 },
];

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

beforeAll(() => {
  (globalThis as any).DOMMatrix = class DOMMatrix {};
  const origCreate = document.createElement.bind(document);
  document.createElement = ((tag: string, options?: ElementCreationOptions) => {
    if (tag.toLowerCase() === 'canvas') {
      const c = createCanvas(10, 10) as unknown as HTMLCanvasElement;
      return c;
    }
    return origCreate(tag, options);
  }) as typeof document.createElement;

  (window as any).pdfjsLib = pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ).href;
});

describe.skip('Extrato Vision parser — BB 03/2026 (parser desativado)', () => {
  it(
    'extractLinesFromPDF retorna lançamentos corretos',
    async () => {
      const buf = fs.readFileSync(PDF_PATH);
      const file = new File([buf], 'Extrato BB - 03-2026.pdf', { type: 'application/pdf' });
      const logs: string[] = [];

      const lines = await extractLinesFromPDF(file, '2026', (msg) => logs.push(msg));
      const txs = lines.filter((l) => l.transactionData).map((l) => l.transactionData!);

      console.log('Transações:', txs.length);
      for (const t of txs.slice(0, 12)) {
        console.log(`${t.data} | ${(t.historico ?? '').slice(0, 42)} | ${t.valor} ${t.tipo}`);
      }

      expect(txs.length).toBeGreaterThanOrEqual(20);

      const errors: string[] = [];
      for (const exp of EXPECTED) {
        const hit = txs.find((t) => {
          const d = norm(t.data ?? '');
          const h = norm(t.historico ?? '');
          if (!d.includes(norm(exp.data.slice(0, 5)))) return false;
          if (!h.includes(norm(exp.histContains.slice(0, 10)))) return false;
          const v = Math.abs(Number(t.valor) || 0);
          const target = exp.debito ?? exp.credito ?? 0;
          if (Math.abs(v - target) > 0.05) return false;
          if (exp.debito != null && t.tipo !== 'D') return false;
          if (exp.credito != null && t.tipo !== 'C') return false;
          return true;
        });
        if (!hit) errors.push(`Faltando: ${exp.data} · ${exp.histContains}`);
      }

      if (errors.length) {
        console.error('ERROS ground truth:');
        for (const e of errors) console.error(' -', e);
      }
      expect(errors).toHaveLength(0);
    },
    600_000,
  );
});
