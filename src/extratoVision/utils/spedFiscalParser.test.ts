import { describe, expect, it } from 'vitest';
import {
  dedupeSpedFiscalItens,
  extractSpedDateFromFields,
  formatSpedPeriodoLabel,
  parseSpedFiscalText,
  sanitizeParsedSpedFiscal,
  type SpedFiscalItem,
} from './spedFiscalParser';

describe('spedFiscalParser', () => {
  it('prioriza M205/M605 e omite M200/M600 duplicados', () => {
    const text = [
      '|0000|006|0|01122025|31122025|EMPRESA TESTE|',
      '|M200|0|0|0|0|0|0|0|2504,87|0|0|0|0|2504,87|',
      '|M205|0|0|691201|2504,87|',
      '|M600|0|0|0|0|0|0|0|11532,88|0|0|0|0|11532,88|',
      '|M605|0|0|585601|11532,88|',
    ].join('\n');

    const parsed = parseSpedFiscalText(text, 'sped.txt');
    expect(parsed.tipo).toBe('CONTRIBUICOES');
    const regs = parsed.itens.map((i) => i.registro);
    expect(regs).not.toContain('M200');
    expect(regs).not.toContain('M600');
    expect(regs.filter((r) => r === 'M205')).toHaveLength(1);
    expect(regs.filter((r) => r === 'M605')).toHaveLength(1);

    const credito = parsed.itens
      .filter((i) => i.kind === 'imposto')
      .reduce((s, i) => s + i.valor, 0);
    expect(credito).toBeCloseTo(2504.87 + 11532.88, 2);
  });

  it('dedupe remove importação antiga com M200+M205 e M200-PIS-NC', () => {
    const legado: SpedFiscalItem[] = [
      {
        kind: 'imposto',
        registro: 'M200',
        codigo: 'M200-PIS-REC',
        descricao: 'Consolidação',
        imposto: 'PIS/Pasep',
        valor: 2504.87,
        linha: 61,
        data: '31/12/2025',
      },
      {
        kind: 'acumulador',
        registro: 'M200',
        codigo: 'M200-PIS-NC',
        descricao: 'NC',
        imposto: 'PIS/Pasep',
        valor: 2504.87,
        linha: 61,
        data: '31/12/2025',
      },
      {
        kind: 'imposto',
        registro: 'M205',
        codigo: '691201',
        descricao: 'Detalhe',
        imposto: 'PIS/Pasep',
        valor: 2504.87,
        linha: 62,
        data: '31/12/2025',
      },
      {
        kind: 'imposto',
        registro: 'M600',
        codigo: 'M600-COFINS-REC',
        descricao: 'COFINS',
        imposto: 'COFINS',
        valor: 11532.88,
        linha: 66,
        data: '31/12/2025',
      },
      {
        kind: 'imposto',
        registro: 'M605',
        codigo: '585601',
        descricao: 'COFINS det',
        imposto: 'COFINS',
        valor: 11532.88,
        linha: 67,
        data: '31/12/2025',
      },
    ];
    const limpo = dedupeSpedFiscalItens(legado);
    expect(limpo.map((i) => i.registro)).toEqual(['M205', 'M605']);
  });

  it('formata período e extrai vencimento E116', () => {
    expect(formatSpedPeriodoLabel('01122025', '31122025')).toBe('01/12/2025 — 31/12/2025');
    expect(extractSpedDateFromFields(['', 'E116', '001', '1500,00', '15012026'], 'E116')).toBe(
      '15/01/2026',
    );
  });

  it('extrai ICMS a recolher do E116 (campo VL_OR)', () => {
    const text = [
      '|0000|006|0|01012026|31012026|EMPRESA|',
      '|E110|1000,00|800,00|200,00|0|0|0|0|0|0|',
      '|E116|001|200,00|15022026|063-2|',
      '|C190|103|6923|0|5000,00|0|0|',
    ].join('\n');
    const parsed = parseSpedFiscalText(text, 'icms.txt');
    const impostos = parsed.itens.filter((i) => i.kind === 'imposto');
    expect(impostos.some((i) => i.registro === 'E116' && i.valor === 200)).toBe(true);
    const c190 = parsed.itens.find((i) => i.registro === 'C190' && i.kind === 'acumulador');
    expect(c190?.nome).toBeTruthy();
    expect(c190?.nome?.toLowerCase()).toMatch(/saída|outra/);
    expect(c190?.codigo).toContain('6923');
    expect(c190?.imposto).toBe('Simples Nacional');
  });

  it('não usa receita C190 como imposto Simples Nacional', () => {
    const text = [
      '|0000|006|0|01012026|31012026|EMPRESA SN|',
      '|E110|0|0|0|0|0|0|0|0|0|',
      '|C190|102|5102|0|15000,00|0|0|',
      '|C190|102|6102|0|8500,50|0|0|',
    ].join('\n');
    const parsed = parseSpedFiscalText(text, 'sn.txt');
    const sn = parsed.itens.filter(
      (i) => i.kind === 'imposto' && i.imposto === 'Simples Nacional',
    );
    expect(sn.length).toBe(0);
    const acum = parsed.itens.filter((i) => i.registro === 'C190' && i.kind === 'acumulador');
    expect(acum.length).toBe(2);
  });

  it('imposto Simples Nacional só com tributo destacado no C190', () => {
    const text = [
      '|0000|006|0|01012026|31012026|EMPRESA SN|',
      '|E110|0|0|0|0|0|0|0|0|0|',
      '|C190|201|5405|0|10000,00|5000,00|180,00|0|45,00|',
    ].join('\n');
    const parsed = parseSpedFiscalText(text, 'sn-trib.txt');
    const sn = parsed.itens.filter(
      (i) => i.kind === 'imposto' && i.imposto === 'Simples Nacional',
    );
    expect(sn.length).toBe(1);
    expect(sn[0]?.valor).toBeCloseTo(225, 2);
    expect(sn[0]?.codigo).toBe('SN-TRIB');
  });

  it('remove SN-BASE legado ao sanitizar', () => {
    const parsed = sanitizeParsedSpedFiscal({
      tipo: 'ICMS_IPI',
      fileName: 'legado.txt',
      cnpj: '',
      empresa: '',
      dtIni: '01012026',
      dtFin: '31012026',
      dtFinLabel: '31/01/2026',
      issues: [],
      itens: [
        {
          kind: 'imposto',
          registro: 'C190',
          codigo: 'SN-BASE',
          nome: 'Simples Nacional — receita no período (CSOSN)',
          descricao: 'Base operacional',
          imposto: 'Simples Nacional',
          valor: 337554.78,
          linha: 0,
          data: '31/01/2026',
          natureza: 'credora',
        },
      ],
    });
    expect(parsed.itens.filter((i) => i.kind === 'imposto')).toHaveLength(0);
  });

  it('enriquece C190 antigo sem campo nome ao sanitizar', () => {
    const parsed = sanitizeParsedSpedFiscal({
      tipo: 'ICMS_IPI',
      fileName: 'legado.txt',
      cnpj: '',
      empresa: '',
      dtIni: '01012026',
      dtFin: '31012026',
      dtFinLabel: '31/01/2026',
      issues: [],
      itens: [
        {
          kind: 'acumulador',
          registro: 'C190',
          codigo: '103-6120',
          descricao: 'CST 103 · CFOP 6120 · Alíq 0',
          imposto: 'ICMS',
          valor: 100,
          linha: 10,
          data: '01/01/2026 — 31/01/2026',
          natureza: 'devedora',
        },
      ],
    });
    expect(parsed.itens[0]?.nome?.toLowerCase()).toMatch(/venda|substituição/);
  });
});
