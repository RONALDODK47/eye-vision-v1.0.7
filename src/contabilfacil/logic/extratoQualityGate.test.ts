import { describe, expect, it } from 'vitest';
import { evaluateExtratoExtractQuality, enrichExtratoConfirmMeta } from './extratoQualityGate';

describe('extratoQualityGate', () => {
  it('aprova extração conciliada com saldo anterior documentado', () => {
    const rows = [
      { data: '02/04/2026', descricao: 'PIX', valorCredito: '100,00', valorDebito: '', valorMisto: '' },
      { data: '03/04/2026', descricao: 'TED', valorDebito: '50,05', valorCredito: '', valorMisto: '50,05 D' },
    ];
    const q = evaluateExtratoExtractQuality({
      rows,
      meta: {
        saldoAnterior: 40_844.13,
        saldoFinalEsperado: 4_124.73,
        conciliacaoRawRows: [
          {
            descricao: 'SALDO ANTERIOR',
            valorCredito: '40.844,13',
            _linhaOcr: 'SALDOANTERIOR 40.844,13',
          },
        ],
      },
      totalPages: 1,
    });
    expect(q.saldoAnteriorDocumentado).toBe(true);
    expect(q.saldoFinalInformado).toBe(true);
  });

  it('recomenda escala quando falta saldo anterior', () => {
    const q = evaluateExtratoExtractQuality({
      rows: [{ data: '01/04/2026', descricao: 'A', valorCredito: '10,00' }],
      meta: { saldoFinalEsperado: 100 },
      totalPages: 2,
    });
    expect(q.ok).toBe(false);
    expect(q.recommendedEscalation).toBe('resolution');
    expect(q.issues.some((i) => /Saldo anterior/i.test(i))).toBe(true);
  });

  it('enrichExtratoConfirmMeta injeta SA do texto OCR', () => {
    const meta = enrichExtratoConfirmMeta({
      rows: [],
      ocrText: 'Lançamentos SALDOANTERIOR 40.844,13',
    });
    expect(meta.saldoAnterior).toBeCloseTo(40_844.13, 0);
    expect(meta.conciliacaoRawRows?.length).toBeGreaterThan(0);
  });
});
