import { describe, expect, it } from 'vitest';
import {
  inferSpedFiscalNatureza,
  parseSpedFiscalText,
  sanitizeParsedSpedFiscal,
  spedFiscalNaturezaLabel,
} from '../../extratoVision/utils/spedFiscalParser';

describe('spedFiscalNatureza', () => {
  it('impostos a recolher são credora', () => {
    expect(
      inferSpedFiscalNatureza({
        kind: 'imposto',
        registro: 'M205',
        codigo: '691201',
        descricao: 'PIS a recolher',
      }),
    ).toBe('credora');
    expect(spedFiscalNaturezaLabel('credora')).toBe('Crédito');
  });

  it('créditos ICMS e saldo credor são devedora (a recuperar)', () => {
    expect(
      inferSpedFiscalNatureza({
        kind: 'acumulador',
        registro: 'E110',
        codigo: 'E110-CRED',
        descricao: 'Total créditos ICMS (E110)',
      }),
    ).toBe('devedora');
    expect(
      inferSpedFiscalNatureza({
        kind: 'acumulador',
        registro: 'E110',
        codigo: 'E110-SLD-CRED',
        descricao: 'Saldo credor a transportar (E110)',
      }),
    ).toBe('devedora');
    expect(spedFiscalNaturezaLabel('devedora')).toBe('Débito');
  });

  it('total débitos ICMS é credora (a recolher)', () => {
    expect(
      inferSpedFiscalNatureza({
        kind: 'acumulador',
        registro: 'E110',
        codigo: 'E110-DEB',
        descricao: 'Total débitos ICMS (E110)',
      }),
    ).toBe('credora');
  });

  it('preenche natureza em dados legados via sanitize', () => {
    const parsed = sanitizeParsedSpedFiscal({
      tipo: 'CONTRIBUICOES',
      fileName: 'x.txt',
      cnpj: '',
      empresa: '',
      dtIni: '',
      dtFin: '',
      dtFinLabel: '—',
      issues: [],
      itens: [
        {
          kind: 'imposto',
          registro: 'M205',
          codigo: '1',
          descricao: 'PIS',
          imposto: 'PIS/Pasep',
          valor: 10,
          linha: 1,
          data: '31/12/2025',
        } as never,
      ],
    });
    expect(parsed.itens[0]!.natureza).toBe('credora');
  });

  it('parser atribui natureza nas linhas importadas', () => {
    const text = [
      '|0000|006|0|01122025|31122025|EMPRESA TESTE|',
      '|M200|0|0|0|0|0|0|0|2504,87|0|0|0|0|2504,87|',
      '|M205|0|0|691201|2504,87|',
    ].join('\n');
    const parsed = parseSpedFiscalText(text, 'sped.txt');
    const impostos = parsed.itens.filter((i) => i.kind === 'imposto');
    expect(impostos.length).toBeGreaterThan(0);
    expect(impostos.every((i) => i.natureza === 'credora')).toBe(true);
  });

  it('acumulador C190 entrada/compra é débito e saída/venda é crédito', () => {
    expect(
      inferSpedFiscalNatureza({
        kind: 'acumulador',
        registro: 'C190',
        codigo: '102-1102',
        descricao: 'CST 102 · CFOP 1102 · Compra',
        nome: 'Compra p/ comercialização',
      }),
    ).toBe('devedora');

    expect(
      inferSpedFiscalNatureza({
        kind: 'acumulador',
        registro: 'C190',
        codigo: '102-5102',
        descricao: 'CST 102 · CFOP 5102 · Venda',
        nome: 'Venda de mercadoria adquirida de terceiros',
      }),
    ).toBe('credora');
  });

  it('parser C190 aplica natureza por CFOP', () => {
    const text = [
      '|0000|006|0|01012026|31012026|EMPRESA|',
      '|E110|0|0|0|0|0|0|0|0|0|',
      '|C190|102|1102|0|1000,00|0|0|',
      '|C190|102|5102|0|2000,00|0|0|',
    ].join('\n');
    const parsed = parseSpedFiscalText(text, 'cfop.txt');
    const compra = parsed.itens.find((i) => i.codigo === '102-1102');
    const venda = parsed.itens.find((i) => i.codigo === '102-5102');
    expect(compra?.natureza).toBe('devedora');
    expect(venda?.natureza).toBe('credora');
  });
});
