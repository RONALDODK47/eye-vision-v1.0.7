import { describe, expect, it } from 'vitest';
import { mapOcrRowsToImportItems } from '../contabilfacil/logic/ocrImportMapper';
import { parseOcrIgnoreLineWords } from './ocrExtratoPositional';
import type { OcrExtratoRow } from './ocrExtratoPositional';

const ignoreLineWords = parseOcrIgnoreLineWords('saldo anterior, saldo bloq, saldo do dia, saldo');

function countValue(items: { value: number }[], v: number) {
  return items.filter((i) => Math.abs(i.value - v) < 0.011).length;
}

describe('full fixture dup check', () => {
  it('counts', () => {
    const raw = [
      { data: '31/03/2026', descricao: 'SALDO ANTERIOR', _linhaOcr: '31/03/2026 SALDO ANTERIOR 40.844,13', _informativoSaldo: '1' },
      { data: '02/04/2026', descricao: 'IOF', valorMisto: '-0,65', _linhaOcr: '02/04/2026 IOF -0,65' },
      { data: '02/04/2026', descricao: 'RENDIMENTOS', valorMisto: '0,02', _linhaOcr: '02/04/2026 AUT MAIS RENDIMENTOS REND PAGO APLIC 0,02' },
      { data: '02/04/2026', _linhaOcr: '02/04/2026 02/04/2026 — SALDO TOTAL DISPONÍVEL DIA — TAR PLANO ADAPT 103/26 -169,00 40.674,50' },
      { data: '24/04/2026', _linhaOcr: '24/04/2026 SISPAG FORNECEDORES -37.498,09' },
      { data: '24/04/2026', _linhaOcr: '24/04/2026 24/04/2026 — SISPAG FORNECEDORES E GOIAS — SALDO TOTAL DISPONÍVEL DIA -543,22 5.044,98' },
      { data: '30/04/2026', _linhaOcr: '30/04/2026 29/04/2026 RECEBIMENTOS MUNICIPIO DE MINACU 02.215.275/0001-78 3.068,22' },
      { data: '30/04/2026', _linhaOcr: '30/04/2026 TED RECEBIDA 001.0652.RIBEIRAO P RIBEIRAO PINHAL CAM VER 1.030,00' },
      { data: '30/04/2026', _linhaOcr: '30/04/2026 30/04/2026 — SALDO TOTAL DISPONÍVEL DIA 1.030,00 4.124,73' },
    ];
    const { items } = mapOcrRowsToImportItems('extrato', raw, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    console.log('0.02 count', countValue(items, 0.02));
    console.log('3068 count', countValue(items, 3068.22));
    console.log('37498 count', countValue(items, 37498.09));
    console.log(
      items.filter((i) => Math.abs(i.value - 3068.22) < 0.01).map((i) => i.description),
    );
    console.log(
      items.filter((i) => Math.abs(i.value - 37498.09) < 0.01).map((i) => i.description),
    );
  });
});
