import { describe, expect, it } from 'vitest';
import type { VisionBalanceteRow, VisionPlanoRow } from '../../extratoVision/types/accounting';
import { buildPeriodosMensaisEntreDatas, montarComparativoMensal } from '../../extratoVision/utils/balanceteComparativoMensal';
import { normalizeRazaoImport } from '../logic/contabilPipeline';
import {
  extrairPeriodoRazao,
  filtrarRazaoAntesDe,
  filtrarRazaoPorPeriodo,
  montarBalanceteComPeriodo,
  parseDataRazao,
} from '../../extratoVision/utils/razaoContabil';
import {
  buildRazaoTimeIndex,
  sliceRazaoIndexByPeriod,
  sliceRazaoIndexBefore,
} from '../../extratoVision/utils/razaoTimeIndex';

const planoMinimo: VisionPlanoRow[] = [
  { codigo: '1.1.1.01', nome: 'CAIXA', tipo: 'A', codigoReduzido: '101' },
  { codigo: '2.1.1.01', nome: 'FORNECEDORES', tipo: 'A', codigoReduzido: '201' },
];

function lanc(
  partial: Partial<VisionBalanceteRow> & Pick<VisionBalanceteRow, 'data' | 'debito' | 'credito'>,
): VisionBalanceteRow {
  return {
    codigo: partial.codigo ?? '101',
    classificacao: partial.classificacao ?? '1.1.1.01',
    nome: partial.nome ?? 'CAIXA',
    saldoInicial: partial.saldoInicial ?? 0,
    saldoFinal: partial.saldoFinal ?? 0,
    debito: partial.debito,
    credito: partial.credito,
    data: partial.data,
    ordem: partial.ordem,
  };
}

describe('Gerencial — razão e período', () => {
  it('parseDataRazao não transforma ISO 2026-06-01 em 26/06/2001', () => {
    expect(parseDataRazao('2026-06-01')).toBe('01/06/2026');
    expect(parseDataRazao('2026-06-15')).toBe('15/06/2026');
    expect(parseDataRazao('01/06/2026')).toBe('01/06/2026');
    expect(normalizeRazaoImport([
      {
        codigo: '9',
        classificacao: '1.1.1',
        nome: 'BANCO',
        data: '2026-06-01',
        debito: 100,
        credito: 0,
        saldoInicial: 0,
        saldoFinal: 0,
      },
    ])[0].data).toBe('01/06/2026');
  });

  it('extrai min/max do razão', () => {
    const rows = [
      lanc({ data: '15/01/2025', debito: 10, credito: 0 }),
      lanc({ data: '20/03/2025', debito: 0, credito: 5 }),
    ];
    expect(extrairPeriodoRazao(rows)).toEqual({ min: '15/01/2025', max: '20/03/2025' });
  });

  it('extrairPeriodoRazao ignora ano-fantasma 2001 quando movimento é 2026', () => {
    const rows = [
      lanc({ data: '26/06/2001', debito: 5, credito: 0 }),
      lanc({ data: '01/06/2026', debito: 5000, credito: 0 }),
      lanc({ data: '15/06/2026', debito: 0, credito: 2000 }),
    ];
    const p = extrairPeriodoRazao(rows);
    expect(p.min).toBe('01/06/2026');
    expect(p.max).toBe('15/06/2026');
  });

  it('filtra razão por período', () => {
    const rows = [
      lanc({ data: '15/03/2025', debito: 100, credito: 0 }),
      lanc({ data: '01/01/2025', debito: 50, credito: 0, classificacao: '2.1.1.01', codigo: '201' }),
    ];
    const filtrado = filtrarRazaoPorPeriodo(rows, '01/03/2025', '31/03/2025');
    expect(filtrado).toHaveLength(1);
    expect(filtrado[0].data).toBe('15/03/2025');
  });

  it('índice por data equivale ao filtro linear', () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      lanc({
        data: `${String((i % 28) + 1).padStart(2, '0')}/06/2025`,
        debito: 10,
        credito: 0,
        ordem: i + 1,
      }),
    );
    const index = buildRazaoTimeIndex(rows);
    const linearPeriodo = filtrarRazaoPorPeriodo(rows, '01/06/2025', '30/06/2025');
    const viaIndex = sliceRazaoIndexByPeriod(index, '01/06/2025', '30/06/2025');
    expect(viaIndex.length).toBe(linearPeriodo.length);
    const linearAntes = filtrarRazaoAntesDe(rows, '01/06/2025');
    expect(sliceRazaoIndexBefore(index, '01/06/2025').length).toBe(linearAntes.length);
  });

  it('normalizeRazaoImport descarta linha sem movimento', () => {
    const out = normalizeRazaoImport([
      lanc({ data: '01/01/2025', debito: 0, credito: 0, codigo: '', classificacao: '', nome: '' }),
      lanc({ data: '01/01/2025', debito: 1, credito: 0 }),
    ]);
    expect(out.length).toBe(1);
    expect(out[0].debito).toBe(1);
  });
});

describe('Gerencial — balancete comparativo', () => {
  const razao: VisionBalanceteRow[] = [
    lanc({ data: '31/01/2025', debito: 1000, credito: 0 }),
    lanc({ data: '28/02/2025', debito: 0, credito: 200 }),
    lanc({ data: '31/03/2025', debito: 500, credito: 0, classificacao: '2.1.1.01', codigo: '201', nome: 'FORNECEDORES' }),
  ];

  it('gera só meses com lançamentos no intervalo (não calendário civil vazio)', () => {
    const periodos = buildPeriodosMensaisEntreDatas('01/01/2025', '31/03/2025', razao);
    expect(periodos.map((p) => p.label)).toEqual(['01/2025', '02/2025', '03/2025']);
  });

  it('ignora anos sem lançamento mesmo com De/Até amplo', () => {
    const periodos = buildPeriodosMensaisEntreDatas('01/01/2001', '31/12/2029', razao);
    expect(periodos.map((p) => p.label)).toEqual(['01/2025', '02/2025', '03/2025']);
    expect(periodos.some((p) => p.label.endsWith('/2001'))).toBe(false);
  });

  it('De 2001 / Até 2029 com movimento só em 2026 → só colunas 2026', () => {
    const so2026: VisionBalanceteRow[] = [
      lanc({ data: '15/03/2026', debito: 100, credito: 0 }),
      lanc({ data: '20/06/2026', debito: 0, credito: 50 }),
      {
        data: '26/06/2001',
        codigo: '101',
        classificacao: '1.1.1.01',
        nome: 'CAIXA',
        debito: 0,
        credito: 0,
        saldoInicial: 1000,
        saldoFinal: 1000,
        tipo: 'A',
      },
    ];
    const periodos = buildPeriodosMensaisEntreDatas('26/06/2001', '26/06/2029', so2026);
    expect(periodos.map((p) => p.label)).toEqual(['03/2026', '06/2026']);
    expect(periodos.every((p) => p.label.endsWith('/2026'))).toBe(true);
  });

  it('só mostra mês se houver lançamento no dia/mês/ano dentro do De/Até', () => {
    const razaoJun: VisionBalanceteRow[] = [
      lanc({ data: '01/06/2026', debito: 100, credito: 0 }),
      lanc({ data: '20/06/2026', debito: 0, credito: 50 }),
      lanc({ data: '15/07/2026', debito: 30, credito: 0 }),
    ];
    // De 15/06: 01/06 fica fora; 06/2026 entra pelo dia 20
    expect(buildPeriodosMensaisEntreDatas('15/06/2026', '31/07/2026', razaoJun).map((p) => p.label)).toEqual([
      '06/2026',
      '07/2026',
    ]);
    // 02/06–10/06: nenhum lançamento nesses dias → sem coluna
    expect(buildPeriodosMensaisEntreDatas('02/06/2026', '10/06/2026', razaoJun).map((p) => p.label)).toEqual([]);
    // Só o dia 20/06
    expect(buildPeriodosMensaisEntreDatas('20/06/2026', '20/06/2026', razaoJun).map((p) => p.label)).toEqual([
      '06/2026',
    ]);
  });

  it('ignora mês que só tem data sem débito/crédito', () => {
    const comDataVazia: VisionBalanceteRow[] = [
      ...razao,
      {
        data: '15/06/2003',
        codigo: '101',
        classificacao: '1.1.1.01',
        nome: 'CAIXA',
        debito: 0,
        credito: 0,
        saldoInicial: 0,
        saldoFinal: 0,
        tipo: 'A',
      },
    ];
    const periodos = buildPeriodosMensaisEntreDatas('01/01/2001', '31/12/2029', comDataVazia);
    expect(periodos.map((p) => p.label)).toEqual(['01/2025', '02/2025', '03/2025']);
    expect(periodos.some((p) => p.label === '06/2003')).toBe(false);
  });

  it('ignora ano-fantasma 2001 com pouco movimento quando o principal é 2026', () => {
    const misto: VisionBalanceteRow[] = [
      lanc({ data: '30/06/2001', debito: 10, credito: 0 }),
      lanc({ data: '01/06/2026', debito: 5000, credito: 0 }),
      lanc({ data: '15/06/2026', debito: 0, credito: 2000 }),
    ];
    const periodos = buildPeriodosMensaisEntreDatas('01/01/2001', '31/12/2029', misto);
    expect(periodos.map((p) => p.label)).toEqual(['06/2026']);
    expect(periodos.some((p) => p.label === '06/2001')).toBe(false);

    const { periodos: montados } = montarComparativoMensal({
      razaoRows: misto,
      planoRows: planoMinimo,
      dataDe: '01/01/2001',
      dataAte: '31/12/2029',
      somenteComMovimento: true,
    });
    expect(montados.map((p) => p.label)).toEqual(['06/2026']);
  });

  it('ignora saldo inicial Domínio mesmo se veio como D/C em 2001', () => {
    const comSi: VisionBalanceteRow[] = [
      {
        data: '26/06/2001',
        codigo: '101',
        classificacao: '1.1.1.01',
        nome: 'REFERENTE SALDO INICIAL',
        debito: 5000,
        credito: 0,
        saldoInicial: 0,
        saldoFinal: 0,
        tipo: 'A',
      },
      {
        data: '26/06/2001',
        codigo: '101',
        classificacao: '1.1.1.01',
        nome: 'SALDO INICIAL',
        debito: 0,
        credito: 3000,
        saldoInicial: 0,
        saldoFinal: 0,
        tipo: 'A',
      },
      lanc({ data: '01/06/2026', debito: 100, credito: 0 }),
    ];
    const periodos = buildPeriodosMensaisEntreDatas('01/01/2001', '31/12/2029', comSi);
    expect(periodos.map((p) => p.label)).toEqual(['06/2026']);

    const { periodos: periodosMontados } = montarComparativoMensal({
      razaoRows: comSi,
      planoRows: planoMinimo,
      dataDe: '01/01/2001',
      dataAte: '31/12/2029',
      somenteComMovimento: true,
    });
    expect(periodosMontados.map((p) => p.label)).toEqual(['06/2026']);
  });

  it('montarComparativoMensal só devolve colunas com lançamento no razão', () => {
    const { periodos } = montarComparativoMensal({
      razaoRows: razao,
      planoRows: planoMinimo,
      dataDe: '01/01/2001',
      dataAte: '31/12/2029',
      somenteComMovimento: true,
    });
    expect(periodos.map((p) => p.label)).toEqual(['01/2025', '02/2025', '03/2025']);
    expect(periodos.some((p) => p.label.endsWith('/2001') || p.label.endsWith('/2029'))).toBe(false);
  });

  it('monta comparativo com linhas por conta', () => {
    const { linhas } = montarComparativoMensal({
      razaoRows: razao,
      planoRows: planoMinimo,
      dataDe: '01/01/2025',
      dataAte: '31/03/2025',
      somenteComMovimento: true,
    });
    expect(linhas.length).toBeGreaterThanOrEqual(1);
    const caixa = linhas.find((l) => l.classificacao.includes('1.1.1'));
    expect(caixa?.saldosPorMes['01/2025']?.valor).toBeGreaterThan(0);
  });

  it('montarBalanceteComPeriodo fecha D-C no período', () => {
    const periodo = razao.filter((r) => r.data?.includes('/01/2025'));
    const bal = montarBalanceteComPeriodo(razao, periodo, planoMinimo, '01/01/2025', '31/01/2025');
    const caixa = bal.find((r) => r.classificacao?.startsWith('1.1.1'));
    expect(caixa?.debito).toBe(1000);
    expect((caixa?.saldoFinal ?? 0) + (caixa?.saldoInicial ?? 0)).toBeGreaterThan(0);
  });
});
