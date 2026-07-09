import { describe, expect, it } from 'vitest';
import {
  computeConciliacaoAi,
  fixBbTrailingSaldoAiRow,
  mergeAiExtratoRows,
  normalizeAiRows,
  normalizeSignedValorAiRow,
  parseSaldoBr,
  needsConciliacaoRepair,
  escolherSaldoAnteriorAi,
} from './ai-extract-utils.mjs';
import { detectBankHint, CONCILIACAO_TOLERANCIA_REAIS } from './ai-extract-prompts.mjs';

describe('detectBankHint', () => {
  it('detecta Banco do Brasil', () => {
    expect(detectBankHint('EXTRATO BANCO DO BRASIL.pdf', 'SISBB consultas')).toBe('bb');
  });

  it('detecta Itaú', () => {
    expect(detectBankHint('extrato-itau.pdf', '')).toBe('itau');
  });
});

describe('normalizeAiRows', () => {
  it('remove linha só de saldo anterior', () => {
    const rows = normalizeAiRows(
      [
        {
          data: '',
          descricao: 'SALDO ANTERIOR',
          valorCredito: '5.049,87',
        },
        {
          data: '02/03/2026',
          descricao: 'Pix - Recebido',
          valorCredito: '390,52',
          _linhaOcr: '02/03/2026 Pix - Recebido 390,52 C',
        },
      ],
      { bankHint: 'bb' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].data).toBe('02/03/2026');
  });

  it('corrige BB valor trailing saldo na linha OCR', () => {
    const row = fixBbTrailingSaldoAiRow({
      data: '01/04/2026',
      descricao: 'Pix - Recebido',
      valorCredito: '1234,56',
      _linhaOcr: '01/04/2026 Pix - Recebido 390,52 C 1.234,56 D',
    });
    expect(row.valorCredito).toBe('390,52');
    expect(row.valorDebito).toBe('');
  });

  it('limpa CPF colado em Pix', () => {
    const rows = normalizeAiRows(
      [
        {
          data: '01/04/2026',
          descricao: 'Pix - Recebido 33.081.298',
          valorCredito: '390,52',
          _linhaOcr: '01/04/2026 Pix - Recebido 33.081.298 390,52 C',
        },
      ],
      { bankHint: 'bb' },
    );
    expect(rows[0].descricao).toBe('Pix - Recebido');
  });

  it('converte valor negativo sem sufixo C/D em débito', () => {
    const row = normalizeSignedValorAiRow({
      data: '05/05/2026',
      descricao: 'Tarifa',
      valorMisto: '-100,00',
    });
    expect(row.valorDebito).toBe('100,00');
    expect(row.valorMisto).toBe('100,00 D');
  });
});

describe('computeConciliacaoAi', () => {
  it('fecha saldo com tolerância de 10 centavos', () => {
    const rows = [
      { data: '02/03/2026', descricao: 'A', valorCredito: '100,00' },
      { data: '03/03/2026', descricao: 'B', valorDebito: '50,05' },
    ];
    const c = computeConciliacaoAi(rows, 1000, 1049.95);
    expect(c.ok).toBe(true);
    expect(c.delta).toBeLessThanOrEqual(CONCILIACAO_TOLERANCIA_REAIS);
  });

  it('sinaliza divergência acima da tolerância', () => {
    const rows = [{ data: '02/03/2026', descricao: 'A', valorDebito: '100,00' }];
    const c = computeConciliacaoAi(rows, 1000, 800);
    expect(needsConciliacaoRepair(c)).toBe(true);
  });
});

describe('mergeAiExtratoRows', () => {
  it('não duplica lançamento igual', () => {
    const base = [{ data: '02/03/2026', descricao: 'Pix', valorCredito: '10,00' }];
    const extra = [{ data: '02/03/2026', descricao: 'Pix', valorCredito: '10,00' }];
    expect(mergeAiExtratoRows(base, extra)).toHaveLength(1);
  });
});

describe('escolherSaldoAnteriorAi', () => {
  it('ignora saldo inventado que fecha conciliação', () => {
    const rows = [{ data: '01/04/2026', descricao: 'PIX', valorCredito: '100,00' }];
    const sa = escolherSaldoAnteriorAi(rows, 183_519.35, 4_124.73, 'PIX 100,00');
    expect(sa).toBeNull();
  });

  it('usa SALDO ANTERIOR do OCR', () => {
    const sa = escolherSaldoAnteriorAi(
      [],
      999_999,
      4_124.73,
      'Lançamentos SALDOANTERIOR 40.844,13',
    );
    expect(sa).toBeCloseTo(40_844.13, 0);
  });
});
