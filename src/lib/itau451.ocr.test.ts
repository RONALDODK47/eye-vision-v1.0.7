import { describe, expect, it } from 'vitest';
import { parseExtratoMoneyValue } from '../extratoVision/utils/extratoMoneyParse';
import {
  extratoCorrigirRowNaturezaValorDesalinhado,
  extratoValorLancamentoPreferidoDaLinha,
  scanValoresParaSplitExtrato,
} from './ocrExtratoPositional';

describe('451,21 OCR recovery', () => {
  it('parse and scan -451,21', () => {
    expect(parseExtratoMoneyValue('-451,21')).toBeCloseTo(451.21);
    expect(parseExtratoMoneyValue('-45,21')).toBeCloseTo(45.21);
    const linha =
      '20/04/2026 PAGAMENTOS TRIB COD BARRAS GOIANIA-TESOURO 01.612.092/0001-23 -451,21';
    const hits = scanValoresParaSplitExtrato(linha);
    expect(hits.some((h) => Math.abs(h.value - 451.21) < 0.01)).toBe(true);
    expect(extratoValorLancamentoPreferidoDaLinha(linha)?.value).toBeCloseTo(451.21);
  });

  it('corrige coluna OCR 45,21 quando linha tem -451,21', () => {
    const row = {
      data: '20/04/2026',
      descricao: 'PAGAMENTOS TRIB COD BARRAS GOIANIA-TESOURO',
      valorMisto: '-45,21',
      _linhaOcr:
        '20/04/2026 PAGAMENTOS TRIB COD BARRAS GOIANIA-TESOURO 01.612.092/0001-23 -451,21',
    };
    const out = extratoCorrigirRowNaturezaValorDesalinhado(row);
    expect(parseExtratoMoneyValue(out.valorMisto ?? '')).toBeCloseTo(451.21);
  });

  it('recupera 451,21 quando OCR perdeu dígito em toda a linha (45,21)', () => {
    const row = {
      data: '20/04/2026',
      descricao: 'PAGAMENTOS TRIB COD BARRAS GOIANIA-TESOURO',
      valorMisto: '-45,21',
      _linhaOcr:
        '20/04/2026 PAGAMENTOS TRIB COD BARRAS GOIANIA-TESOURO 01.612.092/0001-23 -45,21',
    };
    const out = extratoCorrigirRowNaturezaValorDesalinhado(row);
    expect(parseExtratoMoneyValue(out.valorMisto ?? '')).toBeCloseTo(451.21);
  });
});
