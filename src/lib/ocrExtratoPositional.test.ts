(globalThis as any).DOMMatrix = class DOMMatrix {};

import { describe, expect, it } from 'vitest';
import { parseExtratoMoneyValue } from '../extratoVision/utils/extratoMoneyParse';
import {
  mesclarHistoricoContinuacaoExtratoAoVivo,
  mergeExtratoDescricaoContinuacao,
  mergeExtratoValorOrfao,
  propagateExtratoDatesOcrRows,
  repararExtratoRowsSemHistoricoDeTextoOcr,
  sanitizeExtratoOcrRowColumns,
  inferExtratoDescricaoFromCluster,
  resolveExtratoDescricaoText,
  postProcessExtratoOcrRows,
  sanitizeExtratoValorOcrToken,
  sanitizeExtratoDataOcrToken,
  trimExtratoOcrRowsToLancamentos,
  cleanExtratoOcrRowForImport,
  limparHistoricoExtratoMisturado,
  extratoRowEhSaldoInformativo,
  extrairSaldoAnteriorDasRows,
  extratoRowContemPalavraIgnorada,
  extratoTextoContemPalavraIgnorada,
  parseOcrIgnoreLineWords,
  extratoHistoricoEhPlausivel,
  extratoLancamentoBlocosFromItems,
  segmentarExtratoEmLancamentos,
  segmentarExtratoEmClusters,
  auditarCoberturaValoresExtrato,
  buildHistoricoFromSegmento,
  validarMapeamentoExtratoOcr,
  computeExtratoSeparadoresTopoPorValor,
  auditarExtratoSeparadoresPreview,
  clusterSicoobExtratoPorValor,
  extratoLinhaIniciaNovoLancamento,
  extratoPhysicalLinesFromItems,
  extratoLinhaFisicaEhSoContinuacaoHistorico,
  scanValoresTextoLinhaExtrato,
  extratoRecuperarValoresOrfaosAposMarcadorSaldo,
  splitExtratoOcrRowsPorLancamentosFundidos,
  removerLinhasComPalavrasIgnoradas,
  extratoLinhaSaldoTemValorLancamentoColado,
} from './ocrExtratoPositional';
import type { OcrExtratoRow } from './ocrExtratoPositional';
import { fixOcrHistoricoLine } from './ocrExtratoTokenFix';

function valorColunaExtratoRow(r: {
  valorMisto?: string;
  valorDebito?: string;
  valorCredito?: string;
}): string {
  return r.valorMisto ?? r.valorDebito ?? r.valorCredito ?? '';
}

function parseValorExtratoRow(r: {
  valorMisto?: string;
  valorDebito?: string;
  valorCredito?: string;
}): number {
  return parseExtratoMoneyValue(valorColunaExtratoRow(r));
}

describe('propagateExtratoDatesOcrRows', () => {
  it('repete a mesma data nas linhas sem data quando há vários lançamentos no dia', () => {
    const rows = propagateExtratoDatesOcrRows(
      [
        { data: '15/05/2025', descricao: 'PIX RECEBIDO', valorCredito: '100,00' },
        { data: '', descricao: 'TARIFA', valorDebito: '12,90' },
        { data: '', descricao: 'TED ENVIO', valorDebito: '500,00' },
      ],
      '2025',
    );
    expect(rows[0].data).toBe('15/05/2025');
    expect(rows[1].data).toBe('15/05/2025');
    expect(rows[2].data).toBe('15/05/2025');
  });

  it('atualiza a data quando muda o dia', () => {
    const rows = propagateExtratoDatesOcrRows(
      [
        { data: '10/05/2025', descricao: 'A', valorDebito: '1,00' },
        { data: '', descricao: 'B', valorDebito: '2,00' },
        { data: '11/05/2025', descricao: 'C', valorDebito: '3,00' },
        { data: '', descricao: 'D', valorDebito: '4,00' },
      ],
      '2025',
    );
    expect(rows[1].data).toBe('10/05/2025');
    expect(rows[3].data).toBe('11/05/2025');
  });

  it('trata traço na coluna data como vazio e repete a data do dia', () => {
    const rows = propagateExtratoDatesOcrRows(
      [
        { data: '01/06/2026', descricao: 'SALDO', valorDebito: '1,00' },
        { data: '-', descricao: 'PIX', valorCredito: '100,00' },
        { data: '—', descricao: 'TARIFA', valorDebito: '12,90' },
      ],
      '2026',
    );
    expect(rows[1].data).toBe('01/06/2026');
    expect(rows[2].data).toBe('01/06/2026');
  });

  it('propaga data a partir de uma linha contendo apenas a data (sem lançamento)', () => {
    const rows = propagateExtratoDatesOcrRows(
      [
        { data: '01/04/2026', descricao: '', valorCredito: '' },
        { data: '', descricao: 'LIQUIDACAO DE COBRANCA', valorCredito: '30.998,95' },
        { data: '', descricao: 'TRANSFERENCIA PIX', valorCredito: '423,37' },
      ],
      '2026',
    );
    expect(rows[0].data).toBe('01/04/2026');
    expect(rows[1].data).toBe('01/04/2026');
    expect(rows[2].data).toBe('01/04/2026');
  });

  it('propaga datas de forma robusta simulando o extrato real da imagem com múltiplos dias', () => {
    const rows = propagateExtratoDatesOcrRows(
      [
        { data: '31/03/2026', descricao: 'SALDO ANTERIOR', valorCredito: '' },
        { data: '01/04/2026', descricao: 'LIQUIDACAO DE COBRANCA', valorCredito: '423,37' },
        { data: '', descricao: 'LIQUIDACAO COBRANCA DESC', valorCredito: '293,04' },
        { data: '', descricao: 'TRANSFERENCIA PIX', valorCredito: '2.635,98' },
        { data: '02/04/2026', descricao: 'LIQUIDACAO COBRANCA DESC', valorCredito: '502,27' },
        { data: '', descricao: 'TRANSFERENCIA PIX', valorCredito: '508,00' },
        { data: '06/04/2026', descricao: 'LIQUIDACAO DE COBRANCA', valorCredito: '1.187,38' },
        { data: '', descricao: 'DEVOLUCAO PIX', valorCredito: '156,00' },
      ],
      '2026',
    );
    expect(rows[0].data).toBe('31/03/2026');
    expect(rows[1].data).toBe('01/04/2026');
    expect(rows[2].data).toBe('01/04/2026');
    expect(rows[3].data).toBe('01/04/2026');
    expect(rows[4].data).toBe('02/04/2026');
    expect(rows[5].data).toBe('02/04/2026');
    expect(rows[6].data).toBe('06/04/2026');
    expect(rows[7].data).toBe('06/04/2026');
  });

  it('normaliza data com mês abreviado e propaga para linhas com só hora ou traço', () => {
    expect(sanitizeExtratoDataOcrToken('30 Abr, 2026 17:54')).toBe('30/04/2026');
    expect(sanitizeExtratoDataOcrToken('01/04/2026')).toBe('01/04/2026');
    expect(sanitizeExtratoDataOcrToken('17:28')).toBe('');
    expect(sanitizeExtratoDataOcrToken('-')).toBe('');

    const rows = propagateExtratoDatesOcrRows(
      [
        { data: '30 Abr, 2026 17:54', descricao: 'LANC A', valorCredito: '100,00' },
        { data: '17:28', descricao: 'LANC B', valorCredito: '200,00' },
        { data: '14:39', descricao: 'LANC C', valorCredito: '300,00' },
        { data: '-', descricao: 'LANC D', valorDebito: '50,00' },
        { data: '01/04/2026', descricao: 'LANC E', valorCredito: '400,00' },
        { data: '17:21', descricao: 'LANC F', valorCredito: '500,00' },
      ],
      '2026',
    );
    expect(rows[0].data).toBe('30/04/2026');
    expect(rows[1].data).toBe('30/04/2026');
    expect(rows[2].data).toBe('30/04/2026');
    expect(rows[3].data).toBe('30/04/2026');
    expect(rows[4].data).toBe('01/04/2026');
    expect(rows[5].data).toBe('01/04/2026');
  });

  it('une segunda linha do histórico ao lançamento anterior', () => {
    const rows = mergeExtratoDescricaoContinuacao([
      {
        data: '01/04/2026',
        descricao: 'LIQUIDACAO DE COBRANCA',
        valorCredito: '423,37',
      },
      { data: '', descricao: 'VALOR DISPONIVEL' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].descricao).toBe('LIQUIDACAO DE COBRANCA\nVALOR DISPONIVEL');
  });

  it('mescla continuação de histórico na revisão ao vivo sem criar nova linha', () => {
    const rows = mesclarHistoricoContinuacaoExtratoAoVivo([
      {
        data: '30/04/2026',
        descricao: 'À Vista NS: PB1F249U74361',
        valorDebito: '882,71',
      },
      { data: '', descricao: 'COMPLEMENTO DO MESMO LANCAMENTO' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].descricao).toContain('À Vista NS: PB1F249U74361');
    expect(rows[0].descricao).toContain('COMPLEMENTO DO MESMO LANCAMENTO');
    expect(rows[0].descricao).toContain('\n');
  });

  it('repara histórico TED 1.030,00 a partir do texto OCR da página', () => {
    const ocrText =
      '30/04/2026 TED RECEBIDA 001.0652.RIBEIRAO P RIBEIRAO PINHAL CAM VER 77.778.751/0001-68 1.030,00';
    const rows = repararExtratoRowsSemHistoricoDeTextoOcr(
      [{ data: '01/03/2026', valorCredito: '1.030,00', descricao: '' }],
      ocrText,
    );
    expect(rows[0].descricao).toMatch(/TED\s*RECEB/i);
    expect(rows[0].descricao).toMatch(/RIBEIRAO/i);
  });

  it('une valor OCR isolado na linha seguinte ao lançamento anterior', () => {
    const rows = mergeExtratoValorOrfao([
      { data: '01/04/2026', descricao: 'LIQUIDACAO DE COBRANCA' },
      { data: '', descricao: '', valorCredito: '423,37' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].valorCredito).toBe('423,37');
  });

  it('descarta valor OCR repetido na linha seguinte quando o lançamento anterior já tem o mesmo valor', () => {
    const rows = mergeExtratoValorOrfao([
      { data: '01/04/2026', descricao: 'PIX RECEBIDO', valorCredito: '423,37' },
      { data: '', descricao: '', valorCredito: '423,37' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].valorCredito).toBe('423,37');
  });

  it('remove data duplicada da coluna descrição', () => {
    const row = sanitizeExtratoOcrRowColumns({
      data: '15/05/2025',
      descricao: '15/05/2025 PIX RECEBIDO',
      valorCredito: '100,00',
    });
    expect(row.descricao).toBe('PIX RECEBIDO');
    expect(row.data).toBe('15/05/2025');
  });

  it('preserva histórico quando valor monetário estava colado na descrição', () => {
    const row = sanitizeExtratoOcrRowColumns({
      data: '01/04/2026',
      descricao: 'LIQUIDACAO DE COBRANCA 423,37',
      valorCredito: '423,37',
    });
    expect(row.descricao).toBe('LIQUIDACAO DE COBRANCA');
  });

  it('reconstrói histórico a partir dos tokens da linha', () => {
    const colMap = {
      data: { id: 'data', start: 0, end: 80 },
      descricao: { id: 'descricao', start: 90, end: 420 },
      valorCredito: { id: 'valorCredito', start: 430, end: 520 },
    };
    const row = [
      { str: '01/04/2026', x: 10, y: 10, w: 60, h: 10 },
      { str: 'LIQUIDACAO', x: 120, y: 10, w: 70, h: 10 },
      { str: 'DE', x: 200, y: 10, w: 20, h: 10 },
      { str: 'COBRANCA', x: 230, y: 10, w: 80, h: 10 },
      { str: '423,37', x: 450, y: 10, w: 50, h: 10 },
    ];
    const buckets = new Map<string, typeof row>([
      ['data', [row[0]]],
      ['valorCredito', [row[4]]],
    ]);
    const inferred = inferExtratoDescricaoFromCluster(row, colMap, buckets, 600);
    expect(inferred).toContain('LIQUIDACAO');
    expect(inferred).toContain('COBRANCA');
    expect(inferred).not.toContain('423,37');
  });

  it('corrige OCR comum em histórico', () => {
    expect(fixOcrHistoricoLine('ALTERAÇÃO VENCIMENTO TÍTOOCNNNOS')).toContain('TITULOS');
    expect(fixOcrHistoricoLine('LIQUIDACAO DE COBRANCA')).toBe('LIQUIDACAO DE COBRANCA');
  });

  it('usa _linhaOcr como fallback no pós-processamento', () => {
    const rows = postProcessExtratoOcrRows([
      {
        data: '01/04/2026',
        valorCredito: '423,37',
        _linhaOcr: '01/04/2026 LIQUIDACAO DE COBRANCA 423,37',
      },
    ]);
    expect(resolveExtratoDescricaoText(rows[0])).toContain('LIQUIDACAO');
    expect(resolveExtratoDescricaoText(rows[0])).not.toMatch(/423/);
  });

  it('não usa valor monetário como histórico', () => {
    const row = sanitizeExtratoOcrRowColumns({
      data: '01/04/2026',
      descricao: '0.04',
      valorCredito: '0,04',
    });
    expect(row.descricao).toBe('');
  });

  it('não sobrescreve data nova com data anterior quando coluna traz outro dia', () => {
    const rows = propagateExtratoDatesOcrRows(
      [
        { data: '01/04/2026', descricao: 'A', valorCredito: '1,00' },
        { data: '02/04/2026', descricao: 'B', valorCredito: '2,00' },
        { data: '', descricao: 'C', valorCredito: '3,00' },
      ],
      '2026',
    );
    expect(rows[0].data).toBe('01/04/2026');
    expect(rows[1].data).toBe('02/04/2026');
    expect(rows[2].data).toBe('02/04/2026');
    expect(rows[2]._dataHerdada).toBe('1');
  });
});

describe('sanitizeExtratoValorOcrToken', () => {
  it('remove letras e mantém valor BR', () => {
    expect(sanitizeExtratoValorOcrToken('423,37 C')).toBe('423,37 C');
    expect(sanitizeExtratoValorOcrToken('R$ 2.635,98')).toBe('2.635,98');
    expect(sanitizeExtratoValorOcrToken('423,37D')).toBe('423,37 D');
  });

  it('não altera dígitos válidos', () => {
    expect(sanitizeExtratoValorOcrToken('502,27')).toBe('502,27');
    expect(sanitizeExtratoValorOcrToken('30.998,95')).toBe('30.998,95');
  });

  it('interpreta OCR colado 4,440,53D e 4,958,99C', () => {
    expect(sanitizeExtratoValorOcrToken('4,440,53D')).toBe('4.440,53 D');
    expect(sanitizeExtratoValorOcrToken('4,958,99C')).toBe('4.958,99 C');
  });
});

describe('trimExtratoOcrRowsToLancamentos', () => {
  it('corta cabeçalho e mantém do primeiro ao último lançamento', () => {
    const rows = trimExtratoOcrRowsToLancamentos([
      { data: '01/03/2026', descricao: 'Período: 01/03 a 31/03', valorCredito: '' },
      { data: '01/04/2026', descricao: 'SALDO ANTERIOR', valorCredito: '' },
      { data: '01/04/2026', descricao: 'PIX RECEBIDO', valorCredito: '100,00' },
      { data: '', descricao: 'TED ENVIO', valorDebito: '50,00' },
      { data: '02/04/2026', descricao: 'TARIFA', valorDebito: '12,90' },
      { data: '', descricao: 'Total de débitos', valorDebito: '999,00' },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].descricao).toContain('PIX');
    expect(rows[2].descricao).toContain('TARIFA');
  });
});

describe('cleanExtratoOcrRowForImport', () => {
  it('limpa data e valor na carga', () => {
    const row = cleanExtratoOcrRowForImport({
      data: '01/04/2026',
      valorCredito: '423,37 C',
      descricao: 'LIQUIDACAO',
    });
    expect(row.data).toBe('01/04/2026');
    expect(row.valorMisto).toBe('423,37');
    expect(row.valorCredito).toBe('');
  });

  it('normaliza coluna mista assinada estilo Bradesco', () => {
    const row = cleanExtratoOcrRowForImport({
      data: '01/04/2026',
      descricao: 'CREDITO',
      valorMisto: '-1.534,00',
    });
    expect(row.valorMisto).toBe('-1.534,00');
    const cred = cleanExtratoOcrRowForImport({
      data: '01/04/2026',
      descricao: 'CREDITO',
      valorMisto: '44.558,80',
    });
    expect(cred.valorMisto).toBe('44.558,80');
  });
});

describe('limparHistoricoExtratoMisturado', () => {
  it('remove rodapé Santander e mantém só PIX RECEBIDO', () => {
    const misturado =
      'PESSOAS COM DEFICIENCIA AUDITIVA OU DE FALA 0800 722 0099 OUVIDORIA 0800 726 0331 ' +
      'SALDO DISPONIVEL + LIMITE (G + H + I) LIMITE CHEQUE INVESTIDOR CONTA MAX PIX RECEBIDO';
    const limpo = limparHistoricoExtratoMisturado(misturado);
    expect(limpo).toContain('PIX RECEBIDO');
    expect(limpo).not.toMatch(/0800/);
    expect(limpo).not.toMatch(/OUVIDORIA/);
  });

  it('não altera histórico curto válido', () => {
    expect(limparHistoricoExtratoMisturado('PIX ENVIADO')).toBe('PIX ENVIADO');
  });
});

describe('groupExtratoLinesEmBlocosLancamento — histórico multilinha', () => {
  it('agrupa continuação sem valor no bloco anterior até a próxima linha com valor', () => {
    const items = [
      { str: '01/04', x: 10, y: 100, w: 40, h: 12 },
      { str: 'PIX EMIT.OUTRA', x: 80, y: 100, w: 120, h: 12 },
      { str: '1.560,00D', x: 400, y: 100, w: 70, h: 12 },
      { str: 'COMPLEMENTO HIST', x: 80, y: 118, w: 100, h: 12 },
      { str: '02/04', x: 10, y: 140, w: 40, h: 12 },
      { str: 'TED RECEBIDA', x: 80, y: 140, w: 90, h: 12 },
      { str: '300,00C', x: 400, y: 140, w: 60, h: 12 },
    ];
    const blocos = extratoLancamentoBlocosFromItems(items, 500, 0.45);
    expect(blocos).toHaveLength(2);
    expect(blocos[0]!.lines).toHaveLength(2);
    expect(blocos[0]!.lines[1]!.hasValor).toBe(false);
    expect(blocos[1]!.lines).toHaveLength(1);
  });

  it('mantém DOC de continuação no mesmo bloco — uma linha horizontal só no fim', () => {
    const items = [
      { str: '27/02', x: 10, y: 100, w: 40, h: 12 },
      { str: 'JUROS CTA GARANTIDA', x: 80, y: 100, w: 140, h: 12 },
      { str: '1.815,56D', x: 400, y: 100, w: 70, h: 12 },
      { str: 'DOC.: LC-202601', x: 80, y: 118, w: 120, h: 12 },
      { str: '1.815,56D', x: 400, y: 119, w: 70, h: 12 },
      { str: '28/02', x: 10, y: 140, w: 40, h: 12 },
      { str: 'PIX RECEBIDO', x: 80, y: 140, w: 90, h: 12 },
      { str: '500,00C', x: 400, y: 140, w: 60, h: 12 },
    ];
    const lines = extratoPhysicalLinesFromItems(items, 500, 0.45);
    expect(extratoLinhaFisicaEhSoContinuacaoHistorico(lines[1]!)).toBe(true);
    expect(extratoLinhaIniciaNovoLancamento(lines[1]!)).toBe(false);
    const blocos = extratoLancamentoBlocosFromItems(items, 500, 0.45);
    expect(blocos).toHaveLength(2);
    expect(blocos[0]!.lines).toHaveLength(2);
    expect(blocos[0]!.lines[0]!.hasValor).toBe(true);
    expect(extratoLinhaIniciaNovoLancamento(blocos[0]!.lines[1]!)).toBe(false);
  });

  it('agrupa PIX multilinha (Pagamento Pix, conta, DOC) até o próximo lançamento', () => {
    const items = [
      { str: '27/02', x: 10, y: 200, w: 40, h: 12 },
      { str: 'PIX EMIT.OUTRA IF', x: 80, y: 200, w: 140, h: 12 },
      { str: '1.282,30D', x: 400, y: 200, w: 70, h: 12 },
      { str: 'Pagamento Pix', x: 80, y: 218, w: 100, h: 12 },
      { str: '00.394.460 0058-8', x: 80, y: 236, w: 120, h: 12 },
      { str: 'DOC.: Pix', x: 80, y: 254, w: 80, h: 12 },
      { str: '27/02', x: 10, y: 272, w: 40, h: 12 },
      { str: 'PIX EMIT.OUTRA IF', x: 80, y: 272, w: 140, h: 12 },
      { str: '500,00D', x: 400, y: 272, w: 60, h: 12 },
    ];
    const blocos = extratoLancamentoBlocosFromItems(items, 500, 0.45);
    expect(blocos).toHaveLength(2);
    expect(blocos[0]!.lines).toHaveLength(4);
    expect(blocos[0]!.lines[0]!.yTop).toBe(200);
    expect(blocos[0]!.lines[3]!.items.some((i) => i.str.includes('DOC'))).toBe(true);
    expect(blocos[1]!.lines).toHaveLength(1);
  });

  it('agrupa 3.270,95 multilinha em um bloco só (prévia OCR yTol 0.36)', () => {
    const items = [
      { str: '02/02', x: 10, y: 100, w: 40, h: 12 },
      { str: 'PIX EMIT.OUTRA IF', x: 80, y: 100, w: 140, h: 12 },
      { str: '3.270,95D', x: 400, y: 100, w: 70, h: 12 },
      { str: 'Pagamento Pix', x: 80, y: 118, w: 100, h: 12 },
      { str: '00.360.305 0001-04', x: 80, y: 136, w: 120, h: 12 },
      { str: 'DOC.: Pix', x: 80, y: 154, w: 80, h: 12 },
      { str: '02/02', x: 10, y: 172, w: 40, h: 12 },
      { str: 'PIX REC.OUTRA IF MT', x: 80, y: 172, w: 140, h: 12 },
      { str: '50.000,00C', x: 400, y: 172, w: 70, h: 12 },
    ];
    const blocos = extratoLancamentoBlocosFromItems(items, 500, 0.36);
    expect(blocos).toHaveLength(2);
    expect(blocos[0]!.lines).toHaveLength(4);
    expect(blocos[1]!.lines).toHaveLength(1);
  });

  it('não confunde valor monetário 3.270,95D com data no início da linha', () => {
    const items = [
      { str: '3.270,95D', x: 400, y: 118, w: 70, h: 12 },
    ];
    const lines = extratoPhysicalLinesFromItems(items, 500, 0.36);
    expect(lines).toHaveLength(1);
    expect(extratoLinhaIniciaNovoLancamento(lines[0]!)).toBe(false);
  });

  it('descarta linha ignorada com valor no agrupamento de blocos', () => {
    const items = [
      { str: '15/04/2026', x: 10, y: 80, w: 80, h: 12 },
      { str: 'SISPAG FORNECEDORES', x: 120, y: 80, w: 160, h: 12 },
      { str: '-17.225,00', x: 400, y: 80, w: 80, h: 12 },
      { str: '15/04/2026', x: 10, y: 100, w: 80, h: 12 },
      { str: 'SALDO TOTAL DISPONIVEL DIA', x: 120, y: 100, w: 200, h: 12 },
      { str: '-9.999,11', x: 400, y: 100, w: 80, h: 12 },
      { str: '15/04/2026', x: 10, y: 120, w: 80, h: 12 },
      { str: 'PIX RECEBIDO', x: 120, y: 120, w: 120, h: 12 },
      { str: '-500,00', x: 400, y: 120, w: 80, h: 12 },
    ];
    const blocos = extratoLancamentoBlocosFromItems(items, 500, 0.36, ['saldo']);
    expect(blocos).toHaveLength(2);
    expect(blocos.every((b) => !extratoTextoContemPalavraIgnorada(
      b.lines.map((l) => l.items.map((i) => i.str).join(' ')).join(' '),
      ['saldo'],
    ))).toBe(true);
  });

  it('agrupa TED multilinha quando valor está na linha de continuação (CNPJ)', () => {
    const items = [
      { str: '16/04/2026', x: 10, y: 200, w: 80, h: 14 },
      { str: 'TED 041.0310.CAMARA M D', x: 120, y: 200, w: 180, h: 14 },
      { str: 'CAMARA MUN. DE VEREADORES', x: 320, y: 200, w: 200, h: 14 },
      { str: 'DE P FUND', x: 120, y: 218, w: 80, h: 14 },
      { str: '04.763.273/0001-49', x: 280, y: 218, w: 120, h: 14 },
      { str: '25.636,00', x: 814, y: 218, w: 72, h: 14 },
    ];
    const blocos = extratoLancamentoBlocosFromItems(items, 920, 0.36);
    expect(blocos).toHaveLength(1);
    expect(blocos[0]!.lines.length).toBe(2);
  });

  it('não separa bloco quando valor OCR duplicado aparece na linha seguinte', () => {
    const items = [
      { str: '02/02', x: 10, y: 100, w: 40, h: 12 },
      { str: 'PIX EMIT.OUTRA IF', x: 80, y: 100, w: 140, h: 12 },
      { str: '3.270,95D', x: 400, y: 100, w: 70, h: 12 },
      { str: '3.270,95D', x: 400, y: 118, w: 70, h: 12 },
      { str: 'Pagamento Pix', x: 80, y: 136, w: 100, h: 12 },
      { str: 'DOC.: Pix', x: 80, y: 154, w: 80, h: 12 },
      { str: '02/02', x: 10, y: 172, w: 40, h: 12 },
      { str: 'PIX REC', x: 80, y: 172, w: 90, h: 12 },
      { str: '50.000,00C', x: 400, y: 172, w: 70, h: 12 },
    ];
    const blocos = extratoLancamentoBlocosFromItems(items, 500, 0.36);
    expect(blocos).toHaveLength(2);
    expect(blocos[0]!.lines.length).toBeGreaterThanOrEqual(4);
  });
});

describe('computeExtratoSeparadoresTopoPorValor — prévia OCR', () => {
  it('linha com data + histórico + 50.000,00C inicia novo lançamento (não é valor órfão)', () => {
    const items = [
      { str: '02/02', x: 10, y: 172, w: 40, h: 12 },
      { str: 'PIX REC.OUTRA IF MT', x: 80, y: 172, w: 140, h: 12 },
      { str: '50.000,00C', x: 400, y: 172, w: 70, h: 12 },
    ];
    const lines = extratoPhysicalLinesFromItems(items, 500, 0.36);
    expect(lines).toHaveLength(1);
    expect(extratoLinhaIniciaNovoLancamento(lines[0]!)).toBe(true);
  });

  it('gera uma linha no topo de cada valor (3270 + 50 mil + débitos)', () => {
    const items = [
      { str: '02/02', x: 10, y: 100, w: 40, h: 12 },
      { str: 'PIX EMIT.OUTRA IF', x: 80, y: 100, w: 140, h: 12 },
      { str: '3.270,95D', x: 400, y: 100, w: 70, h: 12 },
      { str: 'Pagamento Pix', x: 80, y: 118, w: 100, h: 12 },
      { str: 'DOC.: Pix', x: 80, y: 136, w: 80, h: 12 },
      { str: '02/02', x: 10, y: 154, w: 40, h: 12 },
      { str: 'PIX REC.OUTRA IF MT', x: 80, y: 154, w: 140, h: 12 },
      { str: '50.000,00C', x: 400, y: 154, w: 70, h: 12 },
      { str: '02/02', x: 10, y: 172, w: 40, h: 12 },
      { str: 'PIX EMIT.OUTRA IF', x: 80, y: 172, w: 140, h: 12 },
      { str: '6.358,79D', x: 400, y: 172, w: 70, h: 12 },
      { str: '02/02', x: 10, y: 190, w: 40, h: 12 },
      { str: 'PIX EMIT.OUTRA IF', x: 80, y: 190, w: 140, h: 12 },
      { str: '5.987,37D', x: 400, y: 190, w: 70, h: 12 },
    ];
    const separadores = computeExtratoSeparadoresTopoPorValor(items, 500, 0.36);
    expect(separadores).toEqual([96, 150, 168, 186]);
  });

  it('não duplica linha para valor OCR repetido na linha seguinte', () => {
    const separadores = computeExtratoSeparadoresTopoPorValor(
      [
        { str: '02/02', x: 10, y: 100, w: 40, h: 12 },
        { str: 'PIX', x: 80, y: 100, w: 60, h: 12 },
        { str: '100,00D', x: 400, y: 100, w: 60, h: 12 },
        { str: '100,00D', x: 400, y: 101, w: 60, h: 12 },
        { str: '02/02', x: 10, y: 120, w: 40, h: 12 },
        { str: 'TED', x: 80, y: 120, w: 60, h: 12 },
        { str: '200,00D', x: 400, y: 120, w: 60, h: 12 },
      ],
      500,
      0.36,
    );
    expect(separadores).toEqual([96, 116]);
  });

  it('não duplica separador quando valor OCR repete na linha imediatamente abaixo', () => {
    const separadores = computeExtratoSeparadoresTopoPorValor(
      [
        { str: '27/02', x: 10, y: 100, w: 40, h: 12 },
        { str: 'JUROS', x: 80, y: 100, w: 80, h: 12 },
        { str: '1.815,56D', x: 400, y: 100, w: 70, h: 12 },
        { str: 'DOC.: LC', x: 80, y: 118, w: 80, h: 12 },
        { str: '1.815,56D', x: 400, y: 119, w: 70, h: 12 },
        { str: '28/02', x: 10, y: 140, w: 40, h: 12 },
        { str: 'PIX', x: 80, y: 140, w: 60, h: 12 },
        { str: '500,00C', x: 400, y: 140, w: 60, h: 12 },
      ],
      500,
      0.36,
    );
    expect(separadores).toEqual([96, 136]);
  });

  it('gera linha também para valor zero (0,00D)', () => {
    const separadores = computeExtratoSeparadoresTopoPorValor(
      [
        { str: '03/02', x: 10, y: 200, w: 40, h: 12 },
        { str: 'TARIFA', x: 80, y: 200, w: 80, h: 12 },
        { str: '0,00D', x: 400, y: 200, w: 60, h: 12 },
        { str: '03/02', x: 10, y: 220, w: 40, h: 12 },
        { str: 'PIX', x: 80, y: 220, w: 60, h: 12 },
        { str: '50,00D', x: 400, y: 220, w: 60, h: 12 },
      ],
      500,
      0.36,
    );
    expect(separadores).toEqual([196, 216]);
  });

  it('mesma faixa Y com vários valores na linha gera uma linha azul (valor operacional)', () => {
    const items = [
      { str: '29 Abr, 2026', x: 10, y: 100, w: 70, h: 12 },
      { str: 'Maquininha', x: 120, y: 100, w: 80, h: 12 },
      { str: '5.900,00', x: 350, y: 100, w: 70, h: 12 },
      { str: '5.789,08', x: 430, y: 102, w: 70, h: 12 },
      { str: '110,92', x: 510, y: 101, w: 60, h: 12 },
    ];
    const antes = computeExtratoSeparadoresTopoPorValor(items, 600, 0.36);
    const depois = computeExtratoSeparadoresTopoPorValor(
      items,
      600,
      0.36,
      2,
      { min: 340, max: 520 },
    );
    expect(antes).toEqual([96]);
    expect(depois).toEqual(antes);
  });

  it('linhas de saldo do dia continuam na prévia mesmo com palavra ignorada (importação)', () => {
    const items = [
      { str: '15/04/2026', x: 10, y: 80, w: 80, h: 12 },
      { str: 'SISPAG FORNECEDORES', x: 120, y: 80, w: 160, h: 12 },
      { str: '-17.225,00', x: 400, y: 80, w: 80, h: 12 },
      { str: '15/04/2026', x: 10, y: 100, w: 80, h: 12 },
      { str: 'SALDO TOTAL DISPONIVEL DIA', x: 120, y: 100, w: 200, h: 12 },
      { str: '-9.999,11', x: 400, y: 100, w: 80, h: 12 },
    ];
    const semFiltro = computeExtratoSeparadoresTopoPorValor(items, 500, 0.36, 2, { min: 350, max: 500 });
    expect(semFiltro).toHaveLength(2);
    const comFiltro = computeExtratoSeparadoresTopoPorValor(
      items,
      500,
      0.36,
      2,
      { min: 350, max: 500 },
      ['saldo'],
    );
    expect(comFiltro).toHaveLength(2);
  });

  it('Bradesco: valor e saldo na mesma linha geram só uma linha azul', () => {
    const items = [
      { str: '22/04/2026', x: 10, y: 120, w: 80, h: 12 },
      { str: 'TED RECEBIDA', x: 120, y: 120, w: 120, h: 12 },
      { str: '1.768,52', x: 400, y: 120, w: 70, h: 12 },
      { str: '2.759,41', x: 814, y: 120, w: 70, h: 12 },
    ];
    const col = { min: 350, max: 920 };
    const separadores = computeExtratoSeparadoresTopoPorValor(items, 920, 0.36, 0, col);
    expect(separadores).toHaveLength(1);
    expect(separadores[0]).toBe(116);
  });

  it('Bradesco: saldo do dia com valor só na coluna saldo ainda recebe linha azul', () => {
    const items = [
      { str: '20/04/2026', x: 10, y: 80, w: 80, h: 12 },
      { str: 'SALDO TOTAL DISPONIVEL DIA', x: 120, y: 80, w: 200, h: 12 },
      { str: '990,89', x: 814, y: 80, w: 60, h: 12 },
    ];
    const separadores = computeExtratoSeparadoresTopoPorValor(
      items,
      920,
      0.36,
      0,
      { min: 350, max: 520 },
    );
    expect(separadores).toHaveLength(1);
    expect(separadores[0]).toBe(76);
  });

  it('gera linha para cada valor mesmo após histórico multilinha (SALDO DO DIA)', () => {
    const separadores = computeExtratoSeparadoresTopoPorValor(
      [
        { str: '25/02', x: 44, y: 200, w: 36, h: 14 },
        { str: 'SALDO DO DIA', x: 120, y: 200, w: 120, h: 14 },
        { str: '89.853,10C', x: 814, y: 200, w: 72, h: 14 },
        { str: '26/02', x: 44, y: 218, w: 36, h: 14 },
        { str: 'SAQ S/ CARTAO', x: 120, y: 218, w: 120, h: 14 },
        { str: '2.000,00D', x: 814, y: 218, w: 72, h: 14 },
        { str: 'SAQ.DIG. NOME: FERTILIZANTES', x: 120, y: 230, w: 200, h: 14 },
        { str: 'DOC.: 0003ATM', x: 120, y: 242, w: 100, h: 14 },
        { str: '26/02', x: 44, y: 254, w: 36, h: 14 },
        { str: 'SALDO DO DIA', x: 120, y: 254, w: 120, h: 14 },
        { str: '87.853,10C', x: 814, y: 254, w: 72, h: 14 },
      ],
      920,
      0.36,
      2,
      { min: 720, max: 920 },
    );
    expect(separadores).toEqual([196, 214, 250]);
  });

  it('não confunde valores diferentes com Y muito próximo', () => {
    const separadores = computeExtratoSeparadoresTopoPorValor(
      [
        { str: '2.000,00D', x: 814, y: 250, w: 72, h: 14 },
        { str: '87.853,10C', x: 814, y: 252, w: 72, h: 14 },
      ],
      920,
      0.36,
      2,
      { min: 720, max: 920 },
    );
    expect(separadores).toEqual([246, 248]);
  });

  it('linha azul fica no topo do bloco multilinha (data + valor na linha seguinte)', () => {
    const separadores = computeExtratoSeparadoresTopoPorValor(
      [
        { str: '29 Abr, 2026', x: 10, y: 88, w: 70, h: 12 },
        { str: '16:07', x: 10, y: 100, w: 40, h: 12 },
        { str: 'Maquininha', x: 120, y: 88, w: 80, h: 12 },
        { str: '500,00', x: 350, y: 100, w: 70, h: 12 },
      ],
      600,
      0.36,
    );
    expect(separadores).toHaveLength(1);
    expect(separadores[0]).toBe(84);
  });

  it('gera uma linha por lançamento SICOOB com DOC multilinha', () => {
    const separadores = computeExtratoSeparadoresTopoPorValor(
      [
        { str: '30/01', x: 10, y: 80, w: 40, h: 12 },
        { str: 'SALDO ANTERIOR', x: 80, y: 80, w: 120, h: 12 },
        { str: '2.747,94D', x: 400, y: 80, w: 70, h: 12 },
        { str: '30/01', x: 10, y: 100, w: 40, h: 12 },
        { str: 'SALDO BLOQ.ANTERIOR', x: 80, y: 100, w: 140, h: 12 },
        { str: '0,00*', x: 400, y: 100, w: 60, h: 12 },
        { str: '02/02', x: 10, y: 120, w: 40, h: 12 },
        { str: 'DÉB.TIT.COMPE.EFETI', x: 80, y: 120, w: 140, h: 12 },
        { str: '471,41D', x: 400, y: 120, w: 70, h: 12 },
        { str: 'DOC.: 1774905', x: 80, y: 132, w: 100, h: 12 },
        { str: '02/02', x: 10, y: 144, w: 40, h: 12 },
        { str: 'DÉB.TIT.COMPE.EFETI', x: 80, y: 144, w: 140, h: 12 },
        { str: '104,13D', x: 400, y: 144, w: 70, h: 12 },
        { str: 'DOC.: 1774906', x: 80, y: 156, w: 100, h: 12 },
        { str: '02/02', x: 10, y: 168, w: 40, h: 12 },
        { str: 'PIX EMIT.OUTRA IF', x: 80, y: 168, w: 140, h: 12 },
        { str: '526,17D', x: 400, y: 168, w: 70, h: 12 },
        { str: '02/02', x: 10, y: 192, w: 40, h: 12 },
        { str: 'DÉB.TIT.COMPE.EFETI', x: 80, y: 192, w: 140, h: 12 },
        { str: '3.473,83D', x: 400, y: 192, w: 70, h: 12 },
        { str: 'DOC.: 1774911', x: 80, y: 204, w: 100, h: 12 },
      ],
      500,
      0.36,
    );
    expect(separadores).toEqual([76, 96, 116, 140, 164, 188]);
  });

  it('gera linha acima de 0,00* mesmo em linha SALDO BLOQ (prévia OCR)', () => {
    const items = [
      { str: '30/01', x: 10, y: 80, w: 40, h: 12 },
      { str: 'SALDO ANTERIOR', x: 80, y: 80, w: 120, h: 12 },
      { str: '2.747,94D', x: 400, y: 80, w: 70, h: 12 },
      { str: '30/01', x: 10, y: 100, w: 40, h: 12 },
      { str: 'SALDO BLOQ.ANTERIOR', x: 80, y: 100, w: 140, h: 12 },
      { str: '0,00*', x: 400, y: 100, w: 60, h: 12 },
    ];
    const separadores = computeExtratoSeparadoresTopoPorValor(
      items,
      500,
      0.36,
      2,
      { min: 350, max: 500 },
    );
    expect(separadores).toEqual([76, 96]);
  });

  it('gera linha acima de cada valor isolado na coluna (layout SICOOB valor único)', () => {
    const separadores = computeExtratoSeparadoresTopoPorValor(
      [
        { str: '2.747,94D', x: 400, y: 80, w: 70, h: 12 },
        { str: '0,00*', x: 400, y: 100, w: 60, h: 12 },
        { str: '471,41D', x: 400, y: 120, w: 70, h: 12 },
        { str: '104,13D', x: 400, y: 144, w: 70, h: 12 },
        { str: '526,17D', x: 400, y: 168, w: 70, h: 12 },
        { str: '3.473,83D', x: 400, y: 192, w: 70, h: 12 },
        { str: '1.938,71D', x: 400, y: 216, w: 70, h: 12 },
        { str: '380,00D', x: 400, y: 240, w: 70, h: 12 },
        { str: '3.270,95D', x: 400, y: 264, w: 70, h: 12 },
        { str: '50.000,00C', x: 400, y: 288, w: 70, h: 12 },
      ],
      500,
      0.36,
      2,
      { min: 350, max: 500 },
    );
    expect(separadores).toEqual([76, 96, 116, 140, 164, 188, 212, 236, 260, 284]);
  });

  it('gera linha para 0,00* (legenda bancária Santander)', () => {
    const separadores = computeExtratoSeparadoresTopoPorValor(
      [
        { str: '30/01', x: 10, y: 80, w: 40, h: 12 },
        { str: 'SALDO ANTERIOR', x: 80, y: 80, w: 120, h: 12 },
        { str: '2.747,94D', x: 400, y: 80, w: 70, h: 12 },
        { str: '30/01', x: 10, y: 100, w: 40, h: 12 },
        { str: 'SALDO BLOQ.ANTERIOR', x: 80, y: 100, w: 140, h: 12 },
        { str: '0,00*', x: 400, y: 100, w: 60, h: 12 },
        { str: '02/02', x: 10, y: 120, w: 40, h: 12 },
        { str: 'DEB TIT', x: 80, y: 120, w: 80, h: 12 },
        { str: '471,41D', x: 400, y: 120, w: 60, h: 12 },
      ],
      500,
      0.36,
    );
    expect(separadores).toEqual([76, 96, 116]);
  });

  it('sobe linha azul que cortaria histórico multilinha (rendimentos)', () => {
    const items = [
      { str: '06/04/2026', x: 10, y: 100, w: 80, h: 12 },
      { str: 'RENDIMENTOS REND PAGO APLIC', x: 120, y: 100, w: 200, h: 12 },
      { str: 'AUT MAIS', x: 120, y: 118, w: 80, h: 12 },
      { str: '0,66', x: 400, y: 118, w: 40, h: 12 },
    ];
    const separadores = computeExtratoSeparadoresTopoPorValor(
      items,
      500,
      0.36,
      2,
      { min: 350, max: 500 },
    );
    expect(separadores).toHaveLength(1);
    expect(separadores[0]).toBeLessThan(100);
    expect(separadores[0]).toBe(96);
  });

  it('TED multilinha (CAMARA MUN + DE P FUND) gera só uma linha azul no topo', () => {
    const items = [
      { str: '16/04/2026', x: 10, y: 200, w: 80, h: 14 },
      { str: 'TED 041.0310.CAMARA M D', x: 120, y: 200, w: 180, h: 14 },
      { str: 'CAMARA MUN. DE VEREADORES', x: 320, y: 200, w: 200, h: 14 },
      { str: 'DE P FUND', x: 120, y: 218, w: 80, h: 14 },
      { str: '04.763.273/0001-49', x: 280, y: 218, w: 120, h: 14 },
      { str: '25.636,00', x: 814, y: 218, w: 72, h: 14 },
    ];
    const blocos = extratoLancamentoBlocosFromItems(items, 920, 0.36);
    expect(blocos).toHaveLength(1);
    expect(blocos[0]!.lines.length).toBeGreaterThanOrEqual(2);
    const separadores = computeExtratoSeparadoresTopoPorValor(
      items,
      920,
      0.36,
      2,
      { min: 720, max: 920 },
    );
    expect(separadores).toHaveLength(1);
    expect(separadores[0]).toBeLessThan(218);
    expect(separadores[0]).toBe(196);
  });

  it('Bradesco: uma linha por valor na coluna mapeada (incl. órfãos e multilinha CNPJ)', () => {
    const items = [
      { str: '-5.697,93', x: 400, y: 50, w: 70, h: 12 },
      { str: 'MUNICIPIO DE FOZ DO IGUACU', x: 80, y: 70, w: 180, h: 12 },
      { str: '76.206.606/0001-40', x: 80, y: 82, w: 120, h: 12 },
      { str: '44.558,80', x: 400, y: 70, w: 70, h: 12 },
      { str: 'EFAZ-GO/SARE-DARE', x: 80, y: 100, w: 140, h: 12 },
      { str: '01.409.655/0001-80', x: 80, y: 112, w: 120, h: 12 },
      { str: '-1.534,00', x: 400, y: 100, w: 70, h: 12 },
      { str: '-37.498,09', x: 400, y: 130, w: 70, h: 12 },
      { str: '-543,22', x: 400, y: 148, w: 70, h: 12 },
    ];
    const col = { min: 350, max: 500 };
    const lines = extratoPhysicalLinesFromItems(items, 500, 0.36);
    expect(extratoLinhaIniciaNovoLancamento(lines[1]!)).toBe(true);
    expect(extratoLinhaIniciaNovoLancamento(lines[3]!)).toBe(true);
    const separadores = computeExtratoSeparadoresTopoPorValor(items, 500, 0.36, 0, col);
    expect(separadores).toHaveLength(5);
    expect(separadores).toEqual([46, 66, 96, 126, 144]);
  });

  it('Itaú/Bradesco: uma linha por valor, saldo incluído, sem linhas duplicadas próximas', () => {
    const items = [
      { str: '23/04/2026', x: 10, y: 80, w: 80, h: 12 },
      { str: 'RENDIMENTOS REND PAGO APLIC AUT MAIS', x: 120, y: 80, w: 220, h: 12 },
      { str: '0,03', x: 400, y: 80, w: 40, h: 12 },
      { str: '23/04/2026', x: 10, y: 100, w: 80, h: 12 },
      { str: 'SISPAG FORNECEDORES PIX QR CODE', x: 120, y: 100, w: 200, h: 12 },
      { str: '44.558,80', x: 400, y: 112, w: 70, h: 12 },
      { str: '16/04/2026', x: 10, y: 130, w: 80, h: 12 },
      { str: 'TED RECEBIDA 001.0140.MUNICIPIO D', x: 120, y: 130, w: 200, h: 12 },
      { str: 'CAMARA MUN DE P FUND', x: 120, y: 148, w: 140, h: 12 },
      { str: '21.338,74', x: 400, y: 148, w: 70, h: 12 },
      { str: '24/04/2026', x: 10, y: 170, w: 80, h: 12 },
      { str: 'SALDO TOTAL DISPONIVEL DIA', x: 120, y: 170, w: 200, h: 12 },
      { str: '61,49', x: 814, y: 170, w: 50, h: 12 },
      { str: '24/04/2026', x: 10, y: 190, w: 80, h: 12 },
      { str: 'PAGAMENTOS TRIB COD BARRAS', x: 120, y: 190, w: 180, h: 12 },
      { str: '-37.498,09', x: 400, y: 190, w: 80, h: 12 },
      { str: '-543,22', x: 400, y: 210, w: 70, h: 12 },
      { str: '0,01', x: 400, y: 230, w: 40, h: 12 },
      { str: '29/04/2026', x: 10, y: 250, w: 80, h: 12 },
      { str: 'SALDO TOTAL DISPONIVEL DIA', x: 120, y: 250, w: 200, h: 12 },
      { str: '5.044,98', x: 814, y: 250, w: 60, h: 12 },
    ];
    const col = { min: 350, max: 520 };
    const separadores = computeExtratoSeparadoresTopoPorValor(items, 920, 0.36, 0, col, ['saldo']);
    expect(separadores).toHaveLength(8);
    for (let i = 1; i < separadores.length; i++) {
      expect(separadores[i]! - separadores[i - 1]!).toBeGreaterThanOrEqual(8);
    }
  });

  it('SISPAG + SALDO + TED multilinha + PAGAMENTOS TRIB: linha em cada valor', () => {
    const items = [
      { str: '15/04/2026', x: 10, y: 80, w: 80, h: 12 },
      { str: 'SISPAG FORNECEDORES', x: 120, y: 80, w: 160, h: 12 },
      { str: '-17.225,00', x: 400, y: 80, w: 80, h: 12 },
      { str: '15/04/2026', x: 10, y: 100, w: 80, h: 12 },
      { str: 'SALDO TOTAL DISPONIVEL DIA', x: 120, y: 100, w: 200, h: 12 },
      { str: '-9.999,11', x: 400, y: 100, w: 80, h: 12 },
      { str: '16/04/2026', x: 10, y: 120, w: 80, h: 12 },
      { str: 'TED 041.0310.CAMARA M D', x: 120, y: 120, w: 180, h: 12 },
      { str: 'CAMARA MUN. DE VEREADORES', x: 320, y: 120, w: 200, h: 12 },
      { str: '04.763.273/0001-49', x: 120, y: 138, w: 120, h: 12 },
      { str: '25.636,00', x: 400, y: 138, w: 72, h: 12 },
      { str: '16/04/2026', x: 10, y: 158, w: 80, h: 12 },
      { str: 'SALDO TOTAL DISPONIVEL DIA', x: 120, y: 158, w: 200, h: 12 },
      { str: '15.636,89', x: 814, y: 158, w: 70, h: 12 },
      { str: '20/04/2026', x: 10, y: 178, w: 80, h: 12 },
      { str: 'PAGAMENTOS TRIB COD BARRAS', x: 120, y: 178, w: 180, h: 12 },
      { str: '-451,21', x: 400, y: 178, w: 70, h: 12 },
    ];
    const separadores = computeExtratoSeparadoresTopoPorValor(
      items,
      920,
      0.36,
      0,
      { min: 350, max: 520 },
      ['saldo anterior', 'saldo bloq', 'saldo do dia'],
    );
    expect(separadores).toHaveLength(5);
    expect(separadores).toEqual([76, 96, 116, 154, 174]);
    for (let i = 1; i < separadores.length; i++) {
      expect(separadores[i]! - separadores[i - 1]!).toBeGreaterThanOrEqual(8);
    }
  });

  it('audit: cobertura de linhas azul para PIX, TED multilinha, SICOOB e rendimentos', () => {
    const pixMultilinha = [
      { str: '02/02', x: 10, y: 100, w: 40, h: 12 },
      { str: 'PIX EMIT.OUTRA IF', x: 80, y: 100, w: 140, h: 12 },
      { str: '3.270,95D', x: 400, y: 100, w: 70, h: 12 },
      { str: 'Pagamento Pix', x: 80, y: 118, w: 100, h: 12 },
      { str: 'DOC.: Pix', x: 80, y: 136, w: 80, h: 12 },
      { str: '02/02', x: 10, y: 154, w: 40, h: 12 },
      { str: 'PIX REC.OUTRA IF MT', x: 80, y: 154, w: 140, h: 12 },
      { str: '50.000,00C', x: 400, y: 154, w: 70, h: 12 },
    ];
    const tedMultilinha = [
      { str: '16/04/2026', x: 10, y: 200, w: 80, h: 14 },
      { str: 'TED 041.0310.CAMARA M D', x: 120, y: 200, w: 180, h: 14 },
      { str: 'CAMARA MUN. DE VEREADORES', x: 320, y: 200, w: 200, h: 14 },
      { str: 'DE P FUND', x: 120, y: 218, w: 80, h: 14 },
      { str: '04.763.273/0001-49', x: 280, y: 218, w: 120, h: 14 },
      { str: '25.636,00', x: 814, y: 218, w: 72, h: 14 },
    ];
    const sicoobValores = [
      { str: '2.747,94D', x: 400, y: 280, w: 70, h: 12 },
      { str: '471,41D', x: 400, y: 300, w: 70, h: 12 },
      { str: '104,13D', x: 400, y: 320, w: 70, h: 12 },
    ];
    const rendimentos = [
      { str: '06/04/2026', x: 10, y: 340, w: 80, h: 12 },
      { str: 'RENDIMENTOS REND PAGO APLIC', x: 120, y: 340, w: 200, h: 12 },
      { str: 'AUT MAIS', x: 120, y: 358, w: 80, h: 12 },
      { str: '0,66', x: 400, y: 358, w: 40, h: 12 },
    ];
    const items = [...pixMultilinha, ...tedMultilinha, ...sicoobValores, ...rendimentos];
    const separadores = computeExtratoSeparadoresTopoPorValor(
      items,
      920,
      0.36,
      2,
      { min: 350, max: 920 },
    );
    const audit = auditarExtratoSeparadoresPreview(
      items,
      920,
      separadores,
      0.36,
      { min: 350, max: 920 },
    );
    expect(audit.coberturaOk).toBe(true);
    expect(separadores.length).toBe(audit.blocosOperacionais);
    expect(separadores.length).toBeGreaterThanOrEqual(4);
  });
});

describe('segmentarExtratoEmLancamentos — fonte única de extração', () => {
  it('PIX multilinha vira um segmento com histórico em várias linhas', () => {
    const items = [
      { str: '02/02', x: 10, y: 100, w: 40, h: 12 },
      { str: 'PIX EMIT.OUTRA IF', x: 80, y: 100, w: 140, h: 12 },
      { str: '3.270,95D', x: 400, y: 100, w: 70, h: 12 },
      { str: 'Pagamento Pix', x: 80, y: 118, w: 100, h: 12 },
      { str: 'DOC.: Pix', x: 80, y: 136, w: 80, h: 12 },
      { str: '02/02', x: 10, y: 154, w: 40, h: 12 },
      { str: 'PIX REC.OUTRA IF MT', x: 80, y: 154, w: 140, h: 12 },
      { str: '50.000,00C', x: 400, y: 154, w: 70, h: 12 },
    ];
    const segmentos = segmentarExtratoEmLancamentos(items, 500, {
      yTolFactor: 0.36,
      valorColX: { min: 350, max: 500 },
    });
    expect(segmentos).toHaveLength(2);
    expect(segmentos[0]!.linhas.length).toBeGreaterThanOrEqual(2);
    expect(segmentos[0]!.historicoTokens.some((t) => t.str.includes('Pagamento'))).toBe(true);
    expect(segmentos[0]!.valorToken?.str).toContain('3.270,95');
    expect(segmentos[1]!.valorToken?.str).toContain('50.000,00');
  });

  it('TED multilinha (valor na linha 2) é um segmento só', () => {
    const items = [
      { str: '16/04/2026', x: 10, y: 200, w: 80, h: 14 },
      { str: 'TED 041.0310.CAMARA M D', x: 120, y: 200, w: 180, h: 14 },
      { str: 'DE P FUND', x: 120, y: 218, w: 80, h: 14 },
      { str: '25.636,00', x: 814, y: 218, w: 72, h: 14 },
    ];
    const segmentos = segmentarExtratoEmLancamentos(items, 920, {
      yTolFactor: 0.36,
      valorColX: { min: 720, max: 920 },
    });
    expect(segmentos).toHaveLength(1);
    expect(segmentos[0]!.linhas.length).toBeGreaterThanOrEqual(2);
    expect(segmentos[0]!.valorToken?.str).toContain('25.636,00');
  });

  it('SICOOB valor único gera um segmento por valor', () => {
    const items = [
      { str: '2.747,94D', x: 400, y: 80, w: 70, h: 12 },
      { str: '471,41D', x: 400, y: 120, w: 70, h: 12 },
      { str: '104,13D', x: 400, y: 144, w: 70, h: 12 },
    ];
    const segmentos = segmentarExtratoEmLancamentos(items, 500, {
      yTolFactor: 0.36,
      valorColX: { min: 350, max: 500 },
    });
    expect(segmentos).toHaveLength(3);
    expect(segmentos.every((s) => s.valorToken !== null)).toBe(true);
  });

  it('auditoria confirma cobertura 1:1 valor ↔ segmento', () => {
    const items = [
      { str: '2.747,94D', x: 400, y: 80, w: 70, h: 12 },
      { str: '471,41D', x: 400, y: 120, w: 70, h: 12 },
      { str: '104,13D', x: 400, y: 144, w: 70, h: 12 },
    ];
    const segmentos = segmentarExtratoEmLancamentos(items, 500, {
      yTolFactor: 0.36,
      valorColX: { min: 350, max: 500 },
    });
    const audit = auditarCoberturaValoresExtrato(
      items,
      segmentos,
      500,
      { min: 350, max: 500 },
    );
    expect(audit.ok).toBe(true);
    expect(audit.colunaValorMapeada).toBe(true);
    expect(audit.valoresDetectados).toBe(3);
    expect(audit.segmentosComValor).toBe(3);
  });

  it('auditoria falha sem coluna valor mapeada', () => {
    const items = [{ str: '100,00D', x: 400, y: 80, w: 70, h: 12 }];
    const audit = auditarCoberturaValoresExtrato(items, [], 500, undefined);
    expect(audit.ok).toBe(false);
    expect(audit.colunaValorMapeada).toBe(false);
    expect(audit.mensagem).toMatch(/coluna de valor/i);
  });

  it('validarMapeamentoExtratoOcr exige data, histórico e valor', () => {
    const items = [
      { str: '02/02', x: 10, y: 100, w: 40, h: 12 },
      { str: 'PIX', x: 80, y: 100, w: 60, h: 12 },
      { str: '100,00D', x: 400, y: 100, w: 60, h: 12 },
    ];
    const semValor = validarMapeamentoExtratoOcr({
      columns: [
        { id: 'data', start: 0, end: 80 },
        { id: 'descricao', start: 90, end: 380 },
      ],
      imgWidth: 500,
      imgHeight: 200,
      items,
      semDelimitacaoVertical: true,
    });
    expect(semValor.ok).toBe(false);
    expect(semValor.checks.some((c) => c.id === 'coluna_valor' && !c.ok)).toBe(true);

    const completo = validarMapeamentoExtratoOcr({
      columns: [
        { id: 'data', start: 0, end: 80 },
        { id: 'descricao', start: 90, end: 380 },
        { id: 'valorMisto', start: 390, end: 500 },
      ],
      imgWidth: 500,
      imgHeight: 200,
      items,
      semDelimitacaoVertical: true,
    });
    expect(completo.ok).toBe(true);
  });

  it('segmentarExtratoEmClusters equivale aos clusters do segmentador', () => {
    const items = [
      { str: '02/02', x: 10, y: 100, w: 40, h: 12 },
      { str: 'PIX', x: 80, y: 100, w: 60, h: 12 },
      { str: '100,00D', x: 400, y: 100, w: 60, h: 12 },
      { str: '02/02', x: 10, y: 120, w: 40, h: 12 },
      { str: 'TED', x: 80, y: 120, w: 60, h: 12 },
      { str: '200,00D', x: 400, y: 120, w: 60, h: 12 },
    ];
    const segmentos = segmentarExtratoEmLancamentos(items, 500, { yTolFactor: 0.36 });
    const clusters = segmentarExtratoEmClusters(items, 500, { yTolFactor: 0.36 });
    expect(clusters).toHaveLength(segmentos.length);
    expect(clusters.map((c) => c.length)).toEqual(segmentos.map((s) => s.cluster.length));
  });

  it('buildHistoricoFromSegmento inclui Pagamento Pix e DOC sem vazar próximo lançamento', () => {
    const items = [
      { str: '27/02', x: 10, y: 100, w: 40, h: 12 },
      { str: '7.999,54D', x: 430, y: 100, w: 70, h: 12 },
      { str: 'Pagamento Pix', x: 140, y: 118, w: 100, h: 12 },
      { str: 'DOC.: Pix', x: 140, y: 136, w: 80, h: 12 },
      { str: '28/02', x: 10, y: 160, w: 40, h: 12 },
      { str: 'PIX RECEBIDO', x: 140, y: 160, w: 100, h: 12 },
      { str: '500,00C', x: 430, y: 160, w: 60, h: 12 },
    ];
    const colMap = {
      data: { start: 0, end: 100 },
      descricao: { start: 120, end: 400 },
      valorMisto: { start: 420, end: 520 },
    };
    const segmentos = segmentarExtratoEmLancamentos(items, 600, {
      yTolFactor: 0.36,
      valorColX: { min: 400, max: 520 },
    });
    expect(segmentos).toHaveLength(2);
    const hist = buildHistoricoFromSegmento(segmentos[0]!, colMap, 600);
    expect(hist).toMatch(/Pagamento Pix/i);
    expect(hist).toMatch(/DOC/i);
    expect(hist).not.toMatch(/PIX RECEBIDO/i);
    expect(segmentos[0]!.motivoFechamento).toBe('nova_data');
    expect(segmentos[1]!.motivoFechamento).toBe('fim_faixa');
  });

  it('gap_y impede anexar histórico distante ao lançamento anterior', () => {
    const items = [
      { str: '01/03', x: 10, y: 100, w: 40, h: 12 },
      { str: 'PIX EMIT', x: 80, y: 100, w: 80, h: 12 },
      { str: '100,00D', x: 400, y: 100, w: 60, h: 12 },
      { str: 'Complemento distante', x: 80, y: 200, w: 120, h: 12 },
      { str: '02/03', x: 10, y: 220, w: 40, h: 12 },
      { str: 'TED', x: 80, y: 220, w: 60, h: 12 },
      { str: '200,00D', x: 400, y: 220, w: 60, h: 12 },
    ];
    const blocos = extratoLancamentoBlocosFromItems(items, 500, 0.36);
    const blocoPix = blocos.find((b) =>
      b.lines.some((l) => l.items.some((i) => i.str.includes('PIX EMIT'))),
    );
    expect(blocoPix).toBeTruthy();
    expect(blocoPix!.lines.some((l) => l.items.some((i) => i.str.includes('Complemento')))).toBe(
      false,
    );
  });
});

describe('mergeExtratoDescricaoContinuacao — multilinha', () => {
  it('não funde rodapé do banco ao lançamento anterior', () => {
    const rows = mergeExtratoDescricaoContinuacao([
      { data: '16/01/2026', descricao: 'PIX ENVIADO', valorDebito: '50.000,00' },
      {
        data: '',
        descricao:
          'PESSOAS COM DEFICIENCIA AUDITIVA 0800 722 0099 OUVIDORIA SALDO DISPONIVEL + LIMITE',
      },
      { data: '', descricao: 'PIX RECEBIDO', valorCredito: '300.000,00' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].descricao).toBe('PIX ENVIADO');
    expect(rows[0].descricao).not.toMatch(/0800/);
    expect(rows[1].descricao).toContain('PIX RECEBIDO');
  });
});

describe('extratoHistoricoEhPlausivel', () => {
  it('rejeita fragmento «1» e aceita histórico operacional', () => {
    expect(extratoHistoricoEhPlausivel('1')).toBe(false);
    expect(extratoHistoricoEhPlausivel('DEB.TR.CT.DIFITIT.')).toBe(true);
    expect(extratoHistoricoEhPlausivel('PIX RECEBIDO')).toBe(true);
  });

  it('trata saldo anterior com histórico OCR quebrado como informativo', () => {
    const row = {
      data: '25/02/2026',
      descricao: '1',
      valorDebito: '120.000,00',
      _linhaOcr: '25/02/2026 1 120.000,00 D',
    };
    expect(extratoRowEhSaldoInformativo(row)).toBe(true);
    const out = postProcessExtratoOcrRows(
      [
        { data: '25/02/2026', descricao: 'DEB.TR.CT.DIFITIT.', valorDebito: '30.000,00' },
        row,
      ],
      '2026',
      { ignoreLineWords: ['saldo'] },
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.descricao).toBe('DEB.TR.CT.DIFITIT.');
  });
});

describe('parseOcrIgnoreLineWords', () => {
  it('separa palavras por vírgula e ignora maiúsculas na comparação', () => {
    const words = parseOcrIgnoreLineWords('saldo anterior, BLOQ; ouvidoria\n0800');
    expect(words).toEqual(['saldo anterior', 'BLOQ', 'ouvidoria', '0800']);
    expect(
      extratoRowContemPalavraIgnorada({ descricao: 'SALDO ANTERIOR' }, words),
    ).toBe(true);
    expect(
      extratoRowContemPalavraIgnorada({ descricao: 'Pix Recebido' }, words),
    ).toBe(false);
    expect(
      extratoRowContemPalavraIgnorada({ descricao: 'ATENDIMENTO OUVIDORIA' }, ['ouvidoria']),
    ).toBe(true);
    expect(
      extratoRowContemPalavraIgnorada(
        {
          _linhaOcr: '02/02 DÉB.TIT.COMPE.EFETI 471,41D',
          descricao: 'DÉB.TIT.COMPE.EFETI SALDO BLOQ.ANTERIO *',
        },
        ['saldo bloq'],
      ),
    ).toBe(true);
    expect(
      extratoRowContemPalavraIgnorada(
        { _linhaOcr: '06/02 SALDO DO DIA 25.404,69D' },
        ['saldo do dia'],
      ),
    ).toBe(true);
    expect(
      extratoTextoContemPalavraIgnorada(
        '30/04/2026 SALDOTOTALDISPONIVELDIA 4.124,73',
        ['saldo total disponivel', 'saldo total disponivel dia'],
      ),
    ).toBe(true);
    expect(
      extratoRowContemPalavraIgnorada(
        {
          _linhaOcr: '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
        },
        ['saldo'],
      ),
    ).toBe(false);
  });

  it('remove linhas com palavras ignoradas no pós-processamento', () => {
    const out = postProcessExtratoOcrRows(
      [
        { data: '01/02/2026', descricao: 'TARIFA PACOTE', valorDebito: '29,90' },
        { data: '01/02/2026', descricao: 'PIX RECEBIDO', valorCredito: '100,00' },
      ],
      '2026',
      { ignoreLineWords: ['tarifa'] },
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.descricao).toBe('PIX RECEBIDO');
  });

  it('descarta linha inteira com SALDO DO DIA mesmo após limpar histórico', () => {
    const out = postProcessExtratoOcrRows(
      [
        { data: '27/02/2026', descricao: 'PIX ENVIADO', valorDebito: '1.600,00' },
        {
          data: '27/02/2026',
          descricao: 'DO DIA',
          valorDebito: '25.404,69',
          _linhaOcr: '27/02/2026 SALDO DO DIA 25.404,69D',
        },
      ],
      '2026',
      { ignoreLineWords: ['saldo'] },
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.descricao).toBe('PIX ENVIADO');
    expect(out[0]!.descricao).not.toMatch(/DO DIA/i);
  });
});

describe('mergeExtratoDescricaoContinuacao — multilinha PIX', () => {
  it('não importa linha com palavra ignorada mesmo com histórico parcial', () => {
    const out = mergeExtratoDescricaoContinuacao(
      [
        { data: '02/02', descricao: 'DÉB.TIT.COMPE.EFETI', valorDebito: '471,41' },
        { data: '', descricao: 'SALDO BLOQ.ANTERIO *', valorDebito: '' },
      ],
      ['saldo bloq'],
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.descricao).toBe('DÉB.TIT.COMPE.EFETI');
    expect(out[0]!.descricao).not.toMatch(/SALDO/i);
  });
});

describe('extratoRowEhSaldoInformativo', () => {
  it('identifica saldo anterior, bloq e mistura BLOQ+ANTERIOR', () => {
    expect(extratoRowEhSaldoInformativo({ descricao: 'SALDO ANTERIOR', valorDebito: '2.747,94' })).toBe(true);
    expect(extratoRowEhSaldoInformativo({ descricao: 'SALDO BLOQ.', valorDebito: '0,00' })).toBe(true);
    expect(extratoRowEhSaldoInformativo({ descricao: 'SALDO BLOQ. ANTERIOR', valorDebito: '2.747,94' })).toBe(true);
    expect(extratoRowEhSaldoInformativo({ descricao: 'PIX RECEBIDO', valorCredito: '100,00' })).toBe(false);
    expect(
      extratoRowEhSaldoInformativo({
        data: '14/04/2026',
        _linhaOcr: '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
      }),
    ).toBe(false);
  });

  it('extrai saldo anterior e remove linhas via palavras ignoradas configuráveis', () => {
    const raw: OcrExtratoRow[] = [
      { data: '30/01/2026', descricao: 'SALDO BLOQ. ANTERIOR', valorDebito: '2.747,94' },
      { data: '30/01/2026', descricao: 'PIX RECEBIDO', valorCredito: '500,00' },
    ];
    expect(extrairSaldoAnteriorDasRows(raw)).toBe(2747.94);
    const out = postProcessExtratoOcrRows(raw, '2026', {
      ignoreLineWords: ['saldo bloq', 'saldo anterior'],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.descricao).toBe('PIX RECEBIDO');
  });
});

describe('filtrarItemsPorFaixa strict', () => {
  it('não inclui cabeçalho nem rodapé fora da faixa', async () => {
    const { filtrarItemsPorFaixa } = await import('./parcelamentoColunasExtract');
    const items = [
      { str: 'CABECALHO', x: 10, y: 40, w: 80, h: 12 },
      { str: '01/02/2026', x: 10, y: 98, w: 80, h: 10 },
      { str: 'PIX', x: 200, y: 98, w: 40, h: 10 },
      { str: '100,00', x: 400, y: 98, w: 50, h: 10 },
      { str: 'RODAPE', x: 10, y: 200, w: 80, h: 12 },
      { str: 'MEIO', x: 10, y: 88, w: 40, h: 16 },
    ];
    const faixa = { startY: 90, endY: 110 };
    const strict = filtrarItemsPorFaixa(items, faixa, 300, { strict: true });
    expect(strict.map((i) => i.str)).toEqual(['01/02/2026', 'PIX', '100,00', 'MEIO']);
    expect(strict.some((i) => i.str === 'CABECALHO')).toBe(false);
    expect(strict.some((i) => i.str === 'RODAPE')).toBe(false);
  });

  it('inclui última linha quando o vermelho foi clicado no topo da linha', async () => {
    const { extractGenericRowsFromMapping } = await import('./parcelamentoColunasExtract');
    const columns = [
      { id: 'data', start: 0, end: 120, color: 'green' },
      { id: 'descricao', start: 150, end: 400, color: 'blue' },
      { id: 'valorMisto', start: 420, end: 520, color: 'orange' },
    ];
    const faixa = { startY: 80, endY: 100 };
    const items = [
      { str: '01/02/2026', x: 10, y: 100, w: 80, h: 14 },
      { str: 'PIX RECEBIDO', x: 160, y: 100, w: 120, h: 14 },
      { str: '250,00', x: 430, y: 100, w: 60, h: 14 },
      { str: 'SALDO DISPONIVEL', x: 10, y: 130, w: 200, h: 12 },
    ];
    const rows = extractGenericRowsFromMapping(
      items,
      { columns, faixa },
      300,
      600,
      {
        dataColIds: ['data', 'descricao', 'valorMisto'],
        extratoPositional: true,
        strictFaixaVertical: true,
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.descricao).toContain('PIX');
    expect(rows.some((r) => r.descricao?.includes('SALDO DISPONIVEL'))).toBe(false);
  });

  it('inclui último lançamento acima da linha vermelha mesmo com centro Y abaixo do fim', async () => {
    const { extractGenericRowsFromMapping, itemDentroFaixaVerticalExtrato } = await import(
      './parcelamentoColunasExtract'
    );
    const columns = [
      { id: 'data', start: 0, end: 120, color: 'green' },
      { id: 'descricao', start: 150, end: 400, color: 'blue' },
      { id: 'valorMisto', start: 420, end: 520, color: 'orange' },
    ];
    const faixa = { startY: 80, endY: 112 };
    const items = [
      { str: '01/02/2026', x: 10, y: 100, w: 80, h: 14 },
      { str: 'PIX RECEBIDO', x: 160, y: 100, w: 120, h: 14 },
      { str: '250,00', x: 430, y: 100, w: 60, h: 14 },
      { str: 'SALDO DISPONIVEL', x: 10, y: 130, w: 200, h: 12 },
      { str: '99,00', x: 430, y: 130, w: 60, h: 12 },
    ];
    expect(itemDentroFaixaVerticalExtrato(items[2]!, 80, 112, 14, true)).toBe(true);
    expect(itemDentroFaixaVerticalExtrato(items[4]!, 80, 112, 14, true)).toBe(false);
    const rows = extractGenericRowsFromMapping(
      items,
      { columns, faixa },
      300,
      600,
      {
        dataColIds: ['data', 'descricao', 'valorMisto'],
        extratoPositional: true,
        strictFaixaVertical: true,
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.valorMisto).toMatch(/250/);
  });
});

describe('clusterSicoobExtratoPorValor — OCR real', () => {
  it('não clusteriza linhas com saldo anterior ou saldo bloq', () => {
    const imgWidth = 500;
    const items = [
      { str: '30/01', x: 10, y: 80, w: 40, h: 12 },
      { str: 'SALDO ANTERIOR', x: 80, y: 80, w: 120, h: 12 },
      { str: '2.747,94D', x: 400, y: 80, w: 70, h: 12 },
      { str: '30/01', x: 10, y: 100, w: 40, h: 12 },
      { str: 'SALDO BLOQ.ANTERIOR', x: 80, y: 100, w: 140, h: 12 },
      { str: '0,00*', x: 400, y: 100, w: 60, h: 12 },
      { str: '02/02', x: 10, y: 120, w: 40, h: 12 },
      { str: 'PIX EMIT.OUTRA IF', x: 80, y: 120, w: 140, h: 12 },
      { str: '471,41D', x: 400, y: 120, w: 70, h: 12 },
    ];
    const clusters = clusterSicoobExtratoPorValor(items, imgWidth, [
      'saldo anterior',
      'saldo bloq',
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.map((i) => i.str).join(' ')).toMatch(/PIX EMIT/);
  });

  it('não extrai data, histórico nem valor de linhas ignoradas', async () => {
    const { extractGenericRowsFromMapping } = await import('./parcelamentoColunasExtract');
    const imgWidth = 500;
    const imgHeight = 400;
    const columns = [
      { id: 'data', start: 0, end: 95, color: 'green' },
      { id: 'descricao', start: 100, end: 350, color: 'blue' },
      { id: 'valorMisto', start: 360, end: 500, color: 'orange' },
    ];
    const items = [
      { str: '30/01', x: 10, y: 80, w: 40, h: 12 },
      { str: 'SALDO ANTERIOR', x: 80, y: 80, w: 120, h: 12 },
      { str: '2.747,94D', x: 400, y: 80, w: 70, h: 12 },
      { str: '30/01', x: 10, y: 100, w: 40, h: 12 },
      { str: 'SALDO BLOQ.ANTERIOR', x: 80, y: 100, w: 140, h: 12 },
      { str: '0,00*', x: 400, y: 100, w: 60, h: 12 },
      { str: '02/02', x: 10, y: 120, w: 40, h: 12 },
      { str: 'PIX EMIT.OUTRA IF', x: 80, y: 120, w: 140, h: 12 },
      { str: '471,41D', x: 400, y: 120, w: 70, h: 12 },
    ];
    const rows = extractGenericRowsFromMapping(items, { columns }, imgHeight, imgWidth, {
      dataColIds: ['data', 'descricao', 'valorMisto'],
      extratoPositional: true,
      ocrFullText: 'SICOOB DATA HISTORICO VALOR',
      statementYear: '2026',
      ignoreLineWords: ['saldo anterior', 'saldo bloq', 'saldo do dia'],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.descricao).toMatch(/PIX EMIT/);
    expect(rows[0]!.valorMisto ?? rows[0]!.valorDebito).toMatch(/471/);
  });

  it('não inclui data órfã na descrição quando colunas estão mapeadas', async () => {
    const { extractGenericRowsFromMapping } = await import('./parcelamentoColunasExtract');
    const imgWidth = 500;
    const imgHeight = 200;
    const columns = [
      { id: 'data', start: 0, end: 95, color: 'green' },
      { id: 'descricao', start: 100, end: 350, color: 'blue' },
      { id: 'valorMisto', start: 360, end: 500, color: 'orange' },
    ];
    const items = [
      { str: '02/02', x: 10, y: 80, w: 40, h: 12 },
      { str: '02/02', x: 102, y: 80, w: 40, h: 12 },
      { str: 'PIX RECEBIDO', x: 150, y: 80, w: 120, h: 12 },
      { str: '100,00', x: 400, y: 80, w: 60, h: 12 },
    ];
    const rows = extractGenericRowsFromMapping(items, { columns }, imgHeight, imgWidth, {
      dataColIds: ['data', 'descricao', 'valorMisto'],
      extratoPositional: true,
      statementYear: '2026',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.data).toMatch(/^02\/02/);
    expect(rows[0]!.descricao).toMatch(/PIX RECEBIDO/);
    expect(rows[0]!.descricao).not.toMatch(/02\/02/);
  });

  it('parseia linha com valor D colado e data dd/mm', async () => {
    const { extractGenericRowsFromMapping } = await import('./parcelamentoColunasExtract');
    const imgWidth = 920;
    const imgHeight = 1700;
    const columns = [
      { id: 'data', start: 0, end: 95, color: 'green' },
      { id: 'descricao', start: 100, end: 700, color: 'blue' },
      { id: 'valorMisto', start: 720, end: 920, color: 'orange' },
    ];
    const items = [
      { str: '06/02', x: 44, y: 74, w: 36, h: 14 },
      { str: 'PIX EMIT.OUTRA IF', x: 120, y: 74, w: 200, h: 14 },
      { str: '1.560,00D', x: 814, y: 74, w: 72, h: 14 },
    ];
    const rows = extractGenericRowsFromMapping(items, { columns }, imgHeight, imgWidth, {
      dataColIds: ['data', 'descricao', 'valorMisto'],
      extratoPositional: true,
      ocrFullText: 'SICOOB DATA HISTORICO VALOR',
      statementYear: '2026',
    });
    const hit = rows.find((r) => Math.abs(parseValorExtratoRow(r) - 1560) < 0.01);
    expect(hit, JSON.stringify(rows)).toBeTruthy();
    expect(hit!.data).toMatch(/^06\/02/);
  });
});

describe('clusterExtratoUmaLinhaPorValor', () => {
  it('extrai um lançamento por valor sem pular linhas consecutivas', async () => {
    const { extractGenericRowsFromMapping } = await import('./parcelamentoColunasExtract');
    const columns = [
      { id: 'data', start: 0, end: 100, color: 'green' },
      { id: 'descricao', start: 120, end: 400, color: 'blue' },
      { id: 'valorMisto', start: 420, end: 520, color: 'orange' },
    ];
    const items = [
      { str: '01/02/2026', x: 10, y: 100, w: 70, h: 12 },
      { str: 'PIX RECEBIDO', x: 140, y: 100, w: 100, h: 12 },
      { str: '100,00', x: 430, y: 100, w: 50, h: 12 },
      { str: '02/02/2026', x: 10, y: 118, w: 70, h: 12 },
      { str: 'TED ENVIADA', x: 140, y: 118, w: 100, h: 12 },
      { str: '250,50', x: 430, y: 118, w: 50, h: 12 },
      { str: '03/02/2026', x: 10, y: 136, w: 70, h: 12 },
      { str: 'TARIFA', x: 140, y: 136, w: 80, h: 12 },
      { str: '12,90', x: 430, y: 136, w: 50, h: 12 },
    ];
    const rows = extractGenericRowsFromMapping(items, { columns }, 200, 600, {
      dataColIds: ['data', 'descricao', 'valorMisto'],
      extratoPositional: true,
    });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.valorMisto || r.valorCredito || r.valorDebito).filter(Boolean)).toHaveLength(3);
  });
});

describe('extractGenericRowsFromMapping — histórico multilinha sem texto na linha do valor', () => {
  it('monta descrição a partir das linhas de continuação (Pagamento Pix, DOC)', async () => {
    const { extractGenericRowsFromMapping } = await import('./parcelamentoColunasExtract');
    const columns = [
      { id: 'data', start: 0, end: 100, color: 'green' },
      { id: 'descricao', start: 120, end: 400, color: 'blue' },
      { id: 'valorMisto', start: 420, end: 520, color: 'orange' },
    ];
    const items = [
      { str: '27/02', x: 10, y: 100, w: 40, h: 12 },
      { str: '7.999,54D', x: 430, y: 100, w: 70, h: 12 },
      { str: 'Pagamento Pix', x: 140, y: 118, w: 100, h: 12 },
      { str: 'DOC.: Pix', x: 140, y: 136, w: 80, h: 12 },
      { str: '28/02', x: 10, y: 160, w: 40, h: 12 },
      { str: 'PIX RECEBIDO', x: 140, y: 160, w: 100, h: 12 },
      { str: '500,00C', x: 430, y: 160, w: 60, h: 12 },
    ];
    const rows = extractGenericRowsFromMapping(items, { columns }, 200, 600, {
      dataColIds: ['data', 'descricao', 'valorMisto'],
      extratoPositional: true,
      statementYear: '2026',
    });
    const hit = rows.find((r) => Math.abs(parseValorExtratoRow(r) - 7999.54) < 0.01);
    expect(hit, JSON.stringify(rows)).toBeTruthy();
    expect(hit!.descricao?.trim()).toBeTruthy();
    expect(hit!.descricao).toMatch(/Pagamento Pix/i);
    expect(hit!.descricao).toMatch(/DOC/i);
  });
});

describe('splitExtratoOcrRowsPorLancamentosFundidos', () => {
  it('interpreta OCR colado 4,440,53D como valor único (sem 0,53 falso)', () => {
    const hits = scanValoresTextoLinhaExtrato('13/02 PIX EMIT.OUTRA IF 4,440,53D Pagamento Pix');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.value).toBeCloseTo(4440.53, 2);
    expect(hits[0]!.nature).toBe('D');
  });

  it('interpreta 4,958,99C como valor único', () => {
    const hits = scanValoresTextoLinhaExtrato('20/02 PIXRECEB.OUTRA IF 4,958,99C Recebimento Pix');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.value).toBeCloseTo(4958.99, 2);
    expect(hits[0]!.nature).toBe('C');
  });

  it('ignora valor repetido colado na mesma linha OCR', () => {
    const hits = scanValoresTextoLinhaExtrato('02/02 PIX EMIT 100,00D 100,00D Pagamento Pix');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.value).toBeCloseTo(100, 2);
  });

  it('divide linha com DOC.: Pix repetido em lançamentos separados', () => {
    const linha =
      'DOC. : Pix 06/02 PIX EMIT.OUTRA IF 1.560,00D Pagamento Pix 44,405.163 0001-20 MKT NFSE 41 e 43 DOC. : Pix 06/02 DB.TR.C.DIFTIT.INT 7.819,60D';
    const split = splitExtratoOcrRowsPorLancamentosFundidos([{ _linhaOcr: linha, data: '06/02/2026' }]);
    expect(split.length).toBeGreaterThanOrEqual(2);
    expect(parseValorExtratoRow(split[0]!)).toBeCloseTo(1560, 2);
    expect(parseValorExtratoRow(split[1]!)).toBeCloseTo(7819.6, 2);
  });

  it('ignora CNPJ após Pagamento Pix (44,405.163) como valor de lançamento', () => {
    const linha =
      '06/02 PIX EMIT.OUTRA IF 1.560,00D Pagamento Pix 44,405.163 0001-20 MKT NFSE DOC. : Pix 06/02 DB.TR 7.819,60D';
    const hits = scanValoresTextoLinhaExtrato(linha);
    const lanc = hits.filter((h) => h.hasNature);
    expect(lanc.some((h) => Math.abs(h.value - 1560) < 0.02)).toBe(true);
    expect(lanc.some((h) => Math.abs(h.value - 7819.6) < 0.02)).toBe(true);
    expect(lanc.some((h) => Math.abs(h.value - 10404.86) < 1)).toBe(false);
  });

  it('não confunde 7.010,00D dentro de 17.010,00D', () => {
    const hits = scanValoresTextoLinhaExtrato('PIX EMIT.OUTRA IF 17.010,00D Pagamento Pix').filter(
      (h) => h.hasNature,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]!.value).toBeCloseTo(17010, 2);
  });

  it('descarta SALDO DO DIA ao dividir linha fundida', () => {
    const linha =
      '06/02 PIX EMIT.OUTRA IF 500,00D DOC. : Pix 06/02 SALDO DO DIA 25.404,69D DOC. : Pix 06/02 PIX REC.OUTRA IF MT 50.000,00C';
    const split = splitExtratoOcrRowsPorLancamentosFundidos([{ _linhaOcr: linha, data: '06/02/2026' }]);
    expect(split.some((r) => valorColunaExtratoRow(r).includes('25.404'))).toBe(false);
    expect(split.some((r) => parseValorExtratoRow(r) > 49_000)).toBe(true);
  });

  it('recupera histórico PIX REC quando segmento ficou só com o valor', () => {
    const linha = '10/02 PIX REC.OUTRA IF MT 400.000,00C';
    const split = splitExtratoOcrRowsPorLancamentosFundidos([{ _linhaOcr: linha, data: '10/02/2026' }]);
    expect(split).toHaveLength(1);
    expect(split[0]!.descricao?.toUpperCase()).toMatch(/PIX\s+REC/);
  });

  it('divide linha com dois valores D na mesma faixa (2.009,66 e 17.010,00)', () => {
    const linha =
      '10/02 DÉB.TIT.COMPE.EFETI 2.009,66D DOC.: 1782721 PIX EMIT.OUTRA IF 17.010,00D Pagamento Pix 15.038.596 0001-96';
    const split = splitExtratoOcrRowsPorLancamentosFundidos([{ _linhaOcr: linha, data: '10/02/2026' }]);
    expect(split.length).toBe(2);
    expect(parseValorExtratoRow(split[0]!)).toBeCloseTo(2009.66, 2);
    expect(parseValorExtratoRow(split[1]!)).toBeCloseTo(17010, 2);
  });

  it('separa TAR PLANO de SALDO TOTAL DISPONÍVEL DIA fundidos (Bradesco)', () => {
    const linha =
      '02/04/2026 02/04/2026 - SALDO TOTAL DISPONÍVEL DIA - TAR PLANO ADAPT 103/26 -169,00 40.674,50';
    const split = splitExtratoOcrRowsPorLancamentosFundidos([{ _linhaOcr: linha, data: '02/04/2026' }]);
    expect(split).toHaveLength(1);
    expect(split[0]!.descricao?.toUpperCase()).toMatch(/TAR\s+PLANO/);
    expect(parseValorExtratoRow(split[0]!)).toBeCloseTo(169, 2);
    expect(split.some((r) => parseValorExtratoRow(r) > 40_000)).toBe(false);
  });

  it('separa SISPAG de SALDO TOTAL DISPONÍVEL DIA fundidos (Bradesco)', () => {
    const linha =
      '06/04/2026 06/04/2026 - SISPAG FORNECEDORES SANEAGO - SALDO TOTAL DISPONÍVEL DIA -207,16 319,93';
    const split = splitExtratoOcrRowsPorLancamentosFundidos([{ _linhaOcr: linha, data: '06/04/2026' }]);
    expect(split).toHaveLength(1);
    expect(split[0]!.descricao?.toUpperCase()).toMatch(/SISPAG/);
    expect(parseValorExtratoRow(split[0]!)).toBeCloseTo(207.16, 2);
  });

  it('recupera valor colado após SALDO TOTAL DISPONÍVEL DIA (Bradesco)', () => {
    const linha = '14/04/2026 14/04/2026 - SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85';
    const split = splitExtratoOcrRowsPorLancamentosFundidos([{ _linhaOcr: linha, data: '14/04/2026' }]);
    expect(split).toHaveLength(1);
    expect(parseValorExtratoRow(split[0]!)).toBeCloseTo(6905.92, 2);
  });

  it('anexa valor órfão pós-saldo ao lançamento anterior no pós-processamento (mesmo dia)', () => {
    const ignoreWords = parseOcrIgnoreLineWords('saldo anterior, saldo bloq, saldo do dia');
    const out = postProcessExtratoOcrRows(
      [
        {
          data: '14/04/2026',
          descricao: 'TED RECEBIDA OURINHOS',
          _linhaOcr: '14/04/2026 TED RECEBIDA OURINHOS',
        },
        {
          data: '14/04/2026',
          _linhaOcr: '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
        },
      ],
      '2026',
      { ignoreLineWords: ignoreWords },
    );
    expect(out).toHaveLength(1);
    expect(parseValorExtratoRow(out[0]!)).toBeCloseTo(6905.92, 2);
    expect(out[0]!.descricao?.toUpperCase()).toMatch(/TED/);
  });

  it('preserveSegmentRows: anexa valor da linha saldo à TED antes do split (Itaú 14/04)', () => {
    const ignoreWords = parseOcrIgnoreLineWords('saldo anterior, saldo bloq, saldo do dia');
    const out = postProcessExtratoOcrRows(
      [
        {
          data: '14/04/2026',
          descricao: 'TED RECEBIDA 104.0327.OURINHOS',
          _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS',
        },
        {
          data: '14/04/2026',
          descricao: 'SALDO TOTAL DISPONÍVEL DIA',
          valorCredito: '6.905,92',
          _linhaOcr: '14/04/2026 SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
        },
      ],
      '2026',
      { ignoreLineWords: ignoreWords, preserveSegmentRows: true },
    );
    expect(out).toHaveLength(1);
    expect(parseValorExtratoRow(out[0]!)).toBeCloseTo(6905.92, 2);
    expect(out[0]!.descricao?.toUpperCase()).toMatch(/TED/);
  });

  it('mantém linha só com valor para rejeição por histórico ausente na importação', () => {
    const row = {
      data: '27/02/2026',
      valorDebito: '7.999,54',
      _linhaOcr: '27/02/2026 7.999,54 D',
    };
    const split = splitExtratoOcrRowsPorLancamentosFundidos([row]);
    expect(split).toHaveLength(1);
    const out = postProcessExtratoOcrRows([row], '2026');
    expect(out).toHaveLength(1);
  });

  it('importa lançamento operacional após split no pós-processamento (saldo ignorado)', () => {
    const ignoreWords = parseOcrIgnoreLineWords('saldo anterior, saldo bloq, saldo do dia');
    const out = postProcessExtratoOcrRows(
      [
        {
          data: '02/04/2026',
          _linhaOcr:
            '02/04/2026 02/04/2026 - SALDO TOTAL DISPONÍVEL DIA - TAR PLANO ADAPT 103/26 -169,00 40.674,50',
        },
      ],
      '2026',
      { ignoreLineWords: ignoreWords },
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.descricao?.toUpperCase()).toMatch(/TAR\s+PLANO/);
    expect(extratoRowContemPalavraIgnorada(out[0]!, ignoreWords)).toBe(false);
  });

  it('postProcess CODE com travessão OCR (em dash) após SALDO', () => {
    const ignoreWords = parseOcrIgnoreLineWords('saldo anterior, saldo bloq, saldo do dia');
    const linha =
      '29/04/2026 29/04/2026 — SALDO TOTAL DISPONÍVEL DIA — CODE -23.266,10 26,51';
    expect(extratoLinhaSaldoTemValorLancamentoColado(linha)).toBe(true);
    const out = postProcessExtratoOcrRows(
      [{ data: '29/04/2026', _linhaOcr: linha }],
      '2026',
      { ignoreLineWords: ignoreWords },
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.descricao?.toUpperCase() ?? out[0]!._linhaOcr?.toUpperCase()).toMatch(/CODE/);
  });

  it('postProcess TAR com travessão OCR (em dash) igual ao extrato real', () => {
    const ignoreWords = parseOcrIgnoreLineWords('saldo anterior, saldo bloq, saldo do dia');
    const linha =
      '02/04/2026 02/04/2026 — SALDO TOTAL DISPONÍVEL DIA — TAR PLANO ADAPT 103/26 -169,00 40.674,50';
    const trimmed = trimExtratoOcrRowsToLancamentos([{ data: '02/04/2026', _linhaOcr: linha }]);
    expect(trimmed.length).toBeGreaterThan(0);
    const out = postProcessExtratoOcrRows(
      [{ data: '02/04/2026', _linhaOcr: linha }],
      '2026',
      { ignoreLineWords: ignoreWords },
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.descricao?.toUpperCase()).toMatch(/TAR\s+PLANO/);
  });

  it('separa todos os lançamentos Bradesco fundidos com SALDO (travessão OCR real)', async () => {
    const casos: Array<{
      linha: string;
      data: string;
      hist: RegExp;
      valor: number;
      nature?: 'D' | 'C';
    }> = [
      {
        linha:
          '02/04/2026 02/04/2026 — SALDO TOTAL DISPONÍVEL DIA — TAR PLANO ADAPT 103/26 -169,00 40.674,50',
        data: '02/04/2026',
        hist: /TAR\s+PLANO/i,
        valor: 169,
      },
      {
        linha:
          '06/04/2026 06/04/2026 — SISPAG FORNECEDORES SANEAGO — SALDO TOTAL DISPONÍVEL DIA -207,16 319,93',
        data: '06/04/2026',
        hist: /SISPAG/i,
        valor: 207.16,
      },
      {
        linha:
          '15/04/2026 15/04/2026 — SISPAG FORNECEDORES — SALDO TOTAL DISPONÍVEL DIA 17.225,00 -9.999,11',
        data: '15/04/2026',
        hist: /SISPAG/i,
        valor: 17225,
        nature: 'D' as const,
      },
      {
        linha:
          '16/04/2026 20/04/2026 — SALDO TOTAL DISPONÍVEL DIA — PAGAMENTOS TRIBCODBARRAS — GOIANIA-TESOURO 01.612.092/0001-23 -451,21 15.636,89',
        data: '20/04/2026',
        hist: /PAGAMENTOS?\s*TRIB|GOIANIA/i,
        valor: 451.21,
        nature: 'D' as const,
      },
      {
        linha:
          '20/04/2026 20/04/2026 — SISPAG FORNECEDORES — SALDO TOTAL DISPONÍVEL DIA -277,74 990,89',
        data: '20/04/2026',
        hist: /SISPAG/i,
        valor: 277.74,
      },
      {
        linha:
          '22/04/2026 22/04/2026 — TEDRECEBIDA 001.1441.S5P3FIS — SALDO TOTAL DISPONÍVEL DIA — SP350945FMS INVEST SUS 13.985.276/0001-18 1.768,52 2.759,39',
        data: '22/04/2026',
        hist: /TED|SP350945|INVEST/i,
        valor: 1768.52,
      },
      {
        linha:
          '23/04/2026 23/04/2026 — SISPAG FORNECEDORES PIX OR- — SALDO TOTAL DISPONÍVEL DIA CODE 5.697,93 61,49',
        data: '23/04/2026',
        hist: /SISPAG|CODE/i,
        valor: 5697.93,
        nature: 'D' as const,
      },
      {
        linha:
          '24/04/2026 24/04/2026 — SISPAG FORNECEDORES E GOIAS — SALDO TOTAL DISPONÍVEL DIA -543,22 5.044,98',
        data: '24/04/2026',
        hist: /SISPAG/i,
        valor: 543.22,
      },
      {
        linha: '29/04/2026 29/04/2026 — SALDO TOTAL DISPONÍVEL DIA — CODE -23.266,10 26,51',
        data: '29/04/2026',
        hist: /CODE/i,
        valor: 23266.1,
      },
    ];
    const ignoreWords = parseOcrIgnoreLineWords('saldo anterior, saldo bloq, saldo do dia');
    const { resolveExtratoValorNatureza } = await import('../contabilfacil/logic/ocrImportMapper');
    for (const c of casos) {
      const out = postProcessExtratoOcrRows(
        [{ data: c.data, _linhaOcr: c.linha }],
        '2026',
        { ignoreLineWords: ignoreWords },
      );
      expect(out).toHaveLength(1);
      expect(out[0]!.descricao?.toUpperCase() ?? out[0]!._linhaOcr?.toUpperCase()).toMatch(c.hist);
      expect(parseValorExtratoRow(out[0]!)).toBeCloseTo(c.valor, 1);
      if (c.data.includes('/')) {
        expect(out[0]!.data).toBe(c.data);
      }
      if (c.nature) {
        expect(resolveExtratoValorNatureza(out[0]!).nature).toBe(c.nature);
      }
      expect(extratoRowContemPalavraIgnorada(out[0]!, ignoreWords)).toBe(false);
    }
    const saldoPuro = postProcessExtratoOcrRows(
      [
        {
          data: '14/04/2026',
          _linhaOcr: '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
        },
      ],
      '2026',
      { ignoreLineWords: ignoreWords },
    );
    expect(saldoPuro).toHaveLength(1);
    expect(parseValorExtratoRow(saldoPuro[0]!)).toBeCloseTo(6905.92, 2);
    expect(saldoPuro[0]!._valorRecuperadoSaldo).toBe('1');
  }, 15_000);
});

describe('extractGenericRowsFromMapping - Fallback de Data Espacial', () => {
  it('recupera a data inicial no canto esquerdo da linha se ela nao foi mapeada ou esta vazia', async () => {
    const { extractGenericRowsFromMapping } = await import('./parcelamentoColunasExtract');

    // Mapeamento sem a coluna "data" (apenas "descricao" e "valorMisto")
    const columns = [
      { id: 'descricao', start: 300, end: 600, color: 'blue' },
      { id: 'valorMisto', start: 700, end: 900, color: 'orange' },
    ];
    const mapping = { columns };

    // Itens da linha do extrato
    // A data "01/04/2026" esta na regiao esquerda (x = 10, menor que 960 * 0.28 = 268.8)
    const items = [
      { str: '01/04/2026', x: 10, y: 100, w: 80, h: 12 },
      { str: 'LIQUIDACAO DE COBRANCA', x: 320, y: 100, w: 200, h: 12 },
      { str: '423,37', x: 750, y: 100, w: 60, h: 12 },
    ];

    const rows = extractGenericRowsFromMapping(items, mapping, 640, 960, {
      dataColIds: ['descricao', 'valorMisto'],
      headerKeywords: [],
      allowFaixaFallback: true,
      extratoPositional: true,
      statementYear: '2026',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].data).toBe('01/04/2026');
    expect(rows[0].descricao).toBe('LIQUIDACAO DE COBRANCA');
    const valor = rows[0].valorMisto || rows[0].valorCredito || rows[0].valorDebito;
    expect(valor).toBe('423,37');
  });
});

