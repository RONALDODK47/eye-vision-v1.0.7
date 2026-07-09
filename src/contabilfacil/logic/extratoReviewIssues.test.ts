import { describe, expect, it } from 'vitest';
import type { ExtratoExtractQuality } from './extratoQualityGate';
import {
  buildExtratoReviewIssueRows,
  classifyExtratoReviewRow,
  filterSkippedPagesForExtratoReview,
} from './extratoReviewIssues';

describe('extratoReviewIssues', () => {
  it('marca histórico inválido (---)', () => {
    const issue = classifyExtratoReviewRow(
      {
        data: '02/04/2026',
        descricao: '---',
        valorMisto: '0,66 C',
        _linhaOcr: '02/04/2026 --- 0,66',
      },
      0,
    );
    expect(issue?.kinds).toContain('sem_historico');
  });

  it('coluna débito OK não gera pendência', () => {
    const issue = classifyExtratoReviewRow(
      {
        data: '02/04/2026',
        descricao: 'TED',
        valorDebito: '1.000,00',
        valorCredito: '',
        _linhaOcr: '02/04/2026 TED 1.000,00',
      },
      0,
    );
    expect(issue).toBeNull();
  });

  it('não acusa página sem OCR se já há lançamentos dela', () => {
    const skipped = filterSkippedPagesForExtratoReview([1, 2], [
      { data: '01/04/2026', descricao: 'PIX', valorCredito: '10,00', _pagina: '1' },
    ]);
    expect(skipped).toEqual([2]);
    const issues = buildExtratoReviewIssueRows({
      rows: [{ data: '01/04/2026', descricao: 'PIX', valorCredito: '10,00', _pagina: '1' }],
      skippedPages: [1, 2],
    });
    expect(issues.some((i) => i.pagina === 1 && i.kinds.includes('pagina_sem_ocr'))).toBe(false);
    expect(issues.some((i) => i.pagina === 2 && i.kinds.includes('pagina_sem_ocr'))).toBe(true);
  });

  it('linha OK não entra na lista', () => {
    const issues = buildExtratoReviewIssueRows({
      rows: [
        {
          data: '03/04/2026',
          descricao: 'PIX RECEBIDO',
          valorCredito: '100,00',
          _linhaOcr: '03/04/2026 PIX RECEBIDO 100,00 C',
        },
      ],
    });
    expect(issues.filter((i) => i.key.startsWith('row-'))).toHaveLength(0);
  });

  it('estima débito faltante pela conciliação', () => {
    const quality: ExtratoExtractQuality = {
      ok: false,
      saldoAnteriorDocumentado: true,
      saldoFinalInformado: true,
      conciliacaoOk: false,
      delta: 5000,
      saldoConciliado: 9000,
      creditos: 10000,
      debitos: 5000,
      saldoAnterior: 40844.13,
      saldoFinal: 4124.73,
      rowCount: 31,
      minRowsExpected: 16,
      rowCountOk: true,
      issues: [],
      recommendedEscalation: 'none',
      escalationsApplied: [],
    };
    const issues = buildExtratoReviewIssueRows({
      rows: [],
      quality,
    });
    expect(issues.some((i) => i.kinds.includes('faltante') && i.nature === 'D')).toBe(true);
  });
});
