import { describe, expect, it } from 'vitest';
import { parseBbExtratoOcrLine } from './bbExtratoOcrParse';
import {
  collapseBbExtratoOcrLineDuplication,
  normalizeBbExtratoLineOcrForValorScan,
  normalizeBbExtratoValorGlued,
} from './bbExtratoOcrNormalize';
import { parseExtratoMoneyValue } from './extratoMoneyParse';
import {
  extratoConsolidarExtratoRowsParaImportacao,
  extratoRecuperarLancamentosFaltantesDoRaw,
  extratoLinhaBbIniciaNovoLancamento,
  buildHistoricoFromSegmento,
  inferDescricaoFromLinhaOcr,
  postProcessExtratoOcrRows,
  repararHistoricoBbExtratoRow,
  sanitizeExtratoOcrRowColumns,
  scanValoresTextoLinhaExtrato,
  type OcrExtratoRow,
} from '../../lib/ocrExtratoPositional';

describe('normalizeBbExtratoValorGlued', () => {
  it('corrige em dash colado e milhar ausente', () => {
    expect(normalizeBbExtratoValorGlued('—1.499,90D')).toContain('1.499,90');
    expect(normalizeBbExtratoValorGlued('—4160,00D')).toContain('4.160,00');
    expect(normalizeBbExtratoValorGlued('—4900,00D')).toContain('4.900,00');
  });

  it('corrige G e barras OCR', () => {
    expect(normalizeBbExtratoValorGlued('—G6650,68D')).toMatch(/6\.650,68/i);
    expect(normalizeBbExtratoValorGlued('—1.8/0,00')).toContain('1.800,00');
    expect(normalizeBbExtratoValorGlued('—1.49/,00D')).toContain('1.490,00');
    expect(normalizeBbExtratoValorGlued('—46/948D')).toContain('46.948');
  });

  it('corrige valor sem vírgula decimal', () => {
    const v = normalizeBbExtratoValorGlued('—884983D');
    expect(v).toMatch(/8\.?849,83/i);
  });

  it('corrige 7./34,94 (Rende Fácil)', () => {
    const v = normalizeBbExtratoValorGlued('—7./34,94D');
    expect(v).toMatch(/7\.734,94|7\.34,94/i);
  });
});

describe('parseBbExtratoOcrLine — valores OCR difíceis', () => {
  const casos = [
    {
      linha: '07/04/2026 0000 13105 144 Pix - Enviado 40.706 —1.499,90D',
      debito: 1499.9,
    },
    {
      linha: '09/04/2026 0000 13105 144 Pix - Enviado 40.904 —2.250,64D',
      debito: 2250.64,
    },
    {
      linha: '10/04/2026 0000 13105 144 Pix - Enviado 41.001 —4160,00D',
      debito: 4160,
    },
    {
      linha: '16/04/2026 0000 13105 144 16/04 Pix 09:10 Enviado (62)99848-0166 Vivo REFRICRIL DISTRIBUIDORA DE 41.601 —G6650,68D',
      debito: 6650.68,
    },
    {
      linha: '27/04/2026 0000 13105 144 Pix Enviado 42.705 —4900,00D',
      debito: 4900,
    },
  ];

  for (const { linha, debito } of casos) {
    it(`extrai ${debito} de ${linha.slice(0, 50)}…`, () => {
      const norm = normalizeBbExtratoLineOcrForValorScan(linha);
      const row = parseBbExtratoOcrLine(norm);
      expect(row).toBeTruthy();
      const v =
        parseExtratoMoneyValue(row!.valorDebito ?? '') ||
        parseExtratoMoneyValue(row!.valorMisto ?? '');
      expect(v).toBeCloseTo(debito, 1);
    });
  }
});

describe('scanValoresTextoLinhaExtrato BB', () => {
  it('detecta valor com em dash colado', () => {
    const linha =
      '07/04/2026 0000 13105 144 Pix - Enviado 40.706 —1.499,90D';
    const hits = scanValoresTextoLinhaExtrato(linha);
    expect(hits.some((h) => Math.abs(h.value - 1499.9) < 0.1)).toBe(true);
  });
});

describe('inferDescricaoFromLinhaOcr BB', () => {
  it('preserva documento 40.706 e ID Pix em pix recebido', () => {
    const linha =
      '01/04/2026 0000 14397 821 pix recebido 11.019.564.166.431 430,31 c';
    const desc = inferDescricaoFromLinhaOcr(linha, { _linhaOcr: linha });
    expect(desc.toLowerCase()).toContain('pix');
    expect(desc).toMatch(/11\.019\.564\.166\.431|430,31/);
  });

  it('preserva documento em pix enviado', () => {
    const linha = '07/04/2026 0000 13105 144 Pix - Enviado 40.706 —1.499,90D';
    const desc = inferDescricaoFromLinhaOcr(linha, { _linhaOcr: linha });
    expect(desc).toContain('40.706');
  });
});

describe('collapseBbExtratoOcrLineDuplication', () => {
  it('remove data e tokens duplicados', () => {
    const raw =
      '14/04/2026 14/04/2026 0000 0000 13105 13105 14/04 144 14/04 144 Pix Pix';
    const out = collapseBbExtratoOcrLineDuplication(raw);
    expect(out.match(/14\/04\/2026/g)?.length).toBe(1);
    expect(out.match(/\b0000\b/g)?.length).toBe(1);
    expect(out.match(/\bPix\b/gi)?.length).toBe(1);
  });
});

function bbRawRow(linha: string, extra: Partial<OcrExtratoRow> = {}): OcrExtratoRow {
  return {
    data: linha.slice(0, 10),
    descricao: '',
    _linhaOcr: linha,
    ...extra,
  };
}

describe('buildHistoricoFromSegmento — multilinha BB', () => {
  it('junta histórico em 3 linhas sem pegar o lançamento seguinte', () => {
    const linha1 =
      '13/04/2026 0000 13105 144 13/04 Pix 11:46 Enviado G.A.';
    const linha2 = 'PAULO SILVA HENRIQUE PARAFUSOS, RESENDE MAQU PEI';
    const linha3 = '41.306 —1.490,00D';

    const mkLine = (text: string, y: number, hasValor: boolean) => ({
      yTop: y,
      yBottom: y + 12,
      centerY: y + 6,
      hasValor,
      items: text.split(' ').map((str, i) => ({
        str,
        x: 40 + i * 50,
        y,
        w: 48,
        h: 12,
      })),
    });

    const segmento = {
      yTop: 100,
      yBottom: 148,
      linhas: [mkLine(linha1, 100, false), mkLine(linha2, 124, false), mkLine(linha3, 148, true)],
      cluster: [],
      valorToken: null,
      dataToken: null,
      historicoTokens: [],
      motivoFechamento: 'proximo_valor' as const,
    };

    const hist = buildHistoricoFromSegmento(segmento, undefined, 800);
    expect(hist).toContain('G.A.');
    expect(hist).toContain('PAULO SILVA');
    expect(hist).toContain('PARAFUSOS');
    expect(hist).not.toContain('41.401');
  });

  it('detecta início de novo lançamento BB', () => {
    expect(
      extratoLinhaBbIniciaNovoLancamento(
        '14/04/2026 0000 13105 144 Pix Enviado 41.401 —884,98D',
        true,
      ),
    ).toBe(true);
    expect(extratoLinhaBbIniciaNovoLancamento('PAULO SILVA HENRIQUE PARAFUSOS', false)).toBe(
      false,
    );
  });
});

describe('pós-processamento BB — recuperação e histórico', () => {
  const linhasRejeitadas = [
    '07/04/2026 0000 13105 144 Pix - Enviado 40.706 —1.499,90D',
    '09/04/2026 0000 13105 144 Pix - Enviado 40.904 —2.250,64D',
    '27/04/2026 0000 13105 144 Pix Enviado 42.705 —4900,00D',
  ];

  for (const linha of linhasRejeitadas) {
    it(`recupera lançamento: ${linha.slice(0, 45)}…`, () => {
      const raw = [bbRawRow(linha)];
      const processed = postProcessExtratoOcrRows(raw, '2026', { preserveSegmentRows: true });
      const consolidated = extratoConsolidarExtratoRowsParaImportacao(processed, raw);
      const recuperados = extratoRecuperarLancamentosFaltantesDoRaw([], raw);
      const out = consolidated.length > 0 ? consolidated : recuperados;
      expect(out.length).toBeGreaterThan(0);
      const valor =
        parseExtratoMoneyValue(out[0]!.valorDebito ?? '') ||
        parseExtratoMoneyValue(out[0]!.valorMisto ?? '');
      expect(valor).toBeGreaterThan(100);
    });
  }

  it('preserva documento 40.101 após sanitize + reparar', () => {
    const linha = '01/04/2026 0000 13105 144 Pix - Enviado 40.101 — 1.226,07D';
    const row = bbRawRow(linha, {
      descricao: 'Pix - Enviado 40.101 —',
      valorDebito: '1.226,07',
    });
    const sanitized = sanitizeExtratoOcrRowColumns(row);
    const repaired = repararHistoricoBbExtratoRow(sanitized);
    expect(repaired.descricao).toContain('40.101');
  });

  it('preserva código 9.903 (Rende Fácil)', () => {
    const linha =
      '01/04/2026 0000 00000 351 BB Rende Fácil 9.903 — 3.974,62D 0,00 C';
    const row = bbRawRow(linha, {
      descricao: 'BB Rende Fácil 9.903 —',
      valorDebito: '3.974,62',
    });
    const repaired = repararHistoricoBbExtratoRow(sanitizeExtratoOcrRowColumns(row));
    expect(repaired.descricao).toMatch(/9\.903/);
  });
});

describe('mapOcrRowsToImportItems — linhas rejeitadas abril/2026', () => {
  const linhasRejeitadasAuditoria = [
    '07/04/2026 0000 13105 144 Pix - Enviado 40.706 —1.499,90D',
    '09/04/2026 0000 13105 144 Pix - Enviado 40.904 —2.250,64D',
    '10/04/2026 0000 13105 144 Pix - Enviado 41.001 —4160,00D',
    '10/04/2026 0000 00000 351 88 Rende Fácil 9.903 —7./34,94D 0,00 C',
    '13/04/2026 0000 13105 13/04 144 13/04 Pix 11:46 11:46 Enviado G.A. PAULO SILVA HENRIQUE PARAFUSOS, RESENDE MAQU PEI 41.306 —1.49/,00D 714,00 D',
    '14/04/2026 14/04/2026 0000 0000 13105 13105 14/04 144 14/04 144 Pix Pix 10:49 10:49 Enviado Enviado FRIOVIX COMERCIO FRIOVIX COMERCIO DE DE REFRIGERACAO LTDA 41.401 —884,98D',
    '14/04/2026 0000 13105 14/04 144 14/04 Pix 10:50 AA 11:32 Enviado LUIZ ALVES FRIGELAR SA TAVEIRA 41.404 —884983D 64,00 D',
    '16/04/2026 0000 13105 144 16/04 Pix 09:10 Enviado (62)99848-0166 Vivo REFRICRIL DISTRIBUIDORA DE 41.601 —G6650,68D',
    '23/04/2026 0000 13105 23/04 144 Pix 15:29 Enviado À ECONOMICA COMERCIO 42.310 —1.8/0,00 251,382D',
    '27/04/2026 0000 14397 271/04 821 27/04 Pix 15:21 15:57 48522310000100 Recebido 64711858000147 64.711.858 IVANDI 271.557.061.629.372 DE 0 — 430,31 C',
    '27/04/2026 0000 13105 144 Pix Enviado 42.705 —4900,00D',
    '30/04/2026 0000 13105 GAZIN 109 Pagamento de Boleto Pagamento de Boleto INDUSTRIA E COMERCIO DE 43.004 —46/948D 107,58 D',
    '30/04/2026 30/04/2026 0000 0000 13105 13105 TRANSPORTADORA TRANS ELGIN 109 109 Pagamento de Boleto Pagamento de Boleto DISTRIBUIDORA LTDA E COMERCIO DE 43.005 —1.248,80D',
  ];

  it('scan: linhas ainda problemáticas', () => {
    const casos = [
      '10/04/2026 0000 00000 351 88 Rende Fácil 9.903 —7./34,94D 0,00 C',
      '16/04/2026 0000 13105 144 16/04 Pix 09:10 Enviado (62)99848-0166 Vivo REFRICRIL DISTRIBUIDORA DE 41.601 —G6650,68D',
      '23/04/2026 0000 13105 23/04 144 Pix 15:29 Enviado À ECONOMICA COMERCIO 42.310 —1.8/0,00 251,382D',
    ];
    for (const linha of casos) {
      const norm = normalizeBbExtratoLineOcrForValorScan(linha);
      const hits = scanValoresTextoLinhaExtrato(norm);
      const row = parseBbExtratoOcrLine(norm);
      expect(hits.length, `sem hits: ${linha.slice(0, 40)}`).toBeGreaterThan(0);
      expect(row, `parse null: ${linha.slice(0, 40)}`).toBeTruthy();
    }
  });

  it(
    'importa sem rejeitar linhas BB difíceis',
    async () => {
      const { mapOcrRowsToImportItems } = await import('../../contabilfacil/logic/ocrImportMapper');
      const raw = linhasRejeitadasAuditoria.map((linha) => bbRawRow(linha));
      const { items, skipped } = mapOcrRowsToImportItems('extrato', raw, {
        extratoPreserveSegmentRows: true,
        extratoImportLogContext: { logToConsole: false },
      });
      const rejeitados = skipped.filter((s) => s.category === 'rejeitado' && s.severity === 'error');
      expect(rejeitados).toHaveLength(0);
      expect(items.length).toBeGreaterThanOrEqual(linhasRejeitadasAuditoria.length - 2);
    },
    30_000,
  );

  it('não trunca documento 40.101 nem código 9.903 no histórico', async () => {
    const { mapOcrRowsToImportItems } = await import('../../contabilfacil/logic/ocrImportMapper');
    const raw = [
      bbRawRow('01/04/2026 0000 13105 144 Pix - Enviado 40.101 — 1.226,07D', {
        descricao: 'Pix - Enviado 40.101 —',
        valorDebito: '1.226,07',
      }),
      bbRawRow('01/04/2026 0000 00000 351 BB Rende Fácil 9.903 — 3.974,62D 0,00 C', {
        descricao: 'BB Rende Fácil 9.903 —',
        valorDebito: '3.974,62',
      }),
    ];
    const { items, skipped } = mapOcrRowsToImportItems('extrato', raw, {
      extratoPreserveSegmentRows: true,
    });
    const truncados = skipped.filter(
      (s) =>
        s.category === 'historico_ajustado' &&
        /Antes:.*40\.101.*Depois:.*\b1\b/i.test(s.detail ?? ''),
    );
    expect(truncados).toHaveLength(0);
    const item101 = items.find((i) => String(i.description).includes('40.101'));
    expect(item101).toBeTruthy();
    const item903 = items.find((i) => String(i.description).match(/9\.903/));
    expect(item903).toBeTruthy();
  });

  it('mantém três TEDs iguais no mesmo dia (documentos distintos)', () => {
    const base =
      '25/05/2026 0000 14175 976 TED-Crédito em Conta 104 3961 18431312000115 PREF MUN DE UB';
    const raw: OcrExtratoRow[] = [
      bbRawRow(`${base} 100.336.373 1.039,50 C`, {
        descricao: 'TED-Crédito em Conta',
        valorCredito: '1.039,50',
      }),
      bbRawRow(`${base} 100.336.683 1.039,50 C`, {
        descricao: 'TED-Crédito em Conta',
        valorCredito: '1.039,50',
      }),
      bbRawRow(`${base} 100.336.684 1.039,50 C`, {
        descricao: 'TED-Crédito em Conta',
        valorCredito: '1.039,50',
      }),
    ];
    const out = extratoConsolidarExtratoRowsParaImportacao(raw, raw, []);
    const comValor = out.filter(
      (r) => parseExtratoMoneyValue(r.valorCredito ?? r.valorMisto ?? '') > 1000,
    );
    expect(comValor.length).toBe(3);
  });

  it('scan encontra 14.552,00 C após código longo BB', () => {
    const linha =
      '26/05/2026 0000 14056 632 Ordem Banc 12 Sec Tes Nac 2.490.265.000.000 14.552,00 C';
    const hits = scanValoresTextoLinhaExtrato(linha);
    const op = hits.find((h) => Math.abs(h.value - 14552) < 1);
    expect(op?.nature).toBe('C');
  });
});
