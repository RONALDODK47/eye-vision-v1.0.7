import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parseBbExtratoOcrText, parseBbExtratoOcrLine } from './bbExtratoOcrParse';
import { parseExtratoMoneyValue } from './extratoMoneyParse';

const OCR_PAGE1 = path.join(process.cwd(), 'test/fixtures/bb-extrato-03-2026/page-1-ocr.txt');

const EXPECTED = [
  { data: '02/03/2026', descContains: 'FCO AMORT', debito: 5809.74 },
  { data: '02/03/2026', descContains: 'ESTORNO DE DEBITO', credito: 20913.65 },
  { data: '02/03/2026', descContains: 'OUROCAP', debito: 1065.6 },
  { data: '02/03/2026', descContains: 'COBRANCA', debito: 49.87 },
  { data: '02/03/2026', descContains: 'BB RENDE', credito: 16364.33 },
  { data: '03/03/2026', descContains: 'FCO AMORT', debito: 10815.93 },
];

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

describe('parseBbExtratoOcrLine', () => {
  it('extrai FCO Amortização com valor e débito', () => {
    const row = parseBbExtratoOcrLine(
      '02/03/2026                      0000       13128 500FCO Amortização                              51.509.415.002.318       5.809,74 D',
    );
    expect(row).toBeTruthy();
    expect(row!.data).toBe('02/03/2026');
    expect(norm(row!.descricao ?? '')).toContain('FCO');
    expect(parseExtratoMoneyValue(row!.valorDebito ?? '')).toBeCloseTo(5809.74);
  });

  it('extrai BB Rende Fácil com crédito (ignora saldo)', () => {
    const row = parseBbExtratoOcrLine(
      '02/03/2026                    0000       00000 798 BB Rende Fácil                                               9.903      16.364,33 C     5.049,87 D',
    );
    expect(row).toBeTruthy();
    expect(parseExtratoMoneyValue(row!.valorCredito ?? '')).toBeCloseTo(16364.33);
  });

  it('ignora saldo trailing e mantém valor do lançamento (Pix BB)', () => {
    const linha =
      '01/04/2026 0000 13128 500 Pix - Recebido 33.081.298 390,52 C 1.234,56 D';
    const row = parseBbExtratoOcrLine(linha);
    expect(row).toBeTruthy();
    expect(parseExtratoMoneyValue(row!.valorCredito ?? '')).toBeCloseTo(390.52);
  });

  it('extrai valor assinado sem sufixo C/D (coluna Valor R$ escaneada)', () => {
    const row = parseBbExtratoOcrLine(
      '01/05/2026 0000 13128 500 PIX enviado duathlon -100,00 -9.800,00',
    );
    expect(row).toBeTruthy();
    expect(row!.valorMisto).toBe('-100,00');
    expect(parseExtratoMoneyValue(row!.valorDebito ?? '')).toBeCloseTo(100);
  });

  it('extrai Ordem Banc com código longo antes do valor C', () => {
    const row = parseBbExtratoOcrLine(
      '26/05/2026 0000 14056 632 Ordem Banc 12 Sec Tes Nac 2.490.265.000.000 14.552,00 C',
    );
    expect(row).toBeTruthy();
    expect(parseExtratoMoneyValue(row!.valorCredito ?? '')).toBeCloseTo(14552);
    expect(row!.descricao?.toUpperCase()).toMatch(/ORDEM BANC/);
  });

  it('extrai TED-Crédito com documento distinto (mesmo valor)', () => {
    const base =
      '25/05/2026 0000 14175 976 TED-Crédito em Conta 104 3961 18431312000115 PREF MUN DE UB';
    const r1 = parseBbExtratoOcrLine(`${base} 100.336.373 1.039,50 C`);
    const r2 = parseBbExtratoOcrLine(`${base} 100.336.683 1.039,50 C`);
    const r3 = parseBbExtratoOcrLine(`${base} 100.336.684 1.039,50 C`);
    expect(r1 && r2 && r3).toBeTruthy();
    for (const r of [r1!, r2!, r3!]) {
      expect(parseExtratoMoneyValue(r.valorCredito ?? '')).toBeCloseTo(1039.5);
    }
  });
});

describe('extractGenericRowsFromMapping — fallback BB quando faixa estrita zera linhas', () => {
  it('usa parser linha-a-linha do BB se mapeamento posicional não extrai nada', async () => {
    const { extractGenericRowsFromMapping } = await import('../../lib/parcelamentoColunasExtract');
    const imgWidth = 900;
    const imgHeight = 1200;
    const items = [
      {
        str: 'Banco do Brasil',
        x: 40,
        y: 20,
        w: 120,
        h: 14,
      },
      {
        str: '02/03/2026',
        x: 30,
        y: 400,
        w: 70,
        h: 12,
      },
      {
        str: 'FCO Amortização',
        x: 120,
        y: 400,
        w: 140,
        h: 12,
      },
      {
        str: '5.809,74 D',
        x: 620,
        y: 400,
        w: 70,
        h: 12,
      },
    ];
    const columns = [
      { id: 'data', start: 0, end: 100, color: 'bg-cyan-500' },
      { id: 'descricao', start: 100, end: 500, color: 'bg-blue-500' },
      { id: 'valorMisto', start: 500, end: 700, color: 'bg-amber-600' },
    ];
    const ocrFullText =
      '02/03/2026 0000 13128 500 FCO Amortização 51.509.415.002.318 5.809,74 D';
    const rows = extractGenericRowsFromMapping(
      items,
      {
        columns,
        faixa: { startY: 10, endY: 80 },
      },
      imgHeight,
      imgWidth,
      {
        dataColIds: ['data'],
        strictFaixaVertical: true,
        extratoPositional: true,
        extratoPreserveSegmentRows: true,
        ocrFullText,
      },
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.data).toBe('02/03/2026');
  });
});

describe.skipIf(!fs.existsSync(OCR_PAGE1))('parseBbExtratoOcrText page 1', () => {
  it('extrai lançamentos do texto OCR da página 1', () => {
    const text = fs.readFileSync(OCR_PAGE1, 'utf8');
    const rows = parseBbExtratoOcrText(text);
    expect(rows.length).toBeGreaterThanOrEqual(15);

    const errors: string[] = [];
    for (const exp of EXPECTED) {
      const hit = rows.find((r) => {
        const desc = norm(r.descricao ?? '');
        if (!norm(r.data ?? '').includes(norm(exp.data.slice(0, 5)))) return false;
        if (!desc.includes(norm(exp.descContains.slice(0, 8)))) return false;
        const cred = parseExtratoMoneyValue(r.valorCredito ?? '');
        const deb = parseExtratoMoneyValue(r.valorDebito ?? '');
        if (exp.debito != null && Math.abs(deb - exp.debito) >= 0.05) return false;
        if (exp.credito != null && Math.abs(cred - exp.credito) >= 0.05) return false;
        return true;
      });
      if (!hit) errors.push(`${exp.data} · ${exp.descContains}`);
    }
    expect(errors).toEqual([]);
  });
});
