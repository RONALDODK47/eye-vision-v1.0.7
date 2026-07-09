import { describe, expect, it, vi } from 'vitest';
import {
  collectValoresDaLinhaExtrato,
  extractValorNaturezaDaLinhaExtrato,
  mapOcrRowsToImportItems,
  summarizeExtratoImportLog,
  formatExtratoImportLogAsTsv,
  filterExtratoImportLogEntradasVisiveis,
  filterExtratoSkippedSemHistoricoResolvido,
  logExtratoImportDiagnosticToConsole,
} from '../logic/ocrImportMapper';

describe('filterExtratoImportLogEntradasVisiveis', () => {
  it('mantém só rejeitado e sem_historico', () => {
    const filtered = filterExtratoImportLogEntradasVisiveis([
      { line: 1, preview: 'a', reason: 'ignorado', category: 'rejeitado' },
      { line: 2, preview: 'b', reason: 'sem TED', category: 'sem_historico' },
      { line: 3, preview: 'c', reason: 'ajuste', category: 'historico_ajustado', severity: 'warning' },
      { line: 4, preview: 'd', reason: 'valor', category: 'valor_divergente' },
      { line: 5, preview: 'e', reason: 'data', category: 'data_herdada', severity: 'warning' },
    ]);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.category)).toEqual(['rejeitado', 'sem_historico']);
  });
});

describe('logExtratoImportDiagnosticToConsole', () => {
  it('emite resumo e TSV sem lançar', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const group = vi.spyOn(console, 'group').mockImplementation(() => {});
    const groupCollapsed = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    const groupEnd = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    logExtratoImportDiagnosticToConsole({
      rawRows: [{ data: '14/04/2026', _linhaOcr: '14/04/2026 6.905,92', valorMisto: '6.905,92' }],
      items: [{ date: '2026-04-14', value: 6905.92, nature: 'C', description: 'TED RECEBIDA' }],
      skipped: [
        {
          line: 8,
          severity: 'warning',
          category: 'sem_historico',
          reason: 'Valor colado ao saldo',
          preview: '14/04/2026 6.905,92',
        },
      ],
      saldoAnteriorDetectado: 40844.13,
      fileName: 'extrato.pdf',
    });
    expect(group.mock.calls.length + groupCollapsed.mock.calls.length).toBeGreaterThan(0);
    expect(info.mock.calls.some((c) => String(c[0]).includes('Resumo'))).toBe(true);
    expect(info.mock.calls.some((c) => String(c[0]).includes('TSV'))).toBe(true);
    info.mockRestore();
    group.mockRestore();
    groupCollapsed.mockRestore();
    groupEnd.mockRestore();
  });
});

describe('formatExtratoImportLogAsTsv', () => {
  it('gera cabeçalho e linhas separadas por tab', () => {
    const tsv = formatExtratoImportLogAsTsv([
      {
        line: 8,
        lineOcr: 8,
        phase: 'audit_ocr',
        severity: 'warning',
        category: 'sem_historico',
        reason: 'Valor colado ao saldo',
        preview: '14/04/2026 6.905,92',
      },
    ]);
    const lines = tsv.split('\n');
    expect(lines[0]).toContain('Linha OCR');
    expect(lines[0]).toContain('Linha import');
    expect(lines[0]).toContain('Fase');
    expect(lines[1]).toContain('8');
    expect(lines[1]).toContain('6.905,92');
  });
});

describe('extractValorNaturezaDaLinhaExtrato', () => {
  it('lê valor e D/C colados na linha do extrato', () => {
    expect(extractValorNaturezaDaLinhaExtrato('27/02/2026 PIX EMIT 7.999,54D')).toEqual({
      value: 7999.54,
      nature: 'D',
    });
    expect(extractValorNaturezaDaLinhaExtrato('01/03 TED 500,00 C')).toEqual({
      value: 500,
      nature: 'C',
    });
  });

  it('ignora valor de referência PIX após Pagamento Pix (***,329,781-**)', () => {
    expect(
      extractValorNaturezaDaLinhaExtrato(
        '03/02 PIX EMIT.OUTRA IF 4.551,80D Pagamento Pix ***,329,781-** frete cama Diego',
      ),
    ).toEqual({ value: 4551.8, nature: 'D' });
    expect(
      extractValorNaturezaDaLinhaExtrato('04/02 PIXEMIT.OUTRA IF 300,00D Pagamento Pix ***,338,401-**'),
    ).toEqual({ value: 300, nature: 'D' });
  });

  it('interpreta OCR colado 4,440,53D como 4.440,53', () => {
    expect(
      extractValorNaturezaDaLinhaExtrato('13/02 PIX EMIT.OUTRA IF 4,440,53D Pagamento Pix NFSE'),
    ).toEqual({ value: 4440.53, nature: 'D' });
    expect(
      extractValorNaturezaDaLinhaExtrato('20/02 PIXRECEB.OUTRA IF 4,958,99C Recebimento Pix RFB'),
    ).toEqual({ value: 4958.99, nature: 'C' });
  });

  it('collectValoresDaLinhaExtrato lista valores na ordem da linha', () => {
    expect(collectValoresDaLinhaExtrato('27/02/2026 PIX ENVIADO 7.999,54D')).toEqual([
      expect.objectContaining({ value: 7999.54, nature: 'D' }),
    ]);
  });

  it('não trata «C» de CODE como indicador de crédito (Itaú SISPAG)', () => {
    const linha = '23/04/2026 SISPAG FORNECEDORES PIX OR- 5.697,93 CODE';
    expect(collectValoresDaLinhaExtrato(linha)).toEqual([]);
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [{ data: '23/04/2026', _linhaOcr: linha, valorMisto: '5.697,93' }],
      { ignoreLineWords: ['saldo anterior', 'saldo bloq', 'saldo do dia'], extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 5697.93) < 0.05 && i.nature === 'D')).toBe(true);
    expect(skipped.some((e) => e.category === 'valor_divergente' || e.category === 'natureza_divergente')).toBe(
      false,
    );
  });

  it('em linha com vários lançamentos, usa hint para auditar valor correto', () => {
    const linha =
      'DOC. : Pix 06/02 PIX EMIT.OUTRA IF 1.560,00D Pagamento Pix DOC. : Pix 06/02 DB.TR.C.DIFTIT.INT 7.819,60D';
    expect(extractValorNaturezaDaLinhaExtrato(linha, { value: 1560, nature: 'D' })).toEqual({
      value: 1560,
      nature: 'D',
    });
    expect(extractValorNaturezaDaLinhaExtrato(linha, { value: 7819.6, nature: 'D' })).toEqual({
      value: 7819.6,
      nature: 'D',
    });
  });

  it('BB: prefere valor do lançamento e não o saldo trailing (corrige centavos)', () => {
    const linha = '01/04/2026 Pix - Recebido 33.081.298 390,52 C 1.234,56 D';
    expect(extractValorNaturezaDaLinhaExtrato(linha, { value: 390.44, nature: 'C' })).toEqual({
      value: 390.52,
      nature: 'C',
    });
    expect(extractValorNaturezaDaLinhaExtrato(linha)).toEqual({
      value: 390.52,
      nature: 'C',
    });
  });
});

describe('mapOcrRowsToImportItems — log de inconsistências', () => {
  it('registra rejeição por histórico ausente', () => {
    const { items, skipped } = mapOcrRowsToImportItems('extrato', [
      {
        data: '27/02/2026',
        valorDebito: '7.999,54',
        _linhaOcr: '27/02/2026 7.999,54 D',
      },
    ]);
    expect(items).toHaveLength(0);
    expect(skipped.some((e) => e.category === 'sem_historico')).toBe(true);
    expect(summarizeExtratoImportLog(skipped).errors).toBeGreaterThan(0);
  });

  it('corrige valor da coluna a partir da linha OCR no pós-processamento', () => {
    const { items, skipped } = mapOcrRowsToImportItems('extrato', [
      {
        data: '27/02/2026',
        descricao: 'PIX ENVIADO',
        valorDebito: '1.600,00',
        _linhaOcr: '27/02/2026 PIX ENVIADO 7.999,54D',
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.value).toBeCloseTo(7999.54, 2);
    expect(
      skipped.some(
        (e) =>
          e.category === 'valor_divergente' ||
          e.category === 'pos_processamento' ||
          e.category === 'interpretacao',
      ),
    ).toBe(false);
  });

  it('registra alerta quando histórico foi reconstruído da linha OCR', () => {
    const { items, skipped } = mapOcrRowsToImportItems('extrato', [
      {
        data: '27/02/2026',
        valorDebito: '7.999,54',
        _linhaOcr: '27/02/2026 Pagamento Pix 7.999,54 D',
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.description).toMatch(/PAGAMENTO PIX/i);
    expect(skipped.some((e) => e.category === 'historico_ajustado' && e.severity === 'warning')).toBe(
      true,
    );
  });

  it('unifica colunas débito/crédito conflitantes no pós-processamento Itaú', () => {
    const { items, skipped } = mapOcrRowsToImportItems('extrato', [
      {
        data: '01/02/2026',
        descricao: 'TARIFA',
        valorDebito: '29,90',
        valorCredito: '100,00',
        _linhaOcr: '01/02/2026 TARIFA 29,90 D',
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.value).toBeCloseTo(29.9, 2);
    expect(skipped.some((e) => e.category === 'valor_ambiguo')).toBe(false);
  });

  it('importa DB.TR e TRANSF PIX SICOOB com histórico reconhecido', () => {
    const { items, skipped } = mapOcrRowsToImportItems('extrato', [
      {
        data: '06/02/2026',
        valorDebito: '4.833,33',
        _linhaOcr:
          '06/02 DB.TR.C.DIFTIT.INT 4.833,33D FAV.: FRANCISCO DE ASSIS ESTEVES Transferência Pix FERTILIZANTES ORGANO BURITIS LTDA 18.797.405 0001-68',
      },
      {
        data: '27/02/2026',
        valorDebito: '7.999,54',
        _linhaOcr:
          '27/02 TRANSF. PIX SICOOB 7.999,54D FAV.: AUTO POSTO LIMA & SANTOS LTDA Transferência Pix FERTILIZANTES ORGANO BURITIS LTDA 18.797.405 0001-68',
      },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]!.description).toMatch(/DB\.TR/i);
    expect(items[1]!.description).toMatch(/TRANSF\.?\s*PIX\s+SICOOB/i);
    expect(skipped.some((e) => e.category === 'sem_historico')).toBe(false);
  });

  it('não acusa divergência quando coluna bate com valor principal da linha (PIX ref ignorada)', () => {
    const { skipped } = mapOcrRowsToImportItems('extrato', [
      {
        data: '03/02/2026',
        descricao: 'PIX EMIT.OUTRA IF',
        valorDebito: '4.551,80',
        _linhaOcr: '03/02 PIX EMIT.OUTRA IF 4.551,80D Pagamento Pix ***,329,781-** frete',
      },
    ]);
    expect(skipped.some((e) => e.category === 'valor_divergente')).toBe(false);
  });

  it('registra valor no histórico quando coluna Descrição é monetária', () => {
    const { items, skipped } = mapOcrRowsToImportItems('extrato', [
      {
        data: '10/06/2026',
        descricao: '1.176,66 D',
        valorDebito: '1.176,66',
        _linhaOcr: '10/06/2026 PIX 1.176,66D',
      },
    ]);
    expect(items).toHaveLength(1);
    expect(skipped.some((e) => e.category === 'valor_no_historico')).toBe(false);
  });

  it('registra valor obtido da descrição ou divergência quando coluna de valor está vazia', () => {
    const { items, skipped } = mapOcrRowsToImportItems('extrato', [
      {
        data: '10/06/2026',
        descricao: 'PIX ENVIADO 1.176,66 D',
        _linhaOcr: '10/06/2026 PIX ENVIADO 1.176,66 D',
      },
    ]);
    expect(items).toHaveLength(1);
    expect(
      skipped.some(
        (e) =>
          e.category === 'valor_da_descricao' ||
          e.category === 'valor_divergente' ||
          e.category === 'valor_no_historico',
      ),
    ).toBe(true);
  });

  it('divide linha OCR com vários valores em lançamentos separados (sem valor pulado)', () => {
    const { items, skipped } = mapOcrRowsToImportItems('extrato', [
      {
        data: '06/02/2026',
        descricao: 'PIX EMIT',
        valorDebito: '1.560,00',
        _linhaOcr:
          'DOC. : Pix 06/02 PIX EMIT.OUTRA IF 1.560,00D Pagamento Pix DOC. : Pix 06/02 DB.TR.C.DIFTIT.INT 7.819,60D',
      },
    ]);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(skipped.some((e) => e.category === 'valor_pulado')).toBe(false);
  });

  it('rejeita SALDO DO DIA sem histórico operacional', () => {
    const { items, skipped } = mapOcrRowsToImportItems('extrato', [
      {
        data: '06/02/2026',
        valorDebito: '25.404,69',
        _linhaOcr: '06/02 SALDO DO DIA 25.404,69D',
      },
    ]);
    expect(items.length).toBe(0);
    expect(skipped.some((e) => e.category === 'sem_historico')).toBe(false);
    expect(skipped.some((e) => e.category === 'rejeitado')).toBe(false);
  });

  it('recupera valor colado após SALDO TOTAL DISPONÍVEL DIA no audit (sem rejeitar linha fundida)', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const saldoColado = {
      data: '14/04/2026',
      _linhaOcr: '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
    };
    const ted = {
      data: '14/04/2026',
      descricao: 'TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL',
      valorCredito: '6.905,92',
      _linhaOcr:
        '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL 54.710.595/0001-06 6.905,92',
    };
    const tedSemValor = {
      data: '14/04/2026',
      descricao: 'TED RECEBIDA OURINHOS CAMARA MUNICIPAL',
      _linhaOcr: '14/04/2026 TED RECEBIDA OURINHOS CAMARA MUNICIPAL',
    };
    const comTed = mapOcrRowsToImportItems('extrato', [ted, saldoColado], { ignoreLineWords });
    expect(comTed.items.some((it) => Math.abs(it.value - 6905.92) < 0.05)).toBe(true);
    expect(comTed.skipped.some((e) => e.category === 'rejeitado')).toBe(false);
    expect(comTed.skipped.some((e) => e.category === 'sem_historico' && e.severity === 'warning')).toBe(
      false,
    );

    const comTedSemValor = mapOcrRowsToImportItems('extrato', [tedSemValor, saldoColado], {
      ignoreLineWords,
    });
    expect(comTedSemValor.items.some((it) => Math.abs(it.value - 6905.92) < 0.05)).toBe(true);
    expect(comTedSemValor.skipped.some((e) => e.category === 'rejeitado')).toBe(false);

    const soSaldo = mapOcrRowsToImportItems('extrato', [saldoColado], { ignoreLineWords });
    expect(soSaldo.items.length).toBe(0);
    expect(soSaldo.skipped.some((e) => e.category === 'sem_historico' && e.severity === 'warning')).toBe(
      true,
    );

    const saldoPuro = mapOcrRowsToImportItems(
      'extrato',
      [{ data: '14/04/2026', _linhaOcr: '14/04/2026 SALDO TOTAL DISPONÍVEL DIA 7.225,85' }],
      { ignoreLineWords },
    );
    expect(saldoPuro.items.length).toBe(0);
    expect(saldoPuro.skipped.some((e) => e.category === 'rejeitado')).toBe(false);
  });

  it('loga saldo colado já pós-processado (preserveSegmentRows) no modal de inconsistências', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '14/04/2026',
          valorCredito: '6.905,92',
          _linhaOcr: '14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
          _extratoPosProcessado: '1',
        },
      ],
      { ignoreLineWords },
    );
    expect(items.length).toBe(0);
    expect(skipped.some((e) => e.category === 'sem_historico' && e.severity === 'warning')).toBe(true);
    expect(summarizeExtratoImportLog(skipped).warnings).toBeGreaterThan(0);
  });

  it('anexa valor de linha saldo ao TED anterior (não importa como SALDO TOTAL)', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '14/04/2026',
          descricao: 'TED RECEBIDA OURINHOS CAMARA MUNICIPAL',
          _linhaOcr: '14/04/2026 TED RECEBIDA OURINHOS CAMARA MUNICIPAL',
          _extratoPosProcessado: '1',
        },
        {
          data: '14/04/2026',
          descricao: 'SALDO TOTAL DISPONÍVEL DIA',
          valorCredito: '6.905,92',
          _linhaOcr: '14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
          _extratoPosProcessado: '1',
        },
      ],
      { ignoreLineWords },
    );
    expect(items.some((it) => Math.abs(it.value - 6905.92) < 0.05)).toBe(true);
    expect(items.some((it) => /SALDO\s+TOTAL/i.test(it.description))).toBe(false);
    expect(skipped.some((e) => e.category === 'sem_historico' && e.severity === 'warning')).toBe(false);
  });

  it('anexa valor colado ao TED multilinha Itaú (14/04 OURINHOS)', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '14/04/2026',
          descricao: 'TED RECEBIDA 104.0327.OURINHOS',
          _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS',
          _extratoPosProcessado: '1',
        },
        {
          data: '14/04/2026',
          descricao: 'OURINHOS CAMARA MUNICIPAL',
          _linhaOcr: 'C OURINHOS CAMARA MUNICIPAL 54.710.595/0001-06',
          _extratoPosProcessado: '1',
        },
        {
          data: '14/04/2026',
          descricao: 'SALDO TOTAL DISPONÍVEL DIA',
          _linhaOcr: '14/04/2026 14/04/2026 SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
          _extratoPosProcessado: '1',
        },
      ],
      { ignoreLineWords },
    );
    expect(items.some((it) => Math.abs(it.value - 6905.92) < 0.05)).toBe(true);
    expect(items.some((it) => /TED\s*RECEBIDA|OURINHOS/i.test(it.description))).toBe(true);
    expect(items.some((it) => /SALDO\s+TOTAL/i.test(it.description))).toBe(false);
    expect(skipped.some((e) => e.category === 'sem_historico' && e.severity === 'warning')).toBe(false);
  });

  it('importa PIX REC quando histórico está na linha OCR', () => {
    const { items, skipped } = mapOcrRowsToImportItems('extrato', [
      {
        data: '10/02/2026',
        valorCredito: '400.000,00',
        _linhaOcr: '10/02 PIX REC.OUTRA IF MT 400.000,00C',
      },
    ]);
    expect(items.length).toBe(1);
    expect(items[0]!.value).toBeCloseTo(400_000, 2);
    expect(skipped.some((e) => e.category === 'sem_historico')).toBe(false);
  });

  it('corrige coluna 25.404,69 errada quando linha OCR indica 1.560,00', () => {
    const linha =
      'DOC. : Pix 06/02 PIX EMIT.OUTRA IF 1.560,00D Pagamento Pix 44,405.163 0001-20 MKT NFSE 41 e 43 DOC. : Pix 06/02 DB.TR.C.DIFTIT.INT 7.819,60D';
    const { items, skipped } = mapOcrRowsToImportItems('extrato', [
      {
        data: '06/02/2026',
        descricao: 'PIX EMIT',
        valorDebito: '25.404,69',
        _linhaOcr: linha,
      },
    ]);
    expect(items.some((it) => Math.abs(it.value - 1560) < 0.02)).toBe(true);
    expect(items.some((it) => Math.abs(it.value - 25404.69) < 0.02)).toBe(false);
    expect(skipped.some((e) => e.category === 'valor_divergente')).toBe(false);
  });

  it('divide lançamentos fundidos na mesma linha OCR em itens separados', () => {
    const linha =
      'DOC. : Pix 06/02 PIX EMIT.OUTRA IF 1.560,00D Pagamento Pix 44,405.163 0001-20 MKT NFSE 41 e 43 DOC. : Pix 06/02 DB.TR.C.DIFTIT.INT 7.819,60D';
    const { items, skipped } = mapOcrRowsToImportItems('extrato', [
      {
        data: '06/02/2026',
        descricao: 'PIX EMIT',
        valorDebito: '1.560,00',
        _linhaOcr: linha,
      },
    ]);
    expect(items.length).toBeGreaterThanOrEqual(2);
    const valores = items.map((it) => it.value).sort((a, b) => a - b);
    expect(valores[0]).toBeCloseTo(1560, 2);
    expect(valores.some((v) => Math.abs(v - 7819.6) < 0.02)).toBe(true);
  });

  it('corrige valor secundário quando linha fundida é dividida automaticamente', () => {
    const { items } = mapOcrRowsToImportItems('extrato', [
      {
        data: '06/02/2026',
        descricao: 'DB.TR',
        valorDebito: '7.819,60',
        _linhaOcr:
          'DOC. : Pix 06/02 PIX EMIT.OUTRA IF 1.560,00D Pagamento Pix DOC. : Pix 06/02 DB.TR.C.DIFTIT.INT 7.819,60D',
      },
    ]);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.some((it) => Math.abs(it.value - 1560) < 0.02)).toBe(true);
    expect(items.some((it) => Math.abs(it.value - 7819.6) < 0.02)).toBe(true);
  });

  it('importa CODE Itaú -23.266,10 como débito (não fantasma de saldo)', () => {
    const { items } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '29/04/2026',
          descricao: 'CODE',
          valorMisto: '-23.266,10',
          _linhaOcr: '29/04/2026 29/04/2026 CODE -23.266,10 26,51',
          _extratoPosProcessado: '1',
        },
      ],
      { extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 23266.1) < 0.05 && i.nature === 'D')).toBe(true);
  });

  it('importa TED CAMARA 25.636 como crédito quando valor positivo na coluna Valor', () => {
    const { items } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '16/04/2026',
          descricao: 'DE P FUND CAMARA MUN. DE VEREADORES',
          valorMisto: '25.636,00',
          _linhaOcr:
            '16/04/2026 TED 041.0310.CAMARA M D DE P FUND CAMARA MUN. DE VEREADORES 04.763.273/0001-49 25.636,00',
          _extratoPosProcessado: '1',
        },
      ],
      { extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 25636) < 0.05 && i.nature === 'C')).toBe(true);
  });

  it('importa CODE mesmo após linha MINACU com SALDO TOTAL no histórico', () => {
    const { items } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '29/04/2026',
          descricao: 'RECEBIMENTOS MUNICIPIO DE MINACU SALDO TOTAL DISPONÍVEL',
          valorMisto: '3.068,22',
          _linhaOcr:
            '30/04/2026 29/04/2026 RECEBIMENTOS MUNICIPIO DE MINACU 02.215.275/0001-78 3.068,22',
          _extratoPosProcessado: '1',
        },
        {
          data: '29/04/2026',
          descricao: 'CODE',
          valorMisto: '-23.266,10',
          _linhaOcr: '29/04/2026 29/04/2026 CODE -23.266,10 26,51',
          _extratoPosProcessado: '1',
        },
      ],
      { extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 23266.1) < 0.05 && i.nature === 'D')).toBe(true);
  });

  it('importa CODE com origem SALDO TOTAL quando valor está na coluna Valor (Itaú)', () => {
    const { items } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '29/04/2026',
          descricao: 'CODE',
          valorMisto: '-23.266,10',
          _linhaOcr: '29/04/2026 29/04/2026 CODE -23.266,10 26,51',
          _linhaOcrSaldoOrigem:
            '29/04/2026 29/04/2026 — SALDO TOTAL DISPONÍVEL DIA — CODE -23.266,10 26,51',
          _extratoPosProcessado: '1',
        },
      ],
      { extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 23266.1) < 0.05 && i.nature === 'D')).toBe(true);
  });

  it('Itaú abr/2026 UI: TAR usa histórico da linha OCR (não RENDIMENTOS anterior)', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '02/04/2026',
          descricao: 'RENDIMENTOS',
          valorMisto: '0,02',
          _linhaOcr: '02/04/2026 AUT MAIS RENDIMENTOS REND PAGO APLIC 0,02',
          _extratoPosProcessado: '1',
        },
        {
          data: '02/04/2026',
          valorMisto: '-169,00',
          _linhaOcr: '02/04/2026 02/04/2026 — TAR PLANO ADAPT 103/26 -169,00',
          _extratoPosProcessado: '1',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    const tar = items.find((i) => Math.abs(i.value - 169) < 0.05);
    expect(tar).toBeDefined();
    expect(tar!.description).toMatch(/TAR\s+PLANO/i);
    expect(tar!.description).not.toMatch(/RENDIMENTOS/i);
  });

  it('Itaú abr/2026 log UI: TED só no raw L7 — injeta e pareia 6.905,92', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL',
        },
        {
          _linhaOcr: '14/04/2026 14/04/2026 6.905,92',
        },
        {
          _linhaOcr:
            '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(skipped.some((e) => e.category === 'sem_historico' && /6\.905/.test(e.preview ?? ''))).toBe(
      false,
    );
  });

  it('filterExtratoSkippedSemHistoricoResolvido remove falso positivo', () => {
    const filtered = filterExtratoSkippedSemHistoricoResolvido(
      [{ date: '2026-04-14', value: 6905.92, nature: 'C', description: 'TED OURINHOS' }],
      [
        {
          line: 8,
          lineOcr: 8,
          phase: 'audit_ocr',
          preview: '14/04/2026 6.905,92',
          reason: 'sem hist',
          category: 'sem_historico',
        },
        {
          line: 2,
          preview: 'IOF',
          reason: 'hist',
          category: 'historico_ajustado',
          severity: 'warning',
        },
      ],
    );
    expect(filtered.some((e) => e.category === 'sem_historico')).toBe(false);
    expect(filtered.some((e) => e.category === 'historico_ajustado')).toBe(true);
  });

  it('Itaú abr/2026 log UI linhas 8-9: TED L7 col saldo errada + órfã + saldo colado', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL',
          valorMisto: '7.225,85',
        },
        {
          data: '14/04/2026',
          _linhaOcr: '14/04/2026 14/04/2026 6.905,92',
          _valorRecuperadoSaldo: '1',
        },
        {
          _linhaOcr:
            '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 7225.85) < 0.05)).toBe(false);
    expect(skipped.some((e) => e.category === 'sem_historico' && /6\.905/.test(e.preview ?? ''))).toBe(
      false,
    );
  });

  it('Itaú abr/2026 UI: log linhas 8-9 — TED sem descricao + órfã + saldo colado (modal real)', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL',
        },
        {
          _linhaOcr: '14/04/2026 14/04/2026 6.905,92',
        },
        {
          _linhaOcr:
            '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(skipped.some((e) => e.category === 'sem_historico' && /6\.905/.test(e.preview ?? ''))).toBe(
      false,
    );
  });

  it('Itaú abr/2026 UI: linha órfã 6.905,92 anexa ao TED posterior (valor antes do histórico)', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '14/04/2026',
          valorMisto: '6.905,92',
          _linhaOcr: '14/04/2026 14/04/2026 6.905,92',
          _extratoPosProcessado: '1',
        },
        {
          data: '14/04/2026',
          descricao: 'TED RECEBIDA OURINHOS',
          _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL',
          _extratoPosProcessado: '1',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(skipped.some((e) => e.category === 'sem_historico' && /6\.905/.test(e.preview ?? ''))).toBe(
      false,
    );
  });

  it('Itaú abr/2026 UI: linha órfã 6.905,92 anexa ao TED anterior (sem sem_historico)', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '14/04/2026',
          descricao: 'TED RECEBIDA OURINHOS',
          _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL',
          _extratoPosProcessado: '1',
        },
        {
          data: '14/04/2026',
          valorMisto: '6.905,92',
          _linhaOcr: '14/04/2026 14/04/2026 6.905,92',
          _extratoPosProcessado: '1',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(skipped.some((e) => e.category === 'sem_historico' && /6\.905/.test(e.preview ?? ''))).toBe(
      false,
    );
  });

  it('Itaú abr/2026: TED com saldo 7.225,85 na coluna + órfã 6.905,92 — linhas brutas modal', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '14/04/2026',
          descricao: 'TED RECEBIDA OURINHOS',
          valorMisto: '7.225,85',
          _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL',
        },
        {
          data: '14/04/2026',
          _linhaOcr: '14/04/2026 14/04/2026 6.905,92',
        },
        {
          data: '14/04/2026',
          _linhaOcr:
            '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 7225.85) < 0.05)).toBe(false);
    expect(skipped.some((e) => e.category === 'sem_historico' && /6\.905/.test(e.preview ?? ''))).toBe(
      false,
    );
  });

  it('Itaú abr/2026: órfã 6.905,92 corrige TED com saldo 7.225,85 na coluna valor', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '14/04/2026',
          descricao: 'TED RECEBIDA OURINHOS',
          valorMisto: '7.225,85',
          _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL',
          _extratoPosProcessado: '1',
        },
        {
          data: '14/04/2026',
          valorMisto: '6.905,92',
          _linhaOcr: '14/04/2026 14/04/2026 6.905,92',
          _valorRecuperadoSaldo: '1',
          _extratoPosProcessado: '1',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 7225.85) < 0.05)).toBe(false);
    expect(skipped.some((e) => e.category === 'sem_historico' && /6\.905/.test(e.preview ?? ''))).toBe(
      false,
    );
  });

  it('Itaú abr/2026: OCR real — TED+valor na mesma linha (OURINHOS 6.905,92)', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '14/04/2026',
          _linhaOcr:
            '14/04/2026 OURINHOS CAMARA MUNICIPAL 54.710.595/0001-06 6.905,92',
        },
        {
          data: '14/04/2026',
          _linhaOcr: '14/04/2026 SALDO TOTAL DISPONÍVEL DIA 7.225,85',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(skipped.some((e) => e.category === 'sem_historico' && /6\.905/.test(e.preview ?? ''))).toBe(
      false,
    );
  });

  it('Itaú abr/2026: órfã 6.905,92 só _linhaOcr (como extractGenericRows) + saldo colado', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '14/04/2026',
          descricao: 'TED RECEBIDA OURINHOS',
          _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL',
        },
        {
          data: '14/04/2026',
          _linhaOcr: '14/04/2026 14/04/2026 6.905,92',
        },
        {
          data: '14/04/2026',
          _linhaOcr:
            '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(skipped.some((e) => e.category === 'sem_historico' && /6\.905/.test(e.preview ?? ''))).toBe(
      false,
    );
  });

  it('Itaú abr/2026: órfã 6.905,92 + saldo colado — linhas brutas do modal (sem _extratoPosProcessado)', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '14/04/2026',
          descricao: 'TED RECEBIDA OURINHOS',
          _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL',
        },
        {
          data: '14/04/2026',
          valorMisto: '6.905,92',
          _linhaOcr: '14/04/2026 14/04/2026 6.905,92',
        },
        {
          data: '14/04/2026',
          _linhaOcr:
            '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(skipped.some((e) => e.category === 'sem_historico' && /6\.905/.test(e.preview ?? ''))).toBe(
      false,
    );
  });

  it('Itaú abr/2026: TED sem valor + só saldo colado (sem linha órfã intermediária)', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL',
        },
        {
          _linhaOcr:
            '14/04/2026 14/04/2026 — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(items.some((i) => Math.abs(i.value - 7225.85) < 0.05)).toBe(false);
    expect(skipped.some((e) => e.category === 'sem_historico' && /6\.905/.test(e.preview ?? ''))).toBe(
      false,
    );
  });

  it('Itaú abr/2026: TED colado na mesma linha do saldo (OCR linha 9)', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          _linhaOcr:
            '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL — SALDO TOTAL DISPONÍVEL DIA 6.905,92 7.225,85',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(skipped.some((e) => e.category === 'sem_historico' && /6\.905/.test(e.preview ?? ''))).toBe(
      false,
    );
  });

  it('Itaú abr/2026: órfã 6.905,92 encontra TED no raw OCR (data só na linha OCR)', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          _linhaOcr: '14/04/2026 TED RECEBIDA 104.0327.OURINHOS OURINHOS CAMARA MUNICIPAL',
          _extratoPosProcessado: '1',
        },
        {
          data: '14/04/2026',
          valorMisto: '6.905,92',
          _linhaOcr: '14/04/2026 14/04/2026 6.905,92',
          _valorRecuperadoSaldo: '1',
          _extratoPosProcessado: '1',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(skipped.some((e) => e.category === 'sem_historico' && /6\.905/.test(e.preview ?? ''))).toBe(
      false,
    );
  });

  it('Itaú abr/2026: importa TED RIBEIRAO 1.030,00 antes do saldo final (30/04)', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '30/04/2026',
          descricao: 'RECEBIMENTOS MUNICIPIO DE MINACU',
          valorMisto: '3.068,22',
          _linhaOcr:
            '30/04/2026 RECEBIMENTOS MUNICIPIO DE MINACU 02.215.275/0001-78 3.068,22',
          _extratoPosProcessado: '1',
        },
        {
          _linhaOcr:
            '30/04/2026 TED RECEBIDA 001.0652.RIBEIRAO P RIBEIRAO PINHAL CAM VER 1.030,00',
          _extratoPosProcessado: '1',
        },
        {
          data: '30/04/2026',
          _linhaOcr: '30/04/2026 SALDO TOTAL DISPONÍVEL EM 4.124,73',
          _extratoPosProcessado: '1',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 1030) < 0.05 && i.nature === 'C')).toBe(true);
    expect(items.some((i) => /RIBEIRAO|PINHAL/i.test(i.description))).toBe(true);
    expect(skipped.some((e) => e.category === 'sem_historico' && /1\.030/.test(e.preview ?? ''))).toBe(
      false,
    );
  });

  it('Itaú abr/2026 UI: SISPAG/CODE usa histórico da linha (não RENDIMENTOS anterior)', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '23/04/2026',
          descricao: 'RENDIMENTOS',
          valorMisto: '0,01',
          _linhaOcr: '23/04/2026 AUT MAIS RENDIMENTOS REND PAGO APLIC 0,01',
          _extratoPosProcessado: '1',
        },
        {
          data: '23/04/2026',
          valorMisto: '-5.697,93',
          _linhaOcr: '23/04/2026 23/04/2026 — SISPAG FORNECEDORES PIX OR CODE 5.697,93',
          _extratoPosProcessado: '1',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    const sispag = items.find((i) => Math.abs(i.value - 5697.93) < 0.05);
    expect(sispag?.description).toMatch(/SISPAG|CODE/i);
    expect(sispag?.description).not.toMatch(/^RENDIMENTOS$/i);
  });

  it('Itaú abr/2026 UI: órfã 6.905,92 sem TED no OCR importa com fallback (linha 8)', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items, skipped } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '14/04/2026',
          valorMisto: '6.905,92',
          _linhaOcr: '14/04/2026 14/04/2026 6.905,92',
          _extratoPosProcessado: '1',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 6905.92) < 0.05 && i.nature === 'C')).toBe(true);
    expect(skipped.some((e) => e.category === 'sem_historico' && /6\.905/.test(e.preview ?? ''))).toBe(
      false,
    );
    expect(skipped.some((e) => e.category === 'historico_ajustado')).toBe(true);
  });

  it('Itaú abr/2026: recupera TED RIBEIRAO 1.030 do raw quando sumiu do pós-processamento', () => {
    const ignoreLineWords = ['saldo anterior', 'saldo bloq', 'saldo do dia'];
    const { items } = mapOcrRowsToImportItems(
      'extrato',
      [
        {
          data: '30/04/2026',
          descricao: 'RECEBIMENTOS MUNICIPIO DE MINACU',
          valorMisto: '3.068,22',
          _linhaOcr:
            '30/04/2026 RECEBIMENTOS MUNICIPIO DE MINACU 02.215.275/0001-78 3.068,22',
          _extratoPosProcessado: '1',
        },
        {
          _linhaOcr:
            '30/04/2026 TED RECEBIDA 001.0652.RIBEIRAO P RIBEIRAO PINHAL CAM VER 1.030,00',
        },
        {
          data: '30/04/2026',
          _linhaOcr: '30/04/2026 SALDO TOTAL DISPONÍVEL EM 4.124,73',
          _extratoPosProcessado: '1',
        },
      ],
      { ignoreLineWords, extratoPreserveSegmentRows: true },
    );
    expect(items.some((i) => Math.abs(i.value - 1030) < 0.05 && i.nature === 'C')).toBe(true);
    expect(items.some((i) => /RIBEIRAO|PINHAL/i.test(i.description))).toBe(true);
  });
});
