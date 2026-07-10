import { describe, expect, it } from 'vitest';
import type { ExtractedRow } from './types';
import { propagateExtractedRowDates } from './cropper';

function row(partial: Partial<ExtractedRow>): ExtractedRow {
  return {
    id: partial.id ?? '1',
    dateText: partial.dateText ?? '',
    historyText: partial.historyText ?? '',
    valueText: partial.valueText ?? '',
    dateCropUrl: '',
    historyCropUrl: '',
    valueCropUrl: '',
    isNegative: partial.isNegative ?? false,
    parsedValue: partial.parsedValue ?? null,
    y: 0,
    height: 10,
  };
}

describe('propagateExtractedRowDates', () => {
  it('repete a data do dia nas linhas sem data (Bradesco/Carol)', () => {
    const rows = propagateExtractedRowDates(
      [
        row({
          dateText: '01/12/2025',
          historyText: 'LIQUIDACAO DE COBRANCA',
          valueText: '261,47',
          parsedValue: 261.47,
        }),
        row({
          historyText: 'LIQUIDACAO COBRANCA DESC',
          valueText: '206,64',
          parsedValue: 206.64,
        }),
        row({
          historyText: 'PAGTO ELETRON COBRANCA',
          valueText: '-3.906,27',
          parsedValue: -3906.27,
          isNegative: true,
        }),
        row({
          dateText: '02/12/2025',
          historyText: 'VALOR DISPONIVEL',
          valueText: '1.409,94',
          parsedValue: 1409.94,
        }),
        row({
          historyText: 'CHEQUE COMPENSADO',
          valueText: '-4.905,00',
          parsedValue: -4905,
          isNegative: true,
        }),
      ],
      '2025',
    );

    expect(rows[0].dateText).toBe('01/12/2025');
    expect(rows[1].dateText).toBe('01/12/2025');
    expect(rows[2].dateText).toBe('01/12/2025');
    expect(rows[3].dateText).toBe('02/12/2025');
    expect(rows[4].dateText).toBe('02/12/2025');
  });

  it('propaga entre páginas quando o 1º lançamento da pág. 2 não traz data', () => {
    const rows = propagateExtractedRowDates(
      [
        row({
          dateText: '01/12/2025',
          historyText: 'LANC A',
          valueText: '100,00',
          parsedValue: 100,
        }),
        row({
          historyText: 'LANC B',
          valueText: '200,00',
          parsedValue: 200,
        }),
      ],
      '2025',
    );
    expect(rows[1].dateText).toBe('01/12/2025');
  });
});
