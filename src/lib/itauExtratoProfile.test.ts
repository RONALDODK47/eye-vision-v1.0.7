import { describe, expect, it } from 'vitest';
import {
  avaliarExtratoConciliacaoItau,
  detectItauExtratoFromOcrText,
  detectItauExtratoFromRows,
  extrairSaldoFinalDisponivelDasRows,
  getItauExtratoMapImportOptions,
  ITAU_EXTRATO_IGNORE_LINE_WORDS,
  mergeItauIgnoreLineWords,
  resolveExtratoMapImportOptions,
} from './itauExtratoProfile';

describe('itauExtratoProfile', () => {
  it('detecta layout Itaú empresarial', () => {
    expect(
      detectItauExtratoFromRows([
        { _linhaOcr: '31/03/2026 SALDO ANTERIOR 40.844,13' },
        { _linhaOcr: '02/04/2026 IOF -0,65' },
        { _linhaOcr: '14/04/2026 TED RECEBIDA OURINHOS' },
        { _linhaOcr: '14/04/2026 SALDO TOTAL DISPONÍVEL DIA 7.225,85' },
      ]),
    ).toBe(true);
    expect(detectItauExtratoFromOcrText('SALDO TOTAL DISPONÍVEL DIA TED RECEB')).toBe(true);
  });

  it('merge ignore words sem duplicar', () => {
    const merged = mergeItauIgnoreLineWords(['tarifa', 'saldo anterior']);
    expect(merged).toContain('saldo do dia');
    expect(merged).toContain('tarifa');
    expect(merged.filter((w) => w === 'saldo anterior')).toHaveLength(1);
    expect(ITAU_EXTRATO_IGNORE_LINE_WORDS.length).toBeGreaterThan(0);
  });

  it('resolveExtratoMapImportOptions aplica perfil Itaú', () => {
    const rows = [{ _linhaOcr: '14/04/2026 SALDO TOTAL DISPONÍVEL DIA TED RECEB' }];
    const opts = resolveExtratoMapImportOptions(rows, ['tarifa']);
    expect(opts.perfilItau).toBe(true);
    expect(opts.extratoPreserveSegmentRows).toBe(true);
    expect(opts.ignoreLineWords).toContain('saldo do dia');
    expect(opts.ignoreLineWords).toContain('tarifa');
  });

  it('getItauExtratoMapImportOptions inclui preserveSegmentRows', () => {
    const opts = getItauExtratoMapImportOptions();
    expect(opts.extratoPreserveSegmentRows).toBe(true);
  });

  it('extrai saldo final da última linha SALDO TOTAL DISPONÍVEL', () => {
    const saldo = extrairSaldoFinalDisponivelDasRows([
      { _linhaOcr: '30/04/2026 SALDO TOTAL DISPONÍVEL DIA 100,00 4.124,73' },
    ] as import('./ocrExtratoPositional').OcrExtratoRow[]);
    expect(saldo).toBeCloseTo(4124.73, 2);
  });

  it('OK só com lançamentos — nunca exige saldo do PDF/OCR', () => {
    const res = avaliarExtratoConciliacaoItau({
      items: Array.from({ length: 10 }, () => ({ nature: 'C', value: 100 })),
      rawRows: [
        { _linhaOcr: '31/03/2026 SALDO ANTERIOR 40.844,13' },
        { _linhaOcr: '30/04/2026 SALDO TOTAL DISPONÍVEL DIA 28.370,27' },
      ],
      saldoAnterior: 0,
      skipped: [],
      perfilItau: true,
    });
    expect(res.ok).toBe(true);
    expect(res.saldoFinalOcr).toBeUndefined();
    expect(res.mensagem).not.toMatch(/OCR|PDF|diverge/i);
  });

  it('avaliarExtratoConciliacaoItau calcula Anterior + C − D (ignora saldo nativo do PDF)', () => {
    const res = avaliarExtratoConciliacaoItau({
      items: [
        { nature: 'C', value: 410_455.65 },
        { nature: 'D', value: 410_455.65 },
      ],
      rawRows: [
        { _linhaOcr: '30/04/2026 SALDO TOTAL DISPONÍVEL DIA 28.370,27' },
      ],
      saldoAnterior: 0,
      saldoFinalEsperado: 28_370.27,
      skipped: [],
      perfilItau: true,
    });
    expect(res.ok).toBe(true);
    expect(res.saldoConciliado).toBe(0);
    expect(res.saldoFinalOcr).toBeUndefined();
    expect(res.mensagem).toMatch(/Conciliação OK/i);
  });
});
