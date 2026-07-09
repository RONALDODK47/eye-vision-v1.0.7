import { describe, expect, it } from 'vitest';
import { parseExtratoMoneyValue } from '../../extratoVision/utils/extratoMoneyParse';
import {
  extratoNaturezaExplicitaNoRow,
  resolveExtratoValorNatureza,
} from './ocrImportMapper';

describe('extratoNatureza D/C', () => {
  const itauOpts = { perfilItau: true };
  const genericoOpts = { perfilItau: false };

  it('valor na coluna débito sem sinal negativo → C (Itaú)', () => {
    const r = resolveExtratoValorNatureza(
      {
      data: '02/04/2026',
      descricao: 'TED',
      valorDebito: '1.000,00',
      valorCredito: '',
      valorMisto: '',
      _linhaOcr: '02/04/2026 TED 1.000,00',
    },
      itauOpts,
    );
    expect(r.nature).toBe('C');
    expect(r.value).toBeCloseTo(1000, 0);
  });

  it('coluna débito sem sinal em extrato genérico → D', () => {
    const r = resolveExtratoValorNatureza(
      {
        data: '02/04/2026',
        descricao: 'PAGAMENTO FORNECEDOR',
        valorDebito: '1.000,00',
        valorCredito: '',
        valorMisto: '',
        _linhaOcr: '02/04/2026 PAGAMENTO FORNECEDOR 1.000,00',
      },
      genericoOpts,
    );
    expect(r.nature).toBe('D');
  });

  it('coluna crédito em extrato genérico → C', () => {
    const r = resolveExtratoValorNatureza(
      {
        descricao: 'PIX RECEBIDO',
        valorCredito: '500,00',
        valorDebito: '',
        _linhaOcr: '03/04/2026 PIX RECEBIDO 500,00',
      },
      genericoOpts,
    );
    expect(r.nature).toBe('C');
  });

  it('coluna crédito → C', () => {
    const r = resolveExtratoValorNatureza({
      descricao: 'PIX RECEBIDO',
      valorCredito: '500,00',
      valorDebito: '',
      _linhaOcr: '03/04/2026 PIX RECEBIDO 500,00 C',
    });
    expect(r.nature).toBe('C');
  });

  it('D separado na linha OCR (não colado ao valor) → C (Itaú)', () => {
    const r = extratoNaturezaExplicitaNoRow(
      {
      valorMisto: '2.500,00',
      _linhaOcr: '10/04/2026 SISPAG FORN 2.500,00 D',
    },
      itauOpts,
    );
    expect(r?.nature).toBe('C');
  });

  it('valor negativo → D', () => {
    const r = extratoNaturezaExplicitaNoRow({
      valorMisto: '-150,00',
      _linhaOcr: '10/04/2026 TAR -150,00',
    });
    expect(r?.nature).toBe('D');
  });

  it('positivo sem sufixo → D no Itaú quando histórico é SISPAG', () => {
    const r = resolveExtratoValorNatureza(
      {
        valorMisto: '2.500,00',
        descricao: 'SISPAG FORNECEDORES',
        _linhaOcr: '10/04/2026 SISPAG FORN 2.500,00',
      },
      itauOpts,
    );
    expect(r.nature).toBe('D');
    expect(r.value).toBeCloseTo(2500, 0);
  });

  it('positivo sem sufixo → C no Itaú quando histórico é RENDIMENTOS', () => {
    const r = resolveExtratoValorNatureza(
      {
        valorMisto: '0,02',
        descricao: 'RENDIMENTOS',
        _linhaOcr: '02/04/2026 RENDIMENTOS 0,02',
      },
      itauOpts,
    );
    expect(r.nature).toBe('C');
  });

  it('IOF positivo sem sufixo → D (Itaú)', () => {
    const r = resolveExtratoValorNatureza({
      valorMisto: '0,65',
      descricao: 'IOF',
      _linhaOcr: '02/04/2026 IOF 0,65',
    });
    expect(r.nature).toBe('D');
  });

  it('sufixo D colado no valor misto', () => {
    const r = extratoNaturezaExplicitaNoRow({
      valorMisto: '5.809,74D',
      _linhaOcr: '10/04/2026 PAGAMENTO 5.809,74D',
    });
    expect(r?.nature).toBe('D');
  });

  it('TED genérico na coluna débito sem sinal → C (Itaú)', () => {
    const r = resolveExtratoValorNatureza(
      {
      valorDebito: '3.000,00',
      valorCredito: '',
      valorMisto: '',
      descricao: 'TED',
      _linhaOcr: '03/04/2026 TED 3.000,00',
    },
      itauOpts,
    );
    expect(r.nature).toBe('C');
  });

  it('TED RECEBIDA na coluna débito com D espúrio no OCR → C (Itaú)', () => {
    const r = resolveExtratoValorNatureza(
      {
      data: '29/04/2026',
      descricao: 'D',
      valorDebito: '89.117,60',
      valorCredito: '',
      _linhaOcr:
        'TEDRECEBIDA001.0140.MUNICIPIO 29/04/2026 MUNICIPIODEFOZDOIGUACU 76.206.606/0001-40 89.117,60 D',
    },
      itauOpts,
    );
    expect(r.nature).toBe('C');
    expect(r.value).toBeCloseTo(89117.6, 0);
  });

  it('IA visão: TED RECEBIDA 001.0140.MUNICIPIO D na coluna débito → C', () => {
    const r = resolveExtratoValorNatureza({
      data: '29/04/2026',
      descricao: 'TED RECEBIDA 001.0140.MUNICIPIO D',
      valorDebito: '89.117,60',
      valorCredito: '',
      natureza: 'D',
      _extratoAiExtract: '1',
    });
    expect(r.nature).toBe('C');
    expect(r.value).toBeCloseTo(89117.6, 0);
  });

  it('SISPAG negativo permanece D', () => {
    const r = resolveExtratoValorNatureza({
      data: '23/04/2026',
      valorMisto: '-5.697,93',
      _linhaOcr:
        '23/04/2026 23/04/2026 — SISPAG FORNECEDORES PIX OR- — SALDO TOTAL DISPONÍVEL DIA CODE 5.697,93 61,49',
    });
    expect(r.nature).toBe('D');
  });

  it('SISPAG -17.225 permanece D (não confunde com TED CAMARA)', () => {
    const r = resolveExtratoValorNatureza({
      data: '15/04/2026',
      descricao: 'SISPAG FORNECEDORES',
      valorMisto: '-17.225,00',
      _linhaOcr: '15/04/2026 SISPAG FORNECEDORES 17.225,00',
    });
    expect(r.nature).toBe('D');
  });

  it('BB: valor só na coluna crédito mas linha OCR com sufixo D → débito', () => {
    const r = resolveExtratoValorNatureza({
      valorCredito: '105,13',
      valorDebito: '',
      descricao: 'Pix Enviado',
      _linhaOcr: '04/05/2026 0000 Pix Enviado 105,13 D',
    });
    expect(r.nature).toBe('D');
    expect(r.value).toBeCloseTo(105.13);
  });

  it('BB: valor misto sem sufixo mas histórico Pix Enviado → débito', () => {
    const r = resolveExtratoValorNatureza({
      valorMisto: '79,99',
      valorDebito: '',
      valorCredito: '',
      descricao: 'Pix - Enviado TELEFONICA BRAS',
      _linhaOcr: '07/05/2026 0000 Pix - Enviado TELEFONICA BRAS 79,99',
    });
    expect(r.nature).toBe('D');
  });

  it('BB: Pagamento de Boleto sem sufixo D/C na coluna → débito', () => {
    const r = resolveExtratoValorNatureza({
      valorCredito: '13.105,25',
      valorDebito: '',
      descricao: 'Pagamento de Boleto',
      _linhaOcr: '05/05/2026 0000 Pagamento de Boleto 13.105,25',
    });
    expect(r.nature).toBe('D');
  });

  it('sanitize não inverte SISPAG negativo após pós-processamento', async () => {
    const { postProcessExtratoOcrRows, parseOcrIgnoreLineWords } = await import(
      '../../lib/ocrExtratoPositional'
    );
    const ignoreLineWords = parseOcrIgnoreLineWords('saldo anterior, saldo bloq, saldo do dia, saldo');
    const raw = [
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
    const out = postProcessExtratoOcrRows(raw, '2026', {
      ignoreLineWords,
      preserveSegmentRows: true,
    });
    for (const row of out) {
      const v =
        parseExtratoMoneyValue(row.valorMisto ?? '') ||
        parseExtratoMoneyValue(row.valorDebito ?? '') ||
        parseExtratoMoneyValue(row.valorCredito ?? '');
      if (Math.abs(v - 17225) < 1) {
        const { nature } = resolveExtratoValorNatureza(row);
        expect(nature).toBe('D');
      }
    }
  });
});
