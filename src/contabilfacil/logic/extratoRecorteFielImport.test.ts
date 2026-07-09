import { describe, expect, it } from 'vitest';
import {
  mapExtractedRowsToRecorteFielOcr,
  mapRecorteFielRowsToImportItems,
  rowsSaoRecorteFiel,
} from './extratoRecorteFielImport';
import type { ExtractedRow } from '../../lib/leitorRecortador/types';

function row(partial: Partial<ExtractedRow> & Pick<ExtractedRow, 'isNegative' | 'parsedValue'>): ExtractedRow {
  return {
    id: partial.id ?? crypto.randomUUID(),
    dateText: partial.dateText ?? '01/04/2026',
    historyText: partial.historyText ?? 'PIX',
    valueText: partial.valueText ?? '',
    dateCropUrl: '',
    historyCropUrl: '',
    valueCropUrl: '',
    isNegative: partial.isNegative,
    parsedValue: partial.parsedValue,
    y: 0,
    height: 10,
  };
}

describe('extratoRecorteFielImport', () => {
  it('preserva entradas e saídas iguais ao placar do recorte', () => {
    const extracted = [
      row({ historyText: 'PIX IN', isNegative: false, parsedValue: 410_455.65, valueText: '410.455,65' }),
      row({ historyText: 'PIX OUT', isNegative: true, parsedValue: -410_455.65, valueText: '-410.455,65' }),
    ];
    const ocr = mapExtractedRowsToRecorteFielOcr(extracted);
    expect(rowsSaoRecorteFiel(ocr)).toBe(true);
    expect(ocr).toHaveLength(2);
    expect(ocr[0]!.natureza).toBe('C');
    expect(ocr[1]!.natureza).toBe('D');

    const { items, conciliacao } = mapRecorteFielRowsToImportItems(ocr, { saldoAnterior: 0 });
    expect(items).toHaveLength(2);
    expect(items[0]!.nature).toBe('C');
    expect(items[0]!.value).toBeCloseTo(410_455.65, 2);
    expect(items[1]!.nature).toBe('D');
    expect(items[1]!.value).toBeCloseTo(410_455.65, 2);
    expect(conciliacao.creditos).toBeCloseTo(410_455.65, 2);
    expect(conciliacao.debitos).toBeCloseTo(410_455.65, 2);
    expect(conciliacao.saldoConciliado).toBe(0);
    expect(conciliacao.ok).toBe(true);
  });

  it('não troca natureza quando valor bruto tem D no texto do histórico', () => {
    const extracted = [
      row({
        historyText: 'TED RECEBIDA',
        isNegative: false,
        parsedValue: 1000,
        valueText: '1.000,00',
      }),
      row({
        historyText: 'PAGAMENTO BOLETO',
        isNegative: true,
        parsedValue: -500,
        valueText: '500,00',
      }),
    ];
    const ocr = mapExtractedRowsToRecorteFielOcr(extracted);
    const { items, conciliacao } = mapRecorteFielRowsToImportItems(ocr);
    expect(items.map((i) => i.nature)).toEqual(['C', 'D']);
    expect(conciliacao.creditos).toBe(1000);
    expect(conciliacao.debitos).toBe(500);
  });
});
