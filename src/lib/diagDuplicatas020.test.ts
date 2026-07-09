import { describe, expect, it } from 'vitest';
import { mapOcrRowsToImportItems } from '../contabilfacil/logic/ocrImportMapper';
import { postProcessExtratoOcrRows, parseOcrIgnoreLineWords } from './ocrExtratoPositional';
import type { OcrExtratoRow } from './ocrExtratoPositional';

const ignoreLineWords = parseOcrIgnoreLineWords('saldo anterior, saldo bloq, saldo do dia, saldo');

function countValue(items: { value: number }[], v: number) {
  return items.filter((i) => Math.abs(i.value - v) < 0.011).length;
}

describe('diag duplicatas e 0,02', () => {
  it('fixture abr: 0,02 e sem duplicata 3068/37498', () => {
    const raw: OcrExtratoRow[] = [
      { data: '02/04/2026', descricao: 'IOF', valorMisto: '-0,65', _linhaOcr: '02/04/2026 IOF -0,65' },
      { data: '02/04/2026', descricao: 'RENDIMENTOS', valorMisto: '0,02', _linhaOcr: '02/04/2026 AUT MAIS RENDIMENTOS REND PAGO APLIC 0,02' },
      {
        data: '02/04/2026',
        _linhaOcr:
          '02/04/2026 02/04/2026 — SALDO TOTAL DISPONÍVEL DIA — TAR PLANO ADAPT 103/26 -169,00 40.674,50',
      },
      { data: '24/04/2026', _linhaOcr: '24/04/2026 SISPAG FORNECEDORES -37.498,09' },
      {
        data: '24/04/2026',
        _linhaOcr:
          '24/04/2026 24/04/2026 — SISPAG FORNECEDORES E GOIAS — SALDO TOTAL DISPONÍVEL DIA -543,22 5.044,98',
      },
      {
        data: '30/04/2026',
        _linhaOcr:
          '30/04/2026 29/04/2026 RECEBIMENTOS MUNICIPIO DE MINACU 02.215.275/0001-78 3.068,22',
      },
    ];
    const { items } = mapOcrRowsToImportItems('extrato', raw, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    console.log(
      'items',
      items.map((i) => ({ v: i.value, d: i.description?.slice(0, 50), n: i.nature })),
    );
    expect(items.some((i) => Math.abs(i.value - 0.02) < 0.001 && i.nature === 'C')).toBe(true);
    expect(countValue(items, 3068.22)).toBeLessThanOrEqual(1);
    expect(countValue(items, 37498.09)).toBeLessThanOrEqual(1);
  });

  it('UI real 02/04: IOF -0,03 + REND 0,02', () => {
    const raw: OcrExtratoRow[] = [
      { _linhaOcr: '02/04/2026 IOF -0,03' },
      { _linhaOcr: '02/04/2026 RENDIMENTOS REND PAGO APLIC AUT MAIS 0,02' },
      {
        _linhaOcr:
          '02/04/2026 02/04/2026 — SALDO TOTAL DISPONÍVEL DIA — TAR PLANO ADAPT 103/26 -169,00 40.674,50',
      },
    ];
    const pp = postProcessExtratoOcrRows(raw, '2026', {
      ignoreLineWords,
      preserveSegmentRows: true,
    });
    console.log('pp', JSON.stringify(pp, null, 2));
    const { items, skipped } = mapOcrRowsToImportItems('extrato', pp, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    console.log('items', items.map((i) => ({ v: i.value, d: i.description, n: i.nature })));
    console.log(
      'skipped rejeitado',
      skipped.filter((s) => s.severity === 'error'),
    );
    expect(items.some((i) => Math.abs(i.value - 0.02) < 0.001 && i.nature === 'C')).toBe(true);
  });

  it('duplicata SISPAG multilinha UI', () => {
    const raw: OcrExtratoRow[] = [
      {
        data: '24/04/2026',
        descricao: 'SISPAGFORNECEDORES -37.498',
        valorMisto: '-37.498,89',
        _linhaOcr: '24/04/2026 SISPAGFORNECEDORES -37.498,89',
      },
      {
        data: '24/04/2026',
        descricao: 'SISPAGFORNECEDORES',
        valorMisto: '-37.498,89',
        _linhaOcr: '24/04/2026 SISPAGFORNECEDORES -37.498,89',
      },
    ];
    const { items } = mapOcrRowsToImportItems('extrato', raw, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    expect(items).toHaveLength(1);
  });

  it('duplicata RECEBIMENTOS multilinha UI', () => {
    const raw: OcrExtratoRow[] = [
      {
        data: '30/04/2026',
        descricao: 'RECEBIMENTOS MUNICIPIODEMINACU 02.215.275/0001-78',
        valorMisto: '3.068,22',
        _linhaOcr:
          '30/04/2026 RECEBIMENTOS MUNICIPIODEMINACU 02.215.275/0001-78 3.068,22',
      },
      {
        data: '30/04/2026',
        descricao: 'RECEBIMENTOS MUNICIPIODEMINACU 02',
        valorMisto: '3.068,22',
        _linhaOcr: '30/04/2026 RECEBIMENTOS MUNICIPIODEMINACU 02 3.068,22',
      },
    ];
    const { items } = mapOcrRowsToImportItems('extrato', raw, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.description).toMatch(/02\.215\.275/);
  });

  it('0,02 só na linha de saldo colado', async () => {
    const raw: OcrExtratoRow[] = [
      { _linhaOcr: '02/04/2026 IOF -0,03' },
      {
        _linhaOcr:
          '02/04/2026 02/04/2026 — SALDO TOTAL DISPONÍVEL DIA — RENDIMENTOS REND PAGO APLIC AUT MAIS 0,02 — TAR PLANO ADAPT 103/26 -169,00 40.674,50',
      },
    ];
    const pp = postProcessExtratoOcrRows(raw, '2026', {
      ignoreLineWords,
      preserveSegmentRows: true,
    });
    console.log('pp saldo', JSON.stringify(pp, null, 2));
    const { items } = mapOcrRowsToImportItems('extrato', pp, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    expect(items.some((i) => Math.abs(i.value - 0.02) < 0.001 && i.nature === 'C')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 0.03) < 0.001 && i.nature === 'D')).toBe(true);
  });

  it('órfão Paddle: 02/04/2026 0,02 sem descrição (não vira IOF débito)', () => {
    const raw: OcrExtratoRow[] = [
      { _linhaOcr: '02/04/2026 IOF -0,65' },
      { data: '02/04/2026', valorMisto: '0,02', _linhaOcr: '02/04/2026 0,02' },
      {
        _linhaOcr:
          '02/04/2026 02/04/2026 — SALDO TOTAL DISPONÍVEL DIA — TAR PLANO ADAPT 103/26 -169,00 40.674,50',
      },
    ];
    const pp = postProcessExtratoOcrRows(raw, '2026', { ignoreLineWords, preserveSegmentRows: true });
    const { items } = mapOcrRowsToImportItems('extrato', pp, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    const rend = items.find((i) => Math.abs(i.value - 0.02) < 0.001);
    expect(rend?.nature).toBe('C');
    expect(rend?.description).toMatch(/RENDIMENTOS/i);
    expect(rend?.description).not.toMatch(/^IOF$/i);
  });

  it('0,02 multilinha rendimentos', () => {
    const raw: OcrExtratoRow[] = [
      { _linhaOcr: '02/04/2026 IOF -0,03', valorMisto: '-0,03' },
      { _linhaOcr: '02/04/2026 RENDIMENTOS REND PAGO APLIC' },
      { _linhaOcr: '02/04/2026 AUT MAIS 0,02', valorMisto: '0,02' },
    ];
    const { items } = mapOcrRowsToImportItems('extrato', raw, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    expect(items.some((i) => Math.abs(i.value - 0.02) < 0.001 && i.nature === 'C')).toBe(true);
  });

  it('extração UI: SISPAG PIX QR-CODE 5697 e SISPAG 37498', async () => {
    const { extractGenericRowsFromMapping } = await import('./parcelamentoColunasExtract');
    const { segmentarExtratoEmLancamentos } = await import('./ocrExtratoPositional');
    const columns = [
      { id: 'data', start: 0, end: 100, color: 'green' },
      { id: 'descricao', start: 100, end: 380, color: 'blue' },
      { id: 'valorMisto', start: 380, end: 520, color: 'orange' },
    ];
    const items = [
      { str: '23/04/2026', x: 10, y: 80, w: 80, h: 12 },
      { str: 'SISPAG FORNECEDORES PIX QR-', x: 120, y: 80, w: 200, h: 12 },
      { str: 'CODE', x: 140, y: 92, w: 50, h: 12 },
      { str: '-5.697,93', x: 400, y: 92, w: 80, h: 12 },
      { str: '24/04/2026', x: 10, y: 120, w: 80, h: 12 },
      { str: 'SISPAG FORNECEDORES', x: 120, y: 120, w: 160, h: 12 },
      { str: '-37.498,09', x: 400, y: 120, w: 80, h: 12 },
    ];
    const col = { min: 380, max: 520 };
    const segs = segmentarExtratoEmLancamentos(items, 600, {
      valorColX: col,
      modoAncladoValores: true,
    });
    expect(segs.length).toBeGreaterThanOrEqual(2);
    const rows = extractGenericRowsFromMapping(items, { columns }, 200, 600, {
      dataColIds: ['data', 'descricao', 'valorMisto'],
      extratoPositional: true,
      extratoPreserveSegmentRows: true,
      statementYear: '2026',
    });
    const { items: imp } = mapOcrRowsToImportItems('extrato', rows, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    expect(imp.some((i) => Math.abs(i.value - 5697.93) < 0.05 && i.nature === 'D')).toBe(true);
    expect(imp.some((i) => Math.abs(i.value - 37498.09) < 0.05 && i.nature === 'D')).toBe(true);
  });

  it('multilinha revisão: SISPAG PIX QR- + CODE com valor', () => {
    const raw: OcrExtratoRow[] = [
      { data: '23/04/2026', descricao: 'SISPAG FORNECEDORES PIX QR-', _linhaOcr: '23/04/2026 SISPAG FORNECEDORES PIX QR-' },
      { data: '23/04/2026', descricao: 'CODE', valorMisto: '-5.697,93', _linhaOcr: '23/04/2026 CODE -5.697,93' },
      {
        data: '24/04/2026',
        descricao: 'SISPAG FORNECEDORES',
        valorMisto: '-37.498,09',
        _linhaOcr: '24/04/2026 SISPAG FORNECEDORES -37.498,09',
      },
    ];
    const { items } = mapOcrRowsToImportItems('extrato', raw, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    expect(items.some((i) => Math.abs(i.value - 5697.93) < 0.05 && i.nature === 'D')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 37498.09) < 0.05 && i.nature === 'D')).toBe(true);
  });

  it('saldo colado 23/04: SISPAG PIX CODE 5697 sem sinal negativo', () => {
    const raw: OcrExtratoRow[] = [
      {
        data: '23/04/2026',
        _linhaOcr:
          '23/04/2026 23/04/2026 — SISPAG FORNECEDORES PIX QR- — SALDO TOTAL DISPONÍVEL DIA CODE 5.697,93 61,49',
      },
      { data: '24/04/2026', _linhaOcr: '24/04/2026 SISPAG FORNECEDORES -37.498,09' },
    ];
    const { items } = mapOcrRowsToImportItems('extrato', raw, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    expect(items.some((i) => Math.abs(i.value - 5697.93) < 0.05 && i.nature === 'D')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 37498.09) < 0.05 && i.nature === 'D')).toBe(true);
  });

  it('CODE sem data na linha do valor (Paddle)', async () => {
    const { extractGenericRowsFromMapping } = await import('./parcelamentoColunasExtract');
    const columns = [
      { id: 'data', start: 0, end: 100 },
      { id: 'descricao', start: 100, end: 380 },
      { id: 'valorMisto', start: 380, end: 520 },
    ];
    const items = [
      { str: '23/04/2026', x: 10, y: 80, w: 80, h: 12 },
      { str: 'SISPAG FORNECEDORES PIX QR-', x: 120, y: 80, w: 200, h: 12 },
      { str: 'CODE', x: 140, y: 92, w: 50, h: 12 },
      { str: '-5.697,93', x: 400, y: 92, w: 80, h: 12 },
    ];
    const rows = extractGenericRowsFromMapping(items, { columns }, 200, 600, {
      dataColIds: ['data', 'descricao', 'valorMisto'],
      extratoPositional: true,
      extratoPreserveSegmentRows: true,
      statementYear: '2026',
    });
    const { items: imp } = mapOcrRowsToImportItems('extrato', rows, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(imp.some((i) => Math.abs(i.value - 5697.93) < 0.05 && i.nature === 'D')).toBe(true);
  });
});
