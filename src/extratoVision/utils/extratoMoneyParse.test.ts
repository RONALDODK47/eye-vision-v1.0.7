import { describe, expect, it } from 'vitest';
import {
  moedaExtratoPlausivel,
  parseMoedaPtFromExtratoColuna,
  parseMoedaPtFromExtratoLinha,
  pickExtratoValorFromRowItems,
  pickExtratoValorFromColItems,
  extratoOcrTokenEhFalsoValorMonetario,
  parseExtratoNaturezaNoValor,
  parseExtratoNaturezaFromRowItems,
  resolveExtratoDebCredNature,
  resolveExtratoValorFromTexts,
  parseExtratoNaturezaIndicador,
  extratoValorIsNegative,
  parseExtratoMoneyValue,
  formatExtratoValorAssinadoPt,
  normalizeExtratoValorAssinadoToken,
} from './extratoMoneyParse';
import { resolveExtratoValorNatureza } from '../../contabilfacil/logic/ocrImportMapper';

describe('extratoMoneyParse', () => {
  it('rejeita nº documento colado ao valor', () => {
    expect(moedaExtratoPlausivel('9002939423,37')).toBe(0);
    expect(moedaExtratoPlausivel('11440882635,98')).toBe(0);
    expect(moedaExtratoPlausivel('265703293,04')).toBe(0);
    expect(moedaExtratoPlausivel('2.657.005,00')).toBe(0);
  });

  it('aceita valores típicos de extrato', () => {
    expect(moedaExtratoPlausivel('423,37')).toBeCloseTo(423.37);
    expect(moedaExtratoPlausivel('2.635,98')).toBeCloseTo(2635.98);
    expect(moedaExtratoPlausivel('(354,98)')).toBeCloseTo(354.98);
    expect(moedaExtratoPlausivel('210.476,89')).toBeCloseTo(210476.89);
  });

  it('parseMoedaPtFromExtratoColuna interpreta OCR colado 4,440,53D', () => {
    expect(parseMoedaPtFromExtratoColuna('4,440,53D')).toBeCloseTo(4440.53);
    expect(parseMoedaPtFromExtratoColuna('4,958,99C')).toBeCloseTo(4958.99);
  });

  it('parseExtratoMoneyValue com D/C colado usa valor integral (17.010,00D)', () => {
    expect(parseExtratoMoneyValue('17.010,00D')).toBeCloseTo(17010, 2);
    expect(parseExtratoMoneyValue('2.009,66D')).toBeCloseTo(2009.66, 2);
    expect(parseExtratoMoneyValue('1.560,00D')).toBeCloseTo(1560, 2);
  });

  it('extrai só o valor quando documento está na mesma coluna', () => {
    expect(parseMoedaPtFromExtratoColuna('9002939 423,37')).toBeCloseTo(423.37);
    expect(parseMoedaPtFromExtratoColuna('265703 293,04')).toBeCloseTo(293.04);
    expect(parseMoedaPtFromExtratoColuna('293,04 2.657.005,00')).toBeCloseTo(293.04);
  });

  it('na linha inteira pega o lançamento e não o saldo', () => {
    const linha = '01/04/2026 LIQUIDACAO 9002939 423,37 210.476,89';
    expect(parseMoedaPtFromExtratoLinha(linha)).toBeCloseTo(423.37);
  });

  it('prefere menor valor operacional quando há saldo colado na linha', () => {
    const row = [
      { str: '293,04', x: 280, w: 50 },
      { str: '2.657.005,00', x: 420, w: 70 },
    ];
    const pick = pickExtratoValorFromRowItems(row);
    expect(pick?.value).toBeCloseTo(293.04);
  });

  it('posicional ignora coluna saldo à direita', () => {
    const row = [
      { str: '423,37', x: 360, w: 50 },
      { str: '210.476,89', x: 520, w: 60 },
    ];
    const pick = pickExtratoValorFromRowItems(row);
    expect(pick?.value).toBeCloseTo(423.37);
  });

  it('não usa só saldo quando não há valor operacional', () => {
    const row = [{ str: '210.476,89', x: 520, w: 60 }];
    expect(pickExtratoValorFromRowItems(row)).toBeNull();
  });

  it('separa documento colado no mesmo token PDF', () => {
    const row = [{ str: '9002939423,37', x: 400, w: 80 }];
    const pick = pickExtratoValorFromRowItems(row);
    expect(pick?.value).toBeCloseTo(423.37);
  });

  it('normaliza valor com espaços entre dígitos (OCR)', () => {
    expect(parseMoedaPtFromExtratoColuna('210 053 , 52')).toBeCloseTo(210053.52);
    expect(parseMoedaPtFromExtratoColuna('4 2 3 , 3 7')).toBeCloseTo(423.37);
  });

  it('aceita débito com sinal negativo', () => {
    const row = [
      { str: '-60,80', x: 430, w: 40 },
      { str: '213.345,22', x: 520, w: 50 },
    ];
    const pick = pickExtratoValorFromRowItems(row);
    expect(pick?.value).toBeCloseTo(60.8);
    expect(pick?.negative).toBe(true);
  });

  it('coluna débito sem sinal de menos é crédito (sem «-» no token)', () => {
    const resolved = resolveExtratoValorFromTexts({ debito: '423,37' });
    expect(resolved?.value).toBeCloseTo(423.37);
    expect(resolved?.negative).toBe(false);
  });

  it('coluna crédito sem sinal é positiva', () => {
    const resolved = resolveExtratoValorFromTexts({ credito: '423,37' });
    expect(resolved?.value).toBeCloseTo(423.37);
    expect(resolved?.negative).toBe(false);
  });

  it('indicador D na coluna natureza sem sinal no valor não força débito', () => {
    const resolved = resolveExtratoValorFromTexts({
      credito: '423,37',
      natureza: 'D',
    });
    expect(resolved?.negative).toBe(false);
  });

  it('indicador C na coluna natureza torna valor positivo', () => {
    expect(parseExtratoNaturezaIndicador('C')).toBe('C');
    expect(parseExtratoNaturezaIndicador('D')).toBe('D');
    expect(extratoValorIsNegative({ texto: '100,00', natureza: 'D' })).toBe(false);
    expect(extratoValorIsNegative({ texto: '-100,00', natureza: 'C' })).toBe(true);
  });

  it('resolveExtratoValorNatureza: indicador D na coluna natureza sem sinal no valor → C', () => {
    const row = {
      valorCredito: '423,37',
      natureza: 'D',
      descricao: 'LIQUIDACAO',
    };
    const { value, nature } = resolveExtratoValorNatureza(row);
    expect(value).toBeCloseTo(423.37);
    expect(nature).toBe('C');
  });

  it('resolveExtratoValorNatureza: valor misto com D na coluna natureza sem sinal → C', () => {
    const row = {
      valorMisto: '2.635,08',
      natureza: 'D',
    };
    const { value, nature } = resolveExtratoValorNatureza(row);
    expect(value).toBeCloseTo(2635.08);
    expect(nature).toBe('C');
  });

  it('parseExtratoNaturezaNoValor detecta D/C colado e ignora separado', () => {
    expect(parseExtratoNaturezaNoValor('5.809,74D')).toBe('D');
    expect(parseExtratoNaturezaNoValor('423,37 C')).toBeNull();
    expect(parseExtratoNaturezaNoValor('100,00 D')).toBeNull();
  });

  it('parseExtratoNaturezaFromRowItems ignora D separado após valor', () => {
    const row = [
      { str: '5.809,74', x: 400, w: 60 },
      { str: 'D', x: 470, w: 10 },
    ];
    expect(parseExtratoNaturezaFromRowItems(row)).toBeNull();
  });

  it('parseExtratoNaturezaFromRowItems lê D colado no token anterior', () => {
    const row = [{ str: '5.809,74D', x: 400, w: 70 }];
    expect(parseExtratoNaturezaFromRowItems(row)).toBe('D');
  });

  it('pickExtratoValorFromColItems ignora D separado à direita da coluna', () => {
    const row = [
      { str: '423,37', x: 400, w: 50 },
      { str: 'D', x: 455, w: 10 },
      { str: '210.476,89', x: 520, w: 60 },
    ];
    const col = { start: 380, end: 460 };
    const pick = pickExtratoValorFromColItems(row, col, 600);
    expect(pick?.value).toBeCloseTo(423.37);
    expect(pick?.nature).toBe('C');
    expect(pick?.negative).toBe(false);
  });

  it('pickExtratoValorFromColItems detecta débito com sinal negativo na coluna mista', () => {
    const row = [
      { str: 'SISPAG FORNECEDORES', x: 120, w: 160 },
      { str: '-17.225,00', x: 400, w: 80 },
    ];
    const col = { start: 350, end: 500 };
    const pick = pickExtratoValorFromColItems(row, col, 600);
    expect(pick?.value).toBeCloseTo(17225);
    expect(pick?.nature).toBe('D');
    expect(pick?.negative).toBe(true);
  });

  it('pickExtratoValorFromColItems detecta crédito positivo na coluna mista', () => {
    const row = [
      { str: 'PIX RECEBIDO', x: 120, w: 120 },
      { str: '500,00', x: 400, w: 60 },
    ];
    const col = { start: 350, end: 500 };
    const pick = pickExtratoValorFromColItems(row, col, 600);
    expect(pick?.value).toBeCloseTo(500);
    expect(pick?.negative).toBe(false);
  });

  it('pickExtratoValorFromColItems aceita zero na coluna valor', () => {
    const row = [{ str: '0,00D', x: 400, w: 60 }];
    const col = { start: 350, end: 500 };
    const pick = pickExtratoValorFromColItems(row, col, 600);
    expect(pick?.value).toBe(0);
    expect(pick?.nature).toBe('D');
  });

  it('pickExtratoValorFromColItems rejeita CNPJ colado como valor', () => {
    const row = [{ str: '44.405.163/0001-20', x: 400, w: 120 }];
    const col = { start: 350, end: 520 };
    expect(pickExtratoValorFromColItems(row, col, 600)).toBeNull();
    expect(extratoOcrTokenEhFalsoValorMonetario('44.405.163/0001-20')).toBe(true);
  });

  it('resolveExtratoDebCredNature usa sinal negativo na coluna misto', () => {
    expect(
      resolveExtratoDebCredNature({
        valorTexto: '-17.225,00',
        imgWidth: 600,
      }),
    ).toBe('D');
  });

  it('resolveExtratoDebCredNature: sem sinal no token → C mesmo na coluna débito', () => {
    const debCol = { start: 380, end: 460 };
    const nature = resolveExtratoDebCredNature({
      valorTexto: '423,37',
      valorDebitoCol: debCol,
      pickCx: 425,
      imgWidth: 600,
    });
    expect(nature).toBe('C');
  });

  it('resolveExtratoValorNatureza: valor misto com sufixo D colado', () => {
    const row = { valorMisto: '5.809,74D' };
    const { value, nature } = resolveExtratoValorNatureza(row);
    expect(value).toBeCloseTo(5809.74);
    expect(nature).toBe('D');
  });

  it('resolveExtratoValorNatureza: valor misto com sinal negativo', () => {
    const row = { valorMisto: '-17.225,00', descricao: 'SISPAG FORNECEDORES' };
    const { value, nature } = resolveExtratoValorNatureza(row);
    expect(value).toBeCloseTo(17225);
    expect(nature).toBe('D');
  });

  it('resolveExtratoValorNatureza: coluna débito sem sufixo D/C → D (extrato genérico)', () => {
    const row = { valorDebito: '423,37', valorCredito: '' };
    const { value, nature } = resolveExtratoValorNatureza(row);
    expect(value).toBeCloseTo(423.37);
    expect(nature).toBe('D');
  });

  it('resolveExtratoValorNatureza: BB com sufixo D separado → débito', () => {
    const row = {
      valorDebito: '105,13 D',
      valorCredito: '',
      descricao: 'Pix Enviado',
      _linhaOcr: '04/05/2026 0000 Pix Enviado 105,13 D',
    };
    const { value, nature } = resolveExtratoValorNatureza(row);
    expect(value).toBeCloseTo(105.13);
    expect(nature).toBe('D');
  });

  it('resolveExtratoValorNatureza: BB com sufixo C separado → crédito', () => {
    const row = {
      valorCredito: '21.000,00 C',
      valorDebito: '',
      descricao: 'Transferência recebida',
    };
    const { value, nature } = resolveExtratoValorNatureza(row);
    expect(value).toBeCloseTo(21000);
    expect(nature).toBe('C');
  });

  it('normalizeExtratoValorAssinadoToken: coluna débito sem sinal permanece crédito', () => {
    expect(normalizeExtratoValorAssinadoToken('89.117,60', { coluna: 'debito', natureza: 'D' })).toBe(
      '89.117,60',
    );
  });

  it('formatExtratoValorAssinadoPt — padrão Bradesco (verde/vermelho na UI)', () => {
    expect(formatExtratoValorAssinadoPt(44558.8, 'C')).toBe('44.558,80');
    expect(formatExtratoValorAssinadoPt(1534, 'D')).toBe('-1.534,00');
    expect(formatExtratoValorAssinadoPt(37498.09, 'D')).toBe('-37.498,09');
    expect(normalizeExtratoValorAssinadoToken('-543,22')).toBe('-543,22');
    expect(normalizeExtratoValorAssinadoToken('1534,00D')).toBe('-1.534,00');
    expect(normalizeExtratoValorAssinadoToken('1.534,00 D')).toBe('-1.534,00');
  });
});
