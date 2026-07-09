import { describe, expect, it } from 'vitest';
import { fixOcrHistoricoLine, fixOcrTokenForExtrato, prepararItensOcrParaExtrato } from './ocrExtratoTokenFix';

describe('ocrExtratoTokenFix', () => {
  it('corrige O→0 em datas', () => {
    expect(fixOcrTokenForExtrato('01/O4/2026')).toBe('01/04/2026');
  });

  it('preserva valor negativo de débito', () => {
    expect(fixOcrTokenForExtrato('-60,80')).toBe('-60,80');
  });

  it('corrige palavras comuns de histórico', () => {
    expect(fixOcrHistoricoLine('TÍTOOCNNNOS')).toContain('TITULOS');
    expect(fixOcrHistoricoLine('UT MAIS RENDIMENTOS')).toContain('AUT MAIS');
  });

  it('prepararItensOcrParaExtrato descarta ruído de baixa confiança e mantém valores', () => {
    const items = [
      { str: '100,00D', confidence: 25 },
      { str: 'xxx', confidence: 10 },
      { str: '02/02', confidence: 15 },
    ];
    const out = prepararItensOcrParaExtrato(items);
    expect(out.map((i) => i.str)).toEqual(['100,00D', '02/02']);
  });

  it('une sinal negativo isolado ao valor na mesma linha', () => {
    const items = [
      { str: '-', x: 400, y: 100, w: 8, h: 12 },
      { str: '100,00', x: 412, y: 100, w: 50, h: 12 },
      { str: '01/05/2026', x: 20, y: 100, w: 70, h: 12 },
    ];
    const out = prepararItensOcrParaExtrato(items);
    expect(out.some((i) => i.str === '-100,00')).toBe(true);
  });

  it('corrige SISPAGI e TEDI RECEBIDA', () => {
    expect(fixOcrHistoricoLine('SISPAGI FORNECEDORES')).toContain('SISPAG');
    expect(fixOcrHistoricoLine('TEDI RECEBIDA 0 41.SP3FIS')).toContain('TED RECEB');
  });

  it('une dígitos fragmentados 45 + 1,21 → 451,21', () => {
    const items = [
      { str: '-45', x: 380, y: 200, w: 22, h: 12 },
      { str: '1,21', x: 408, y: 200, w: 36, h: 12 },
      { str: '20/04', x: 20, y: 200, w: 40, h: 12 },
    ];
    const out = prepararItensOcrParaExtrato(items);
    expect(out.some((i) => i.str === '-451,21')).toBe(true);
  });
});
