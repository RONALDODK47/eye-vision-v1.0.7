/**
 * Itaú abr/2026 — fluxo OCR puro (como DocumentColunasModal + DataIngestionBox).
 * Simula _linhaOcr do OCR posicional, sem texto nativo do PDF.
 */
import { describe, expect, it } from 'vitest';
import {
  parseOcrIgnoreLineWords,
  postProcessExtratoOcrRows,
  prepararExtratoOcrRowsParaRevisao,
  repararExtratoRowsPosProcessados,
  resolveExtratoDescricaoText,
  scanValoresParaSplitExtrato,
  parearValoresOrfaosComHistoricoSemValor,
  extratoValorOperacionalJaResolvidoNasRows,
  extrairSaldoAnteriorDasRows,
  extratoRowEhSaldoInformativo,
  resolverExtratoSaldoAnteriorImportacao,
  resolverSaldoAnteriorParaMetaExtrato,
  extrairSaldoAnteriorDeTextoOcr,
} from './ocrExtratoPositional';
import { parseExtratoMoneyValue } from '../extratoVision/utils/extratoMoneyParse';
import { mapOcrRowsToImportItems } from '../contabilfacil/logic/ocrImportMapper';
import { consolidarExtratoItauParaImportacao } from './itauExtratoProfile';
import type { OcrExtratoRow } from './ocrExtratoPositional';

const EXPECTED_SA = 40_844.13;
const EXPECTED_FINAL = 4_124.73;
const ignoreLineWords = parseOcrIgnoreLineWords('saldo anterior, saldo bloq, saldo do dia');

function pipelineOcrUi(raw: OcrExtratoRow[]) {
  const posProcessado = postProcessExtratoOcrRows(raw, '2026', {
    ignoreLineWords,
    preserveSegmentRows: true,
  }).map((r) => ({ ...r, _extratoPosProcessado: '1' as const }));

  return mapOcrRowsToImportItems('extrato', posProcessado, {
    ignoreLineWords,
    extratoPreserveSegmentRows: true,
  });
}

/** Linhas OCR típicas do extrato Itaú Polo Sul abr/2026 (travessão em dash). */
function buildItauAbr2026OcrRows(): OcrExtratoRow[] {
  return [
    { data: '31/03/2026', descricao: 'SALDO ANTERIOR', _linhaOcr: '31/03/2026 SALDO ANTERIOR 40.844,13', _informativoSaldo: '1' },
    { data: '02/04/2026', descricao: 'IOF', valorMisto: '-0,65', _linhaOcr: '02/04/2026 IOF -0,65' },
    { data: '02/04/2026', descricao: 'RENDIMENTOS', valorMisto: '0,02', _linhaOcr: '02/04/2026 AUT MAIS RENDIMENTOS REND PAGO APLIC 0,02' },
    {
      data: '02/04/2026',
      _linhaOcr:
        '02/04/2026 02/04/2026 — SALDO TOTAL DISPONÍVEL DIA — TAR PLANO ADAPT 103/26 -169,00 40.674,50',
    },
    { data: '06/04/2026', descricao: 'RENDIMENTOS', valorMisto: '0,66', _linhaOcr: '06/04/2026 AUT MAIS RENDIMENTOS REND PAGO APLIC 0,66' },
    { data: '06/04/2026', _linhaOcr: '06/04/2026 06/04/2026 — SISPAG FORNECEDORES -9.118,05' },
    { data: '06/04/2026', _linhaOcr: '06/04/2026 SISPAG FORNECEDORES -31.030,02' },
    {
      data: '06/04/2026',
      _linhaOcr:
        '06/04/2026 06/04/2026 — SISPAG FORNECEDORES SANEAGO — SALDO TOTAL DISPONÍVEL DIA -207,16 319,93',
    },
    {
      data: '14/04/2026',
      descricao: 'TED RECEBIDA OURINHOS',
      _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL',
    },
    { data: '14/04/2026', _linhaOcr: '14/04/2026 14/04/2026 6.905,92' },
    { data: '15/04/2026', descricao: 'RENDIMENTOS', valorMisto: '0,04', _linhaOcr: '15/04/2026 AUT MAIS RENDIMENTOS REND PAGO APLIC 0,04' },
    {
      data: '15/04/2026',
      _linhaOcr:
        '15/04/2026 15/04/2026 — SISPAG FORNECEDORES — SALDO TOTAL DISPONÍVEL DIA 17.225,00 -9.999,11',
    },
    {
      data: '16/04/2026',
      _linhaOcr:
        '16/04/2026 TED 041.0310.CAMARA M D DE P FUND CAMARA MUN. DE VEREADORES 25.636,00',
    },
    {
      data: '16/04/2026',
      _linhaOcr:
        '16/04/2026 20/04/2026 — SALDO TOTAL DISPONÍVEL DIA — PAGAMENTOS TRIBCODBARRAS — GOIANIA-TESOURO 01.612.092/0001-23 -451,21 15.636,89',
    },
    { data: '20/04/2026', descricao: 'RENDIMENTOS', valorMisto: '0,04', _linhaOcr: '20/04/2026 AUT MAIS RENDIMENTOS REND PAGO APLIC 0,04' },
    { data: '20/04/2026', _linhaOcr: '20/04/2026 SISPAG FORNECEDORES -13.917,09' },
    {
      data: '20/04/2026',
      _linhaOcr:
        '20/04/2026 20/04/2026 — SISPAG FORNECEDORES — SALDO TOTAL DISPONÍVEL DIA -277,74 990,89',
    },
    {
      data: '22/04/2026',
      _linhaOcr:
        '22/04/2026 22/04/2026 — TEDRECEBIDA 001.1441.S5P3FIS — SALDO TOTAL DISPONÍVEL DIA — SP350945FMS INVEST SUS 13.985.276/0001-18 1.768,52 2.759,39',
    },
    { data: '23/04/2026', _linhaOcr: '23/04/2026 PIX RECEBIDO POLO S POLO S CLIMATIZACAO LTDA 3.000,00' },
    { data: '23/04/2026', descricao: 'RENDIMENTOS', valorMisto: '0,01', _linhaOcr: '23/04/2026 AUT MAIS RENDIMENTOS REND PAGO APLIC 0,01' },
    {
      data: '23/04/2026',
      _linhaOcr:
        '23/04/2026 23/04/2026 — SISPAG FORNECEDORES PIX OR- — SALDO TOTAL DISPONÍVEL DIA CODE 5.697,93 61,49',
    },
    {
      data: '24/04/2026',
      _linhaOcr:
        '24/04/2026 MUNICIPIO DE FOZ DO IGUACU TED RECEBIDA 001.0140.MUNICIPIO 44.558,80',
    },
    { data: '24/04/2026', _linhaOcr: '24/04/2026 PAGAMENTOS TRIB COD BARRAS SEFAZ-GO/SARE-DARE -1.534,00' },
    { data: '24/04/2026', _linhaOcr: '24/04/2026 SISPAG FORNECEDORES -37.498,09' },
    {
      data: '24/04/2026',
      _linhaOcr:
        '24/04/2026 24/04/2026 — SISPAG FORNECEDORES E GOIAS — SALDO TOTAL DISPONÍVEL DIA -543,22 5.044,98',
    },
    { data: '29/04/2026', _linhaOcr: '29/04/2026 SISPAG FORNECEDORES -70.870,00' },
    { data: '29/04/2026', descricao: 'RENDIMENTOS', valorMisto: '0,03', _linhaOcr: '29/04/2026 AUT MAIS RENDIMENTOS REND PAGO APLIC 0,03' },
    {
      data: '29/04/2026',
      _linhaOcr:
        '29/04/2026 MUNICIPIO DE FOZ DO IGUACU TED RECEBIDA 001.0140.MUNICIPIO 89.117,60',
    },
    {
      data: '29/04/2026',
      _linhaOcr: '29/04/2026 29/04/2026 — SALDO TOTAL DISPONÍVEL DIA — CODE -23.266,10 26,51',
    },
    {
      data: '30/04/2026',
      _linhaOcr:
        '30/04/2026 29/04/2026 RECEBIMENTOS MUNICIPIO DE MINACU 02.215.275/0001-78 3.068,22',
    },
    {
      data: '30/04/2026',
      _linhaOcr:
        '30/04/2026 TED RECEBIDA 001.0652.RIBEIRAO P RIBEIRAO PINHAL CAM VER 1.030,00',
    },
    {
      data: '30/04/2026',
      _linhaOcr: '30/04/2026 30/04/2026 — SALDO TOTAL DISPONÍVEL DIA 1.030,00 4.124,73',
    },
  ];
}

describe('Itaú abr/2026 — pipeline OCR puro (UI)', () => {
  it(
    'importa lançamentos e bate créditos − débitos (sem coluna Saldo)',
    () => {
    const { items, skipped } = pipelineOcrUi(buildItauAbr2026OcrRows());
    const credits = items.filter((i) => i.nature === 'C').reduce((s, i) => s + i.value, 0);
    const debits = items.filter((i) => i.nature === 'D').reduce((s, i) => s + i.value, 0);

    expect(debits).toBeLessThan(250_000);
    expect(credits).toBeLessThan(250_000);
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 25636) < 0.05 && i.nature === 'C')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 1030) < 0.05 && i.nature === 'C')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 3068.22) < 0.05 && i.nature === 'C')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 23266.1) < 0.05 && i.nature === 'D')).toBe(true);
    expect(skipped.some((s) => s.category === 'sem_historico' && /6\.905/.test(s.preview ?? ''))).toBe(
      false,
    );
    expect(items.some((i) => Math.abs(i.value - 17225) < 0.05 && i.nature === 'D')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 9999.11) < 0.05 && i.nature === 'D')).toBe(false);
    expect(items.some((i) => Math.abs(i.value - 40674.5) < 0.05)).toBe(false);
    expect(items.some((i) => Math.abs(i.value - 0.03) < 0.05 && i.nature === 'C')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 5697.93) < 0.05 && i.nature === 'D')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 37498.09) < 0.05 && i.nature === 'D')).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(27);
  },
  15_000,
  );

  it(
    'saldo conciliado bate saldo final OCR (abr/2026)',
    () => {
    const { items, saldoAnteriorDetectado, conciliacao } = mapOcrRowsToImportItems(
      'extrato',
      buildItauAbr2026OcrRows(),
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    const credits = items.filter((i) => i.nature === 'C').reduce((s, i) => s + i.value, 0);
    const debits = items.filter((i) => i.nature === 'D').reduce((s, i) => s + i.value, 0);
    const sa = saldoAnteriorDetectado ?? 0;
    expect(sa + credits - debits).toBeCloseTo(EXPECTED_FINAL, 0);
    expect(conciliacao?.saldoConciliado).toBeCloseTo(EXPECTED_FINAL, 0);
    expect(conciliacao?.ok).toBe(true);
  },
  15_000,
  );

  it('fluxo DocumentColunasModal: linhas OCR brutas + preserveSegmentRows (sem _extratoPosProcessado)', () => {
    const raw = buildItauAbr2026OcrRows();
    const { items, saldoAnteriorDetectado, skipped } = mapOcrRowsToImportItems('extrato', raw, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });

    const sa = saldoAnteriorDetectado ?? 0;
    const credits = items.filter((i) => i.nature === 'C').reduce((s, i) => s + i.value, 0);
    const debits = items.filter((i) => i.nature === 'D').reduce((s, i) => s + i.value, 0);

    expect(sa).toBeCloseTo(EXPECTED_SA, 2);
    expect(items.length).toBeGreaterThanOrEqual(26);
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 17225) < 0.05 && i.nature === 'D')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 9999.11) < 0.05 && i.nature === 'D')).toBe(false);
    expect(skipped.some((s) => s.category === 'sem_historico' && /6\.905/.test(s.preview ?? ''))).toBe(
      false,
    );
    expect(credits).toBeGreaterThan(170_000);
    expect(debits).toBeGreaterThan(211_000);
    expect(debits).toBeLessThan(212_500);
  });

  it('DataIngestionBox: linhas brutas pareiam 6.905,92 ao TED', () => {
    const { items, skipped } = mapOcrRowsToImportItems('extrato', buildItauAbr2026OcrRows(), {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });

    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(skipped.some((s) => s.category === 'sem_historico' && /6\.905/.test(s.preview ?? ''))).toBe(
      false,
    );
  });

  it(
    'não usa saldo final do PDF/OCR na conciliação (só Anterior + C − D)',
    () => {
    const raw = buildItauAbr2026OcrRows();
    const { conciliacao, saldoAnteriorDetectado } = mapOcrRowsToImportItems('extrato', raw, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    expect(saldoAnteriorDetectado).toBeCloseTo(EXPECTED_SA, 2);
    expect(conciliacao?.saldoFinalOcr).toBeUndefined();
    expect(conciliacao?.ok).toBe(true);
    expect(conciliacao?.mensagem).not.toMatch(/OCR|diverge|PDF/i);
  },
  15_000,
  );

  it('repararExtratoRowsPosProcessados aplica limpeza Itaú dupla coluna', () => {
    const raw = postProcessExtratoOcrRows(
      [
        {
          data: '15/04/2026',
          valorMisto: '17.225,00',
          _linhaOcr:
            '15/04/2026 15/04/2026 — SISPAG FORNECEDORES — SALDO TOTAL DISPONÍVEL DIA 17.225,00 -9.999,11',
          _extratoPosProcessado: '1',
        },
      ],
      '2026',
      { ignoreLineWords, preserveSegmentRows: true },
    );
    const reparado = repararExtratoRowsPosProcessados(raw);
    expect(reparado).toHaveLength(1);
    expect(String(reparado[0]!.valorMisto ?? '')).toMatch(/17\.225,00/);
    expect(parseExtratoMoneyValue(String(reparado[0]!.valorMisto ?? ''))).toBeCloseTo(17225, 2);
  });
});

/** Linhas OCR reais do log de auditoria Itaú abr/2026 (Polo Sul). */
function buildItauAbr2026OcrLinhasAuditoria(): OcrExtratoRow[] {
  const linhas = [
    '31/03/2026 SALDO ANTERIOR 40.844,13',
    '02/04/2026 — UT MAIS RENDIMENTOS REND PAGO APLIC 0,02',
    '02/04/2026 — TAR PLANO ADAPT 103/26 -169,00',
    '06/04/2026 — A TMAIS RENDIMENTOS REND PAGO APLIC 0,66',
    '06/04/2026 — SISPAG FORNECEDORES -9.118,05',
    '06/04/2026 — SISPAG FORNECEDORES -31.030,02',
    '06/04/2026 — SISPAG FORNECEDORES SANEAGO -207,16',
    '14/04/2026 O RECEBIDA 104.0327.OURINHOS 5 INHOS CAMARA MUNICIPAL — 54.710.595/0001-06 6.905,92',
    '15/04/2026 — AUT MAIS RENDIMENTOS REND PAGO APLIC 0,04',
    '15/04/2026 — SISPAG FORNECEDORES 17.225,00',
    '20/04/2026 — PAGAMENTOS TRIBCODBARRAS — GOIANIA-TESOURO 01.612.092/0001-23 -451,21',
    '20/04/2026 — UT MAIS RENDIMENTOS REND PAGO APLIC 0,04',
    '20/04/2026 — SISPAG FORNECEDORES -13.917,09',
    '20/04/2026 — SISPAG FORNECEDORES -277,74',
    '22/04/2026 — TEDRECEBIDA 001.1441.S5P3FIS — SP350945FMS INVEST SUS 13.985.276/0001-18 1.768,52',
    '23/04/2026 — PIXRECEBIDO POLO S 23/04 POLO S CLIMATIZACAO LTDA 58.952.046/0001-90 3.000,00',
    '23/04/2026 — A UTMAIS RENDIMENTOS REND PAGO APLIC 0,01',
    '23/04/2026 — SISPAG FORNECEDORES PIX OR- CODE 5.697,93',
    '24/04/2026 5º RECEBIDA 001.0140.MUNICÍPIO 1 yNICIPIO DE FOZ DO IGUACU 76.206.606/0001-40 44.558,80',
    '24/04/2026 — PAGAMENTOS TRIBCODBARRAS — SEFAZ-GO/SARE-DARE 01.409.655/0001-80 -1.534,00',
    '24/04/2026 — SISPAG FORNECEDORES -37.498,09',
    '24/04/2026 — SISPAG FORNECEDORES E GOIAS -543,22',
    '29/04/2026 — SISPAG FORNECEDORES -70.870,00',
    '29/04/2026 — A UTMAIS RENDIMENTOS REND PAGO APLIC 0,03',
    '29/04/2026 5º RECEBIDA 001.0140.MUNICÍPIO 1 yNICIPIO DE FOZ DO IGUACU 76.206.606/0001-40 89.117,60',
    '29/04/2026 — SISPAG FORNECEDORES SISPAG FORNECEDORES PIX QR- -70.870,00',
    '30/04/2026 — RECEBIMENTOS MUNICIPIO DE MINACU 02.215.275/0001-78 3.068,22',
    '30/04/2026 — TED RECEBIDA 001.0652.RIBEIRAO P RIBEIRAO PINHAL CAM VER 77.778.751/0001-68 1.030,00',
  ];
  return linhas.map((linha) => ({
    data: linha.slice(0, 10),
    descricao: '',
    _linhaOcr: linha,
  }));
}

describe('Itaú abr/2026 — linhas rejeitadas no audit OCR', () => {
  it('extrai 6.905,92 da linha monolítica O RECEBIDA OURINHOS', () => {
    const ourinhos =
      '14/04/2026 O RECEBIDA 104.0327.OURINHOS 5 INHOS CAMARA MUNICIPAL — 54.710.595/0001-06 6.905,92';
    const hits = scanValoresParaSplitExtrato(ourinhos);
    expect(hits.some((h) => Math.abs(h.value - 6905.92) < 0.05)).toBe(true);
    const out = postProcessExtratoOcrRows(
      [{ data: '14/04/2026', descricao: '', _linhaOcr: ourinhos }],
      '2026',
      { ignoreLineWords, preserveSegmentRows: true },
    );
    expect(
      out.some((r) => parseExtratoMoneyValue(r.valorMisto ?? '') > 6900),
    ).toBe(true);
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [{ data: '14/04/2026', descricao: '', _linhaOcr: ourinhos }],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(skipped.filter((s) => s.category === 'sem_historico')).toHaveLength(0);
  });

  it('postProcess com ignore Itaú mesclado mantém TED 6.905,92', async () => {
    const { mergeItauIgnoreLineWords } = await import('./itauExtratoProfile');
    const raw = [
      { _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL' },
      {
        _linhaOcr:
          '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
      },
    ];
    const merged = mergeItauIgnoreLineWords(ignoreLineWords);
    const pp = postProcessExtratoOcrRows(raw, '2026', {
      ignoreLineWords: merged,
      preserveSegmentRows: true,
    });
    expect(pp.length).toBeGreaterThan(0);
    expect(
      pp.some((r) => parseExtratoMoneyValue(String(r.valorMisto ?? r.valorCredito ?? '')) > 6900),
    ).toBe(true);
    const { extratoLancamentoTemHistoricoNaPropriaLinhaOcr } = await import('./ocrExtratoPositional');
    expect(pp.some((r) => extratoLancamentoTemHistoricoNaPropriaLinhaOcr(r))).toBe(true);
  });

  it('consolidar com ignore Itaú mesclado mantém TED 6.905,92', async () => {
    const {
      extratoConsolidarExtratoRowsParaImportacao,
      extratoLancamentoTemHistoricoNaPropriaLinhaOcr,
    } = await import('./ocrExtratoPositional');
    const { mergeItauIgnoreLineWords } = await import('./itauExtratoProfile');
    const { resolveExtratoValorNatureza } = await import('../contabilfacil/logic/ocrImportMapper');
    const raw = [
      { _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL' },
      {
        _linhaOcr:
          '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
      },
    ];
    const merged = mergeItauIgnoreLineWords(ignoreLineWords);
    const pp = postProcessExtratoOcrRows(raw, '2026', {
      ignoreLineWords: merged,
      preserveSegmentRows: true,
    });
    const cons = extratoConsolidarExtratoRowsParaImportacao(pp, raw, merged);
    expect(cons.length).toBeGreaterThan(0);
    expect(extratoLancamentoTemHistoricoNaPropriaLinhaOcr(cons[0]!)).toBe(true);
    expect(resolveExtratoValorNatureza(cons[0]!).value).toBeGreaterThan(6900);
  });

  it('consolidar após postProcess mantém TED 6.905,92', async () => {
    const { extratoConsolidarExtratoRowsParaImportacao } = await import('./ocrExtratoPositional');
    const raw = [
      { _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL' },
      {
        _linhaOcr:
          '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
      },
    ];
    const pp = postProcessExtratoOcrRows(raw, '2026', {
      ignoreLineWords,
      preserveSegmentRows: true,
    });
    const cons = extratoConsolidarExtratoRowsParaImportacao(pp, raw, ignoreLineWords);
    expect(cons.length).toBeGreaterThan(0);
    expect(
      cons.some(
        (r) => parseExtratoMoneyValue(String(r.valorMisto ?? r.valorCredito ?? '')) > 6900,
      ),
    ).toBe(true);
  });

  it('mapOcrRowsToImportItems: TED + saldo colado preserveSegmentRows', () => {
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        { _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL' },
        {
          _linhaOcr:
            '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(
      items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C'),
      JSON.stringify({
        items: items.map((i) => ({ v: i.value, n: i.nature, d: i.description?.slice(0, 40) })),
        errors: skipped.filter((s) => s.severity === 'error'),
      }),
    ).toBe(true);
  });

  it('postProcess preserveSegmentRows: TED + órfã + saldo colado', () => {
    const out = postProcessExtratoOcrRows(
      [
        { _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL' },
        { _linhaOcr: '14/04/2026 14/04/2026 6.905,92' },
        {
          _linhaOcr:
            '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
        },
      ],
      '2026',
      { ignoreLineWords, preserveSegmentRows: true },
    );
    expect(out.some((r) => parseExtratoMoneyValue(r.valorMisto ?? r.valorCredito ?? '') > 6900)).toBe(
      true,
    );
  });

  it('postProcess preserveSegmentRows: TED + saldo colado só na _linhaOcr', () => {
    const out = postProcessExtratoOcrRows(
      [
        { _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL' },
        {
          _linhaOcr:
            '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
        },
      ],
      '2026',
      { ignoreLineWords, preserveSegmentRows: true },
    );
    expect(out).toHaveLength(1);
    expect(parseExtratoMoneyValue(out[0]?.valorMisto ?? out[0]?.valorCredito ?? '')).toBeCloseTo(
      6905.92,
      2,
    );
  });

  it('TED RECEBIDA com indicador D colado no OCR não gera erro de auditoria', () => {
    const linha =
      'TEDRECEBIDA001.0140.MUNICIPIO 29/04/2026 MUNICIPIODEFOZDOIGUACU 76.206.606/0001-40 89.117,60 D';
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [{ data: '29/04/2026', descricao: '', _linhaOcr: linha }],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 89117.6) < 0.05 && i.nature === 'C')).toBe(true);
    expect(
      skipped.some((s) => s.category === 'valor_divergente' || s.category === 'natureza_divergente'),
    ).toBe(false);
  });

  it('TED RECEBIDA com D na coluna histórico e valor em débito → crédito na revisão', async () => {
    const linha =
      'TEDRECEBIDA001.0140.MUNICIPIO 29/04/2026 MUNICIPIODEFOZDOIGUACU 76.206.606/0001-40 89.117,60 D';
    const { prepararExtratoOcrRowsParaRevisao, resolveExtratoDescricaoText } = await import(
      './ocrExtratoPositional'
    );
    const { resolveExtratoValorNatureza } = await import('../contabilfacil/logic/ocrImportMapper');
    const { classifyExtratoReviewRow } = await import('../contabilfacil/logic/extratoReviewIssues');
    const raw = [
      {
        data: '29/04/2026',
        descricao: 'D',
        valorDebito: '89.117,60',
        _linhaOcr: linha,
      },
    ];
    const revisao = prepararExtratoOcrRowsParaRevisao(raw, {
      statementYear: '2026',
      ignoreLineWords,
      preserveSegmentRows: true,
    });
    const row = revisao[0]!;
    expect(resolveExtratoDescricaoText(row).trim()).toMatch(/TED|RECEBIDA|MUNICIPIO/i);
    const { nature, value } = resolveExtratoValorNatureza(row);
    expect(nature).toBe('C');
    expect(value).toBeCloseTo(89117.6, 0);
    expect(classifyExtratoReviewRow(row, 0)).toBeNull();
  });

  it('importa sem rejeitar linhas do log de auditoria', () => {
    const { items, skipped } = mapOcrRowsToImportItems('extrato', buildItauAbr2026OcrLinhasAuditoria(), {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    const rejeitados = skipped.filter((s) => s.category === 'rejeitado' && s.severity === 'error');
    expect(rejeitados).toHaveLength(0);
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 3000) < 0.05 && i.nature === 'C')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 44558.8) < 0.05 && i.nature === 'C')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 451.21) < 0.05 && i.nature === 'D')).toBe(true);
    expect(
      skipped.some((s) => s.category === 'valor_divergente' || s.category === 'natureza_divergente'),
    ).toBe(false);
  });

  it('preserva TAR 103/26 e código TED 001.1441.S5P3FIS no histórico', async () => {
    const {
      sanitizeExtratoOcrRowColumns,
      repararHistoricoItauExtratoRow,
      inferDescricaoFromLinhaOcr,
    } = await import('./ocrExtratoPositional');
    const tedLinha =
      '22/04/2026 — TEDRECEBIDA 001.1441.S5P3FIS — SP350945FMS INVEST SUS 13.985.276/0001-18 1.768,52';
    const tedRow = {
      data: '22/04/2026',
      _linhaOcr: tedLinha,
      valorMisto: '1.768,52',
    };
    const { extratoHistoricoEhPlausivel } = await import('./ocrExtratoPositional');
    const inferred = inferDescricaoFromLinhaOcr(tedLinha, tedRow);
    expect(inferred).toMatch(/001\.1441/);
    expect(extratoHistoricoEhPlausivel(inferred), `inferred=${JSON.stringify(inferred)}`).toBe(true);

    const tar = repararHistoricoItauExtratoRow(
      sanitizeExtratoOcrRowColumns({
        data: '02/04/2026',
        _linhaOcr: '02/04/2026 — TAR PLANO ADAPT 103/26 -169,00',
        valorMisto: '-169,00',
      }),
    );
    expect(String(tar.descricao)).toMatch(/103\/26/);

    const sanitized = sanitizeExtratoOcrRowColumns(tedRow);
    expect(String(sanitized.descricao)).toMatch(/001\.1441/);
    const ted = repararHistoricoItauExtratoRow(sanitized);
    expect(String(ted.descricao)).toMatch(/001\.1441\.S5P3FIS|1441\.S5P3FIS/);
  });

  it('pareia valor órfão 25.636,00 ao TED CAMARA', () => {
    const paired = parearValoresOrfaosComHistoricoSemValor([
      {
        data: '16/04/2026',
        descricao: '',
        _linhaOcr: '16/04/2026 TED 041.0310.CAMARA M D DE P FUND CAMARA MUN. DE VEREADORES',
      },
      { data: '', descricao: '', valorMisto: '25.636,00', _linhaOcr: '25.636,00' },
    ]);
    expect(paired).toHaveLength(1);
    expect(parseExtratoMoneyValue(paired[0]!.valorMisto ?? '')).toBeCloseTo(25636, 2);
  });

  it('corrige audit: TED 25.636 órfão, 1.768 sem histórico, data 001.0140, SISPAG CODE débito', () => {
    const rows: OcrExtratoRow[] = [
      { data: '16/04/2026', descricao: '', _linhaOcr: '16/04/2026 TED 041.0310.CAMARA M D DE P FUND CAMARA MUN. DE VEREADORES' },
      { data: '', descricao: '', valorMisto: '25.636,00', _linhaOcr: '25.636,00' },
      {
        data: '22/04/2026',
        descricao: '',
        _linhaOcr: '22/04/2026 — TEDRECEBIDA 001.1441.S5P3FIS — SP350945FMS INVEST SUS 13.985.276/0001-18',
      },
      { data: '22/04/2026', descricao: '', valorMisto: '1.768,52', _linhaOcr: '22/04/2026 1.768,52' },
      {
        data: '001.0140',
        descricao: '',
        valorMisto: '44.558,80',
        _linhaOcr: '24/04/2026 MUNICIPIO DE FOZ DO IGUACU TED RECEBIDA 001.0140.MUNICIPIO 44.558,80',
      },
      {
        data: '23/04/2026',
        descricao: '',
        valorMisto: '-5.697,93',
        _linhaOcr:
          '23/04/2026 23/04/2026 — SISPAG FORNECEDORES PIX OR- — SALDO TOTAL DISPONÍVEL DIA CODE 5.697,93 61,49',
      },
      {
        data: '24/04/2026',
        descricao: '',
        valorMisto: '-1.534,00',
        _linhaOcr: '24/04/2026 PAGAMENTOS TRIB COD BARRAS SEFAZ-GO/SARE-DARE -1.534,00',
      },
    ];
    const pos = postProcessExtratoOcrRows(rows, '2026', {
      ignoreLineWords,
      preserveSegmentRows: true,
    });
    expect(
      pos.some((r) => parseExtratoMoneyValue(r.valorMisto ?? '') > 25600),
    ).toBe(true);
    const con = consolidarExtratoItauParaImportacao(pos, rows);
    expect(
      con.some((r) => parseExtratoMoneyValue(r.valorMisto ?? '') > 25600),
    ).toBe(true);
    expect(extratoValorOperacionalJaResolvidoNasRows(25636, '', con)).toBe(true);
    expect(extratoValorOperacionalJaResolvidoNasRows(1768.52, '22/04/2026', con)).toBe(true);
    expect(extratoValorOperacionalJaResolvidoNasRows(44558.8, '24/04/2026', con)).toBe(true);
    const { items, skipped } = mapOcrRowsToImportItems('extrato', rows, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    const rejeitados = skipped.filter((s) => s.category === 'rejeitado' && s.severity === 'error');
    const semHist = skipped.filter((s) => s.category === 'sem_historico' && s.severity === 'error');
    expect(rejeitados).toHaveLength(0);
    expect(semHist).toHaveLength(0);
    expect(items.some((i) => Math.abs(i.value - 25636) < 0.05 && i.nature === 'C')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 1768.52) < 0.05 && i.nature === 'C')).toBe(true);
    const foz = items.find((i) => Math.abs(i.value - 44558.8) < 0.05);
    expect(foz?.date).toBe('2026-04-24');
    const sispag = items.find((i) => Math.abs(i.value - 5697.93) < 0.05);
    expect(sispag).toBeDefined();
    expect(sispag!.nature).toBe('D');
    const sefaz = items.find((i) => Math.abs(i.value - 1534) < 0.05);
    expect(sefaz?.nature).toBe('D');
    const naturezaFlip = skipped.filter(
      (s) => s.category === 'pos_processamento' && /Natureza/.test(s.reason ?? ''),
    );
    expect(naturezaFlip.some((s) => /5\.697|1\.534/.test(s.preview ?? ''))).toBe(false);
  });

  it('preserva código TED colado RECEBIDA104.0327 e TARPLANOADAPT103/26 no histórico', async () => {
    const { inferDescricaoFromLinhaOcr, extratoExtrairHistoricoItauOperacionalDaLinha } =
      await import('./ocrExtratoPositional');

    const tedColado =
      'TED RECEBIDA104.0327.0URINHOS OURINHOS CAMARA MUNICIPAL 54.710.595/0001-06 14/04/2026 6.905,92';
    const histTed = extratoExtrairHistoricoItauOperacionalDaLinha(tedColado);
    expect(histTed).toMatch(/104\.0327/);
    expect(histTed).not.toMatch(/RECEBIDA1\b/);

    const inferred = inferDescricaoFromLinhaOcr(tedColado, { _linhaOcr: tedColado });
    expect(inferred).toMatch(/104\.0327/);
    expect(inferred).not.toMatch(/RECEBIDA1\b/);

    const tarColado = '02/04/2026 TARPLANOADAPT103/26 -169,00';
    const histTar = extratoExtrairHistoricoItauOperacionalDaLinha(tarColado);
    expect(histTar).toMatch(/103\/26/);
    expect(inferDescricaoFromLinhaOcr(tarColado, { _linhaOcr: tarColado })).toMatch(/103\/26/);
  });

  it('órfão 25.636 não herda PAGAMENTOSTRIB de outro dia', async () => {
    const { extratoDescricaoFallbackCreditoOrfao } = await import('./ocrExtratoPositional');
    const rawRows: OcrExtratoRow[] = [
      {
        data: '16/04/2026',
        _linhaOcr: '16/04/2026 TED 041.0310.CAMARA M D DE P FUND CAMARA MUN. DE VEREADORES 25.636,00',
      },
      {
        data: '20/04/2026',
        _linhaOcr:
          '20/04/2026 PAGAMENTOSTRIBCODBARRAS GOIANIA-TESOURO 01.612.092/0001-23 -451,21',
      },
    ];
    const hist = extratoDescricaoFallbackCreditoOrfao(rawRows, '16/04/2026', 25636);
    expect(hist).toMatch(/041\.0310|VEREADORES|CAMARA/i);
    expect(hist).not.toMatch(/PAGAMENTOS?\s*TRIB|GOIANIA/i);
  });

  it('histórico do lançamento vem da própria linha OCR (não de vizinho)', async () => {
    const { extratoLancamentoTemHistoricoNaPropriaLinhaOcr, inferDescricaoFromLinhaOcr } =
      await import('./ocrExtratoPositional');
    const ted = {
      data: '24/04/2026',
      _linhaOcr:
        '24/04/2026 MUNICIPIO DE FOZ DO IGUACU TED RECEBIDA 001.0140.MUNICIPIO 44.558,80',
      valorMisto: '44.558,80',
    };
    expect(extratoLancamentoTemHistoricoNaPropriaLinhaOcr(ted)).toBe(true);
    const hist = inferDescricaoFromLinhaOcr(ted._linhaOcr, ted);
    expect(hist).toMatch(/TED RECEBIDA|001\.0140|MUNICIPIO/i);
    expect(hist).not.toMatch(/RENDIMENTOS|REND PAGO/i);
  });

  it('enrichExtratoHistoricoLinhaOcrFromPageItems preenche RENDIMENTOS e SISPAG órfãos', async () => {
    const {
      enrichExtratoHistoricoLinhaOcrFromPageItems,
      resolveExtratoDescricaoText,
    } = await import('./ocrExtratoPositional');
    type Pos = { str: string; x: number; y: number; w: number; h: number };
    const items: Pos[] = [
      { str: '02/04/2026', x: 40, y: 100, w: 70, h: 12 },
      { str: 'AUT', x: 130, y: 100, w: 30, h: 12 },
      { str: 'MAIS', x: 165, y: 100, w: 35, h: 12 },
      { str: 'RENDIMENTOS', x: 205, y: 100, w: 90, h: 12 },
      { str: '0,02', x: 520, y: 100, w: 40, h: 12 },
      { str: '23/04/2026', x: 40, y: 200, w: 70, h: 12 },
      { str: '0,01', x: 520, y: 200, w: 40, h: 12 },
      {
        str: '23/04/2026 23/04/2026 — SISPAG FORNECEDORES PIX OR- — SALDO TOTAL DISPONÍVEL DIA CODE',
        x: 40,
        y: 220,
        w: 400,
        h: 12,
      },
      { str: '5.697,93', x: 520, y: 220, w: 60, h: 12 },
    ];
    const rows = [
      { data: '02/04/2026', valorMisto: '0,02', _linhaOcr: '02/04/2026 0,02' },
      { data: '23/04/2026', valorMisto: '0,01', _linhaOcr: '23/04/2026 0,01' },
      { data: '23/04/2026', valorMisto: '-5.697,93', _linhaOcr: '23/04/2026 -5.697,93' },
    ];
    const out = enrichExtratoHistoricoLinhaOcrFromPageItems(items, rows, 600, {
      min: 480,
      max: 580,
    });
    expect(resolveExtratoDescricaoText(out[0]!).trim()).toMatch(/RENDIMENTOS/i);
    expect(resolveExtratoDescricaoText(out[1]!).trim()).toMatch(/RENDIMENTOS|IOF/i);
    expect(resolveExtratoDescricaoText(out[2]!).trim()).toMatch(/SISPAG|CODE/i);
  });

  it('prepararExtratoOcrRowsParaRevisao preenche histórico vazio (tela de revisão Paddle)', async () => {
    const { prepararExtratoOcrRowsParaRevisao, resolveExtratoDescricaoText } = await import(
      './ocrExtratoPositional'
    );
    const raw = buildItauAbr2026OcrRows().map((r) => {
      const { descricao: _d, historicoOperacao: _h, ...rest } = r;
      return rest;
    });
    const revisao = prepararExtratoOcrRowsParaRevisao(raw, {
      statementYear: '2026',
      ignoreLineWords,
      preserveSegmentRows: true,
    });
    const ted25636 = revisao.find((r) => /25\.636/.test(String(r._linhaOcr ?? r.valorMisto ?? '')));
    expect(resolveExtratoDescricaoText(ted25636 ?? {}).trim()).toMatch(/TED|CAMARA|VEREADORES/i);
    const rend = revisao.find((r) => /0,02/.test(String(r.valorMisto ?? r._linhaOcr ?? '')));
    expect(resolveExtratoDescricaoText(rend ?? {}).trim()).toMatch(/RENDIMENTOS|IOF/i);
    expect(revisao.every((r) => r._extratoPosProcessado === '1')).toBe(true);
  });

  it('split CNPJ 89.117,60 abr/2026 → TED RECEBIDA FOZ (não SISPAG)', async () => {
    const { classifyExtratoReviewRow } = await import('../contabilfacil/logic/extratoReviewIssues');
    const context: OcrExtratoRow[] = [
      {
        data: '24/04/2026',
        _linhaOcr:
          '24/04/2026 MUNICIPIO DE FOZ DO IGUACU TED RECEBIDA 001.0140.MUNICIPIO 76.206.606/0001-40 44.558,80',
      },
      {
        data: '29/04/2026',
        descricao: 'SISPAG FORNECEDORES',
        valorMisto: '-70.870,00',
        _linhaOcr: '29/04/2026 SISPAG FORNECEDORES -70.870,00',
      },
      {
        data: '29/04/2026',
        descricao: '76.206.606/0001-40',
        valorMisto: '89.117,60',
        _linhaOcr: '29/04/2026 76.206.606/0001-40 89.117,60',
      },
      {
        data: '29/04/2026',
        descricao: 'RENDIMENTOS',
        valorMisto: '0,03',
        _linhaOcr: '29/04/2026 RENDIMENTOS 0,03',
      },
    ];
    const rev = prepararExtratoOcrRowsParaRevisao(context, {
      statementYear: '2026',
      ignoreLineWords,
      preserveSegmentRows: true,
    });
    const row89117 = rev.find((r) => /89\.117/.test(String(r.valorMisto ?? r.valorDebito ?? '')));
    expect(row89117).toBeTruthy();
    expect(resolveExtratoDescricaoText(row89117 ?? {}).trim()).toMatch(/TED|RECEBIDA|FOZ|MUNICIPIO/i);
    expect(classifyExtratoReviewRow(row89117!, rev.indexOf(row89117!))).toBeNull();
    const { items } = mapOcrRowsToImportItems('extrato', rev, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    const it = items.find((i) => Math.abs(i.value - 89117.6) < 1);
    expect(it?.nature).toBe('C');
    expect(String(it?.description ?? '')).toMatch(/TED|RECEBIDA|FOZ|MUNICIPIO/i);
    expect(String(it?.description ?? '')).not.toMatch(/SISPAG/i);
  });

  it('descarta SALDOTOTALI DISPONIVELDIA (OCR com I espúrio)', () => {
    const { items } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '30/04/2026',
          descricao: 'SALDOTOTALI DISPONIVELDIA',
          valorMisto: '4.124,73',
          _linhaOcr: '30/04/2026 SALDOTOTALI DISPONIVELDIA 4.124,73',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 4124.73) < 0.05)).toBe(false);
  });

  it('descarta SALDOTOTALDISPONIVELDIA (OCR colado) com frases do perfil Itaú', () => {
    const raw: OcrExtratoRow[] = [
      {
        data: '30/04/2026',
        descricao: 'SALDOTOTALDISPONIVELDIA',
        valorMisto: '4.124,73',
        _linhaOcr: '30/04/2026 SALDOTOTALDISPONIVELDIA 4.124,73',
      },
      { data: '02/04/2026', descricao: 'IOF', valorMisto: '-8,65', _linhaOcr: '02/04/2026 IOF -8,65' },
    ];
    const ignore = parseOcrIgnoreLineWords(
      'saldo anterior, saldo bloq, saldo do dia, saldo total disponível, saldo total disponível dia',
    );
    const out = postProcessExtratoOcrRows(raw, '2026', {
      ignoreLineWords: ignore,
      preserveSegmentRows: true,
    });
    expect(out.some((r) => /SALDOTOTAL|SALDO TOTAL/i.test(String(r.descricao ?? r._linhaOcr ?? '')))).toBe(
      false,
    );
    expect(out.filter((r) => /IOF/i.test(String(r.descricao ?? r._linhaOcr ?? '')))).toHaveLength(1);
  });

  it('histórico coluna saldo desalinhado: mantém SISPAG e descarta saldo puro (OCR local)', () => {
    const { items: itemsSispag } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '29/04/2026',
          descricao: 'SALDO TOTAL DISPONÍVEL DIA',
          valorMisto: '-70.870,00',
          _linhaOcr: '29/04/2026 SISPAG FORNECEDORES -70.870,00',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(itemsSispag.some((i) => Math.abs(i.value - 70870) < 1 && i.nature === 'D')).toBe(true);
    expect(String(itemsSispag[0]?.description ?? '')).toMatch(/SISPAG/i);

    const { items: itemsSaldo } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '30/04/2026',
          descricao: 'SALDO TOTAL DISPONÍVEL DIA',
          valorMisto: '4.124,73',
          _linhaOcr: '30/04/2026 SALDO TOTAL DISPONÍVEL DIA 4.124,73',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(itemsSaldo.some((i) => Math.abs(i.value - 4124.73) < 0.05)).toBe(false);
  });

  it('TED RECEBIDA 1.768,52 com SALDO na linha permanece crédito (abr/2026)', () => {
    const { items } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '22/04/2026',
          _linhaOcr:
            '22/04/2026 22/04/2026 — TEDRECEBIDA 001.1441.S5P3FIS — SALDO TOTAL DISPONÍVEL DIA — SP350945FMS INVEST SUS 13.985.276/0001-18 1.768,52 2.759,39',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    const ted = items.find((i) => Math.abs(i.value - 1768.52) < 0.05);
    expect(ted?.nature).toBe('C');
    expect(String(ted?.description ?? '')).toMatch(/TEDRECEBIDA|TED RECEBIDA/i);
  });

  it('IA visão: TED RECEBIDA 001.0140.MUNICIPIO D coluna débito → crédito na importação', async () => {
    const { marcarRowsExtracaoAi } = await import('../lib/aiExtratoExtractClient');
    const { items } = mapOcrRowsToImportItems(
      'extrato',
      prepararExtratoOcrRowsParaRevisao(
        marcarRowsExtracaoAi([
          {
            data: '29/04/2026',
            descricao: 'TED RECEBIDA 001.0140.MUNICIPIO D',
            valorDebito: '89.117,60',
            natureza: 'D',
          },
        ]),
        { statementYear: '2026', ignoreLineWords, preserveSegmentRows: true },
      ),
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    const it = items.find((i) => Math.abs(i.value - 89117.6) < 1);
    expect(it?.nature).toBe('C');
    expect(String(it?.description ?? '')).toMatch(/TED|RECEBIDA|MUNICIPIO/i);
  });

  it('TED RECEBIDA permanece crédito mesmo com coluna D do OCR', async () => {
    const { limparItauExtratoRowDuplaColunaMonetaria } = await import('./ocrExtratoPositional');
    const row: OcrExtratoRow = {
      data: '29/04/2026',
      descricao: 'TED RECEBIDA 001.0140.MUNICIPIO MUNICIPIODEFOZDOIGUACU',
      natureza: 'D',
      valorMisto: '-89.117,40',
      _linhaOcr:
        '29/04/2026 TED RECEBIDA 001.0140.MUNICIPIO MUNICIPIODEFOZDOIGUACU 89.117,40 91.242,13',
    };
    const out = limparItauExtratoRowDuplaColunaMonetaria(row);
    expect(parseExtratoMoneyValue(out.valorMisto ?? '')).toBeCloseTo(89117.4, 2);
    expect(String(out.valorMisto ?? '')).not.toMatch(/^-/);
  });

  it('remove IOF duplicado (mesma data, valor e histórico)', () => {
    const raw: OcrExtratoRow[] = [
      { data: '02/04/2026', descricao: 'IOF', valorMisto: '-8,65', _linhaOcr: '02/04/2026 IOF -8,65' },
      { data: '02/04/2026', descricao: 'IOF', valorMisto: '-8,65', _linhaOcr: '02/04/2026 IOF -8,65' },
    ];
    const out = postProcessExtratoOcrRows(raw, '2026', {
      ignoreLineWords,
      preserveSegmentRows: true,
    });
    expect(out.filter((r) => /IOF/i.test(String(r.descricao ?? r._linhaOcr ?? '')))).toHaveLength(1);
  });

  it('detecta saldo anterior com OCR colado SALDOANTERIOR (Paddle)', () => {
    const row: OcrExtratoRow = {
      descricao: 'Lancamentos Razão Social SALDOANTERIOR',
      valorMisto: '40.844,13',
      _linhaOcr: 'Lançamentos do período Razão Social SALDOANTERIOR 40.844,13',
    };
    expect(extratoRowEhSaldoInformativo(row)).toBe(true);
    expect(extrairSaldoAnteriorDasRows([row])).toBeCloseTo(40_844.13, 2);
  });

  it('remove duplicata 17.225 SISPAG vs fragmento TED DE P FUND no mesmo dia', () => {
    const raw: OcrExtratoRow[] = [
      {
        data: '15/04/2026',
        descricao: 'DE P FUND TED 041.0310.CAMARA M D',
        valorMisto: '-17.225,00',
        _linhaOcr: '15/04/2026 DE P FUND TED 041.0310.CAMARA M D 17.225,00',
      },
      {
        data: '15/04/2026',
        descricao: 'SISPAG FORNECEDORES',
        valorMisto: '-17.225,00',
        _linhaOcr: '15/04/2026 SISPAG FORNECEDORES 17.225,00',
      },
    ];
    const { items } = mapOcrRowsToImportItems('extrato', raw, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    const dup = items.filter((i) => Math.abs(i.value - 17_225) < 0.05 && i.nature === 'D');
    expect(dup).toHaveLength(1);
    expect(dup[0]!.description).toMatch(/SISPAG/i);
  });

  it('prefere SISPAG SANEAGO sobre TED OURINHOS no mesmo valor/dia 06/04', () => {
    const raw: OcrExtratoRow[] = [
      {
        data: '06/04/2026',
        descricao: 'TED RECEBIDA 104.0327.OURINHOS',
        valorMisto: '-207,16',
        _linhaOcr: '06/04/2026 TED RECEBIDA 104.0327.OURINHOS 207,16',
      },
      {
        data: '06/04/2026',
        descricao: 'SISPAG FORNECEDORES SANEAGO',
        valorMisto: '-207,16',
        _linhaOcr: '06/04/2026 SISPAG FORNECEDORES SANEAGO -207,16',
      },
    ];
    const { items } = mapOcrRowsToImportItems('extrato', raw, {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    const saneago = items.filter((i) => Math.abs(i.value - 207.16) < 0.05);
    expect(saneago).toHaveLength(1);
    expect(saneago[0]!.description).toMatch(/SISPAG|SANEAGO/i);
    expect(saneago[0]!.description).not.toMatch(/OURINHOS/i);
  });

  it('resolver saldo anterior: ignora valor IA incoerente e usa OCR 40.844,13', () => {
    const items = [
      { nature: 'C' as const, value: 175_085.78 },
      { nature: 'D' as const, value: 211_500 },
    ];
    const sa = resolverExtratoSaldoAnteriorImportacao({
      rows: [
        {
          descricao: 'Lancamentos Razão Social SALDOANTERIOR',
          valorMisto: '40.844,13',
          _linhaOcr: 'Lançamentos do período SALDOANTERIOR 40.844,13',
        },
      ],
      saldoAnteriorInformado: 103_519.35,
      saldoFinalEsperado: 4_124.73,
      items,
    });
    expect(sa).toBeCloseTo(40_844.13, 0);
  });

  it('rejeita saldo anterior inventado pela IA (183.519,35) sem linha no documento', () => {
    const items = [
      { nature: 'C' as const, value: 50_000 },
      { nature: 'D' as const, value: 229_394.62 },
    ];
    const sa = resolverExtratoSaldoAnteriorImportacao({
      rows: [],
      saldoAnteriorInformado: 183_519.35,
      saldoFinalEsperado: 4_124.73,
      items,
    });
    expect(sa).toBe(0);
  });

  it('resolverSaldoAnteriorParaMetaExtrato não usa saldo da IA sem OCR', () => {
    const sa = resolverSaldoAnteriorParaMetaExtrato({
      rows: [{ data: '01/04/2026', descricao: 'PIX', valorCredito: '100,00' }],
      ocrText: 'PIX RECEBIDO 100,00',
    });
    expect(sa).toBeUndefined();
  });

  it('extrairSaldoAnteriorDeTextoOcr lê SALDOANTERIOR colado', () => {
    const sa = extrairSaldoAnteriorDeTextoOcr(
      'Lançamentos Razão Social SALDOANTERIOR 40.844,13 IOF 02/04/2026',
    );
    expect(sa).toBeCloseTo(40_844.13, 2);
  });
});

/** OCR Paddle/console abr/2026 — ordem reversa como no log F12 do usuário. */
function buildItauAbr2026PaddleConsoleRows(): OcrExtratoRow[] {
  const specs: Array<{ data: string; hist: string; vm: string }> = [
    { data: '23/04/2026', hist: 'PIX RECEBIDO POLO S POLO S CLIMATIZACAO LTDA', vm: '3.000,00' },
    {
      data: '22/04/2026',
      hist: 'TED RECEBIDA 001.1441.SP 3 F I S SP 350945 FMS INVEST SUS 13.985.276/000',
      vm: '1.768,52',
    },
    { data: '20/04/2026', hist: 'SISPAG FORNECEDORES', vm: '-277,74' },
    { data: '20/04/2026', hist: 'SISPAG FORNECEDORES', vm: '-13.917,09' },
    { data: '20/04/2026', hist: 'SISPAG FORNECEDORES -277 0', vm: '-0,04' },
    {
      data: '20/04/2026',
      hist: 'PAGAMENTOS TRIB COD BARRAS GOIANIA-TESOURO 01.612.092/0001-23',
      vm: '-451,21',
    },
    { data: '16/04/2026', hist: 'TED 041.0310.CAMARA M 25.636', vm: '25.636,00' },
    {
      data: '15/04/2026',
      hist: 'DE P FUND TED 041.0310.CAMARA M D 04.763.273/0001-49 CAMARA MUN. DE VERE',
      vm: '-17.225,00',
    },
    { data: '15/04/2026', hist: 'SISPAG FORNECEDORES 0', vm: '-0,04' },
    { data: '14/04/2026', hist: 'TED RECEBIDA 104.0327.OURINHOS', vm: '6.905,92' },
    {
      data: '06/04/2026',
      hist: 'TED RECEBIDA 104.0327.OURINHOS 06/04/2026 SISPAG FORNECEDORES SANEAGO',
      vm: '-207,16',
    },
    { data: '06/04/2026', hist: 'SISPAG FORNECEDORES', vm: '-31.030,02' },
    { data: '06/04/2026', hist: 'SISPAG FORNECEDORES', vm: '-9.118,05' },
    { data: '06/04/2026', hist: 'SISPAG FORNECEDORES SANEAGO -207 0', vm: '-0,66' },
    { data: '02/04/2026', hist: 'TAR PLANO ADAPT 1 03/26', vm: '-169,00' },
    { data: '02/04/2026', hist: 'IOF', vm: '-0,65' },
    { data: '30/04/2026', hist: 'TED RECEBIDA', vm: '4.124,73' },
    {
      data: '30/04/2026',
      hist: 'TED RECEBIDA 001.0652.RIBEIRAO P RIBEIRAO PINHAL CAM VER 1.030',
      vm: '1.030,00',
    },
    { data: '02/04/2026', hist: 'RECEBIMENTOS MUNICIPIO DE MINACU 02', vm: '3.068,22' },
    { data: '29/04/2026', hist: 'RECEBIMENTOS MUNICIPIO DE MINACU 02', vm: '3.068,22' },
    {
      data: '29/04/2026',
      hist: 'TED RECEBIDA 001.0652.RIBEIRAO P RIBEIRAO PINHAL CAM VER 30/04/2026 RECE',
      vm: '-23.266,10',
    },
  ];
  return specs.map(({ data, hist, vm }) => ({
    data,
    descricao: hist,
    valorMisto: vm,
    _linhaOcr: `${data} ${hist}`,
    _extratoPosProcessado: '1' as const,
  }));
}

describe('Itaú abr/2026 — OCR Paddle (console F12)', () => {
  it('não importa saldo final 4.124,73 como TED RECEBIDA vazia', () => {
    const { items } = mapOcrRowsToImportItems('extrato', buildItauAbr2026PaddleConsoleRows(), {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    expect(items.some((i) => Math.abs(i.value - 4124.73) < 0.05)).toBe(false);
  });

  it('SANEAGO -207,16 na linha fundida TED+SISPAG usa histórico SISPAG', () => {
    const { items } = mapOcrRowsToImportItems('extrato', buildItauAbr2026PaddleConsoleRows(), {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    const saneago = items.filter((i) => Math.abs(i.value - 207.16) < 0.05 && i.nature === 'D');
    expect(saneago).toHaveLength(1);
    expect(saneago[0]!.description).toMatch(/SISPAG|SANEAGO/i);
    expect(saneago[0]!.description).not.toMatch(/OURINHOS/i);
  });

  it('importa CODE -23.266,10 da linha fundida 29/04', () => {
    const { items } = mapOcrRowsToImportItems('extrato', buildItauAbr2026PaddleConsoleRows(), {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    expect(items.some((i) => Math.abs(i.value - 23266.1) < 0.05 && i.nature === 'D')).toBe(true);
  });

  it('não duplica RECEBIMENTOS MINACU 3.068,22', () => {
    const { items } = mapOcrRowsToImportItems('extrato', buildItauAbr2026PaddleConsoleRows(), {
      ignoreLineWords,
      extratoPreserveSegmentRows: true,
    });
    const minacu = items.filter((i) => Math.abs(i.value - 3068.22) < 0.05 && i.nature === 'C');
    expect(minacu).toHaveLength(1);
  });
});
