import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parsePlainText } from './parser';

const OCR_PAGE1 = path.join(process.cwd(), 'test/fixtures/bb-extrato-03-2026/page-1-ocr.txt');

describe.skipIf(!fs.existsSync(OCR_PAGE1))('parsePlainText BB OCR page 1', () => {
  it('extrai lançamentos do texto OCR', () => {
    const text = fs.readFileSync(OCR_PAGE1, 'utf8');
    const txs = parsePlainText(text, '2026');
    console.log('count', txs.length);
    for (const t of txs.slice(0, 12)) {
      console.log(t.data, '|', (t.historico ?? '').slice(0, 42), '|', t.valor, t.tipo);
    }
    expect(txs.length).toBeGreaterThanOrEqual(10);
    const fco = txs.find((t) => (t.historico ?? '').toUpperCase().includes('FCO') && Math.abs(t.valor - 5809.74) < 0.05);
    expect(fco).toBeTruthy();
  });
});
