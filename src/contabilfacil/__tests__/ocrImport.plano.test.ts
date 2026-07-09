import { describe, expect, it, vi } from 'vitest';
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {
    workerSrc: '',
  },
}));

import { mapOcrRowsToImportItemsWithPlanoInfer, mapOcrRowsToImportItems } from '../logic/ocrImportMapper';
import type { GenericOcrRow } from '../../lib/parcelamentoColunasExtract';
import {
  extractGenericRowsFromMapping,
  mappingGenericoEmCoordsOcr,
} from '../../lib/parcelamentoColunasExtract';
import { suggestPlanoContasColumns } from '../../lib/pdfNativeTextItems';
import type { PosicionadoItem } from '../../lib/parcelamentoColunasExtract';
import { getOcrColunasConfig } from '../logic/ocrColunasConfig';

function planoItem(str: string, x: number, y: number): PosicionadoItem {
  return { str, x, y, w: str.length * 8, h: 12 };
}

describe('OCR importação plano de contas', () => {
  it('habilita seletor DocTR / IA / Híbrido no módulo plano', () => {
    const cfg = getOcrColunasConfig('plano');
    expect(cfg.supportsExtractEngine).toBe(true);
    expect(cfg.supportsValorModo).toBeFalsy();
    expect(cfg.dataColIds).toContain('codigoClassificacao');
  });

  it('converte linha com classificação e descrição separadas', () => {
    const rows: GenericOcrRow[] = [
      {
        codigoReduzido: '0000101',
        codigoClassificacao: '1101020002',
        descricao: 'CAIXA GERAL',
        tipo: 'A',
      },
    ];
    const { items } = mapOcrRowsToImportItemsWithPlanoInfer('plano', rows);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ code: '1101020002', name: 'CAIXA GERAL' });
  });

  it('infere código e nome quando OCR funde colunas (formato Domínio)', () => {
    const rows: GenericOcrRow[] = [
      {
        descricao: '0000101 1101020002 CAIXA GERAL A',
      },
    ];
    const { items } = mapOcrRowsToImportItemsWithPlanoInfer('plano', rows);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ code: '1101020002', name: 'CAIXA GERAL', tipo: 'A' });
  });

  it('infere classificação no início da descrição', () => {
    const rows: GenericOcrRow[] = [
      {
        descricao: '2101010001 FORNECEDORES NACIONAIS',
      },
    ];
    const { items } = mapOcrRowsToImportItemsWithPlanoInfer('plano', rows);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ code: '2101010001', name: 'FORNECEDORES NACIONAIS' });
  });

  it('layout Domínio: colunas separadas com classificação pontuada e grau', () => {
    const rows: GenericOcrRow[] = [
      {
        codigoReduzido: '3',
        codigoClassificacao: '1.1.1.01',
        descricao: 'CAIXA GERAL',
        tipo: 'A',
        nivel: '5',
      },
    ];
    const { items } = mapOcrRowsToImportItemsWithPlanoInfer('plano', rows);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: '1.1.1.01',
      name: 'CAIXA GERAL',
      codigoReduzido: '3',
      tipo: 'A',
      nivel: 5,
    });
  });

  it('recupera classificação quando Tipo engloba T + Classificação', () => {
    const rows: GenericOcrRow[] = [
      {
        codigoReduzido: '3',
        descricao: 'CAIXA GERAL',
        tipo: 'A 1.1.1.01',
        nivel: '5',
      },
    ];
    const { items } = mapOcrRowsToImportItemsWithPlanoInfer('plano', rows);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: '1.1.1.01',
      name: 'CAIXA GERAL',
      codigoReduzido: '3',
      tipo: 'A',
      nivel: 5,
    });
  });

  it('infere linha tabular Domínio fundida no OCR', () => {
    const rows: GenericOcrRow[] = [
      {
        descricao: '3 A 1.1.1.01 CAIXA GERAL 5',
      },
    ];
    const { items } = mapOcrRowsToImportItemsWithPlanoInfer('plano', rows);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: '1.1.1.01',
      name: 'CAIXA GERAL',
      codigoReduzido: '3',
      tipo: 'A',
      nivel: 5,
    });
  });

  it('infere relatório Domínio A Econômica (sintética com T)', () => {
    const rows: GenericOcrRow[] = [
      { _linhaOcr: '1 2 S 1.1 ATIVO CIRCULANTE 2' },
    ];
    const { items } = mapOcrRowsToImportItemsWithPlanoInfer('plano', rows);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: '1.1',
      name: 'ATIVO CIRCULANTE',
      codigoReduzido: '2',
      tipo: 'S',
      nivel: 2,
    });
  });

  it('infere relatório Domínio A Econômica (analítica sem T)', () => {
    const rows: GenericOcrRow[] = [
      { _linhaOcr: '1 5 1.1.1.01.00001 CAIXA GERAL 5' },
    ];
    const { items } = mapOcrRowsToImportItemsWithPlanoInfer('plano', rows);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: '1.1.1.01.00001',
      name: 'CAIXA GERAL',
      codigoReduzido: '5',
      tipo: 'A',
      nivel: 5,
    });
  });

  it('sugere colunas Domínio (Código, T, Classificação, Nome, Grau)', () => {
    const yHeader = 120;
    const yBody = 150;
    const items: PosicionadoItem[] = [
      planoItem('Código', 40, yHeader),
      planoItem('T', 90, yHeader),
      planoItem('Classificação', 130, yHeader),
      planoItem('Nome', 280, yHeader),
      planoItem('Grau', 520, yHeader),
      planoItem('1', 42, yBody),
      planoItem('S', 92, yBody),
      planoItem('1', 135, yBody),
      planoItem('ATIVO', 285, yBody),
      planoItem('1', 522, yBody),
      planoItem('3', 42, yBody + 24),
      planoItem('A', 92, yBody + 24),
      planoItem('1.1.1.01', 138, yBody + 24),
      planoItem('CAIXA GERAL', 288, yBody + 24),
      planoItem('5', 522, yBody + 24),
    ];
    for (let i = 0; i < 8; i++) {
      items.push(planoItem(String(i + 2), 42, yBody + 48 + i * 20));
      items.push(planoItem('S', 92, yBody + 48 + i * 20));
      items.push(planoItem(`1.${i + 1}`, 138, yBody + 48 + i * 20));
      items.push(planoItem(`CONTA ${i + 1}`, 288, yBody + 48 + i * 20));
      items.push(planoItem('2', 522, yBody + 48 + i * 20));
    }

    const suggested = suggestPlanoContasColumns(items, 600);
    expect(suggested).not.toBeNull();
    const ids = suggested!.columns.map((c) => c.id);
    expect(ids).toContain('codigoReduzido');
    expect(ids).toContain('codigoClassificacao');
    expect(ids).toContain('descricao');
    expect(ids).toContain('tipo');
    expect(ids).toContain('nivel');

    const tipo = suggested!.columns.find((c) => c.id === 'tipo')!;
    const classificacao = suggested!.columns.find((c) => c.id === 'codigoClassificacao')!;
    expect(tipo.end).toBeLessThan(classificacao.start);
  });

  it('extrai uma linha OCR por conta com planoPositional (não funde linhas adjacentes)', () => {
    const yHeader = 120;
    const yBody = 150;
    const items: PosicionadoItem[] = [
      planoItem('Código', 40, yHeader),
      planoItem('T', 90, yHeader),
      planoItem('Classificação', 130, yHeader),
      planoItem('Nome', 280, yHeader),
      planoItem('Grau', 520, yHeader),
      planoItem('1', 42, yBody),
      planoItem('S', 92, yBody),
      planoItem('1', 135, yBody),
      planoItem('ATIVO', 285, yBody),
      planoItem('1', 522, yBody),
      planoItem('3', 42, yBody + 24),
      planoItem('A', 92, yBody + 24),
      planoItem('1.1.1.01', 138, yBody + 24),
      planoItem('CAIXA GERAL', 288, yBody + 24),
      planoItem('5', 522, yBody + 24),
    ];
    for (let i = 0; i < 8; i++) {
      items.push(planoItem(String(i + 2), 42, yBody + 48 + i * 20));
      items.push(planoItem('S', 92, yBody + 48 + i * 20));
      items.push(planoItem(`1.${i + 1}`, 138, yBody + 48 + i * 20));
      items.push(planoItem(`CONTA ${i + 1}`, 288, yBody + 48 + i * 20));
      items.push(planoItem('2', 522, yBody + 48 + i * 20));
    }

    const suggested = suggestPlanoContasColumns(items, 600)!;
    const refW = 600;
    const refH = 800;
    const mapping = mappingGenericoEmCoordsOcr(
      suggested.columns,
      { startY: yHeader - 8, endY: yBody + 220 },
      refW,
      refH,
      refW,
      refH,
    );
    const rows = extractGenericRowsFromMapping(items, mapping, refH, refW, {
      dataColIds: ['codigoReduzido', 'codigoClassificacao', 'descricao', 'tipo', 'nivel'],
      headerKeywords: ['classifica', 'codigo', 'nome', 'grau'],
      planoPositional: true,
      strictFaixaVertical: true,
    });
    const { items: imported } = mapOcrRowsToImportItemsWithPlanoInfer('plano', rows);
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(imported.length).toBeGreaterThanOrEqual(9);
    expect(rows.some((r) => String(r.descricao ?? r._linhaOcr ?? '').includes('ATIVO'))).toBe(true);
    expect(imported.some((c) => c.name === 'CAIXA GERAL')).toBe(true);
  });
});

describe('OCR importação extrato', () => {
  it('ignora linha com valor mas sem histórico identificável', () => {
    const rows: GenericOcrRow[] = [
      {
        data: '14/02/2026',
        valorMisto: 'R$ 30.998,95',
      },
    ];
    const { items, logs } = mapOcrRowsToImportItems('extrato', rows);
    expect(items).toHaveLength(0);
    expect(logs.some((l) => l.includes('histórico não identificado'))).toBe(true);
  });

  it('ignora linhas com palavras configuradas (case-insensitive)', () => {
    const rows: GenericOcrRow[] = [
      { data: '01/02/2026', descricao: 'TARIFA MENSAL', valorDebito: '29,90' },
      { data: '01/02/2026', descricao: 'PIX RECEBIDO', valorCredito: '100,00' },
    ];
    const { items } = mapOcrRowsToImportItems('extrato', rows, {
      ignoreLineWords: ['tarifa'],
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.description).toBe('PIX RECEBIDO');
  });

  it('ignora saldo anterior/bloq e retorna saldoAnteriorDetectado', () => {
    const rows: GenericOcrRow[] = [
      {
        data: '30/01/2026',
        descricao: 'SALDO BLOQ. ANTERIOR',
        valorDebito: '2.747,94',
      },
      {
        data: '30/01/2026',
        descricao: 'TED ENVIO',
        valorDebito: '150,00',
      },
    ];
    const { items, saldoAnteriorDetectado } = mapOcrRowsToImportItems('extrato', rows);
    expect(items).toHaveLength(1);
    expect(items[0]!.description).toBe('TED ENVIO');
    expect(saldoAnteriorDetectado).toBe(2747.94);
  });

  it('converte linha com valorMisto e descrição', () => {
    const rows: GenericOcrRow[] = [
      {
        data: '14/02/2026',
        descricao: 'PAGA',
        valorMisto: 'R$ 30.998,95',
      },
    ];
    const { items } = mapOcrRowsToImportItems('extrato', rows);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      date: '2026-02-14',
      value: 30998.95,
      description: 'PAGA',
    });
  });

  it('converte data com espaços e nomes de meses em português', () => {
    const rows: GenericOcrRow[] = [
      {
        data: '14 / FEV / 2026',
        descricao: 'PAGAMENTO REF FEV',
        valorMisto: 'R$ 30.998,95',
      },
      {
        data: '14 / 03 / 2026',
        descricao: 'PAGAMENTO REF MAR',
        valorMisto: 'R$ 27.978,86',
      }
    ];
    const { items } = mapOcrRowsToImportItems('extrato', rows);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      date: '2026-02-14',
      value: 30998.95,
    });
    expect(items[1]).toMatchObject({
      date: '2026-03-14',
      value: 27978.86,
    });
  });
});
