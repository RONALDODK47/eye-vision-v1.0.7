import { describe, expect, it } from 'vitest';
import {
  buildPageMappingSnapshotForExtract,
  buildPageMappingSnapshotForUi,
  collectFaixaMarcadoresGlobais,
  collectFaixaPorPaginaFromStates,
  resolveExtractPageRange,
  resolveFaixaPorPaginaFromLayout,
  resolveFaixaVerticalFromSnapshot,
  type PageFaixaSnapshot,
} from './extratoOcrLayoutFaixa';
import type { ExtratoOcrLayoutSaved } from './extratoOcrLayoutStorage';

function snap(partial: Partial<PageFaixaSnapshot> & Pick<PageFaixaSnapshot, 'imgWidth' | 'imgHeight'>): PageFaixaSnapshot {
  return {
    columns: [{ id: 'data', start: 0, end: 100, color: 'bg-cyan-500' }],
    faixaStart: 0,
    faixaEnd: partial.imgHeight,
    faixaInicioMarcado: false,
    faixaFimMarcado: false,
    semDelimitacaoVertical: false,
    ...partial,
  };
}

describe('extratoOcrLayoutFaixa', () => {
  it('salva verde na pág. 1 e vermelha na última separadamente', () => {
    const states = new Map<number, PageFaixaSnapshot>();
    states.set(
      1,
      snap({
        imgWidth: 900,
        imgHeight: 2500,
        faixaStart: 400,
        faixaEnd: 2500,
        faixaInicioMarcado: true,
        faixaFimMarcado: false,
      }),
    );
    states.set(
      5,
      snap({
        imgWidth: 900,
        imgHeight: 2480,
        faixaStart: 0,
        faixaEnd: 2100,
        faixaInicioMarcado: false,
        faixaFimMarcado: true,
      }),
    );

    const porPagina = collectFaixaPorPaginaFromStates(states);
    expect(porPagina['1']?.faixaInicioMarcado).toBe(true);
    expect(porPagina['1']?.faixaStartNorm).toBeCloseTo(400 / 2500, 4);
    expect(porPagina['5']?.faixaFimMarcado).toBe(true);
    expect(porPagina['5']?.faixaEndNorm).toBeCloseTo(2100 / 2480, 4);
  });

  it('UI na pág. 1 mostra só verde; na última só vermelha', () => {
    const states = new Map<number, PageFaixaSnapshot>();
    states.set(
      1,
      snap({
        imgWidth: 900,
        imgHeight: 2500,
        faixaStart: 400,
        faixaEnd: 2500,
        faixaInicioMarcado: true,
        faixaFimMarcado: false,
      }),
    );
    states.set(
      3,
      snap({
        imgWidth: 900,
        imgHeight: 2500,
        faixaStart: 0,
        faixaEnd: 2200,
        faixaInicioMarcado: false,
        faixaFimMarcado: true,
      }),
    );

    const p1 = buildPageMappingSnapshotForUi(states, 1, 900, 2500, false)!;
    expect(p1.faixaInicioMarcado).toBe(true);
    expect(p1.faixaFimMarcado).toBe(false);
    expect(p1.faixaStart).toBeCloseTo(400, 1);

    const p3 = buildPageMappingSnapshotForUi(states, 3, 900, 2500, true)!;
    expect(p3.faixaInicioMarcado).toBe(false);
    expect(p3.faixaFimMarcado).toBe(true);
    expect(p3.faixaEnd).toBeCloseTo(2200, 1);
  });

  it('extração usa início na página marcada (não só pág. 1)', () => {
    const states = new Map<number, PageFaixaSnapshot>();
    states.set(
      1,
      snap({
        imgWidth: 900,
        imgHeight: 2500,
        faixaInicioMarcado: false,
        faixaFimMarcado: false,
      }),
    );
    states.set(
      2,
      snap({
        imgWidth: 900,
        imgHeight: 2500,
        faixaStart: 500,
        faixaEnd: 2500,
        faixaInicioMarcado: true,
        faixaFimMarcado: false,
      }),
    );
    states.set(
      5,
      snap({
        imgWidth: 900,
        imgHeight: 2500,
        faixaStart: 0,
        faixaEnd: 2100,
        faixaInicioMarcado: false,
        faixaFimMarcado: true,
      }),
    );

    const p2 = buildPageMappingSnapshotForExtract(states, 2, 5, 900, 2500, true)!;
    expect(p2.faixaInicioMarcado).toBe(true);
    expect(p2.faixaStart).toBeCloseTo(500, 1);
    expect(p2.faixaFimMarcado).toBe(false);

    const p3 = buildPageMappingSnapshotForExtract(states, 3, 5, 900, 2500, true)!;
    expect(p3.faixaInicioMarcado).toBe(false);
    expect(p3.faixaFimMarcado).toBe(false);

    const p5 = buildPageMappingSnapshotForExtract(states, 5, 5, 900, 2500, true)!;
    expect(p5.faixaFimMarcado).toBe(true);
    expect(p5.faixaEnd).toBeCloseTo(2100, 1);
  });

  it('extração usa início da pág. 1 e fim na última', () => {
    const states = new Map<number, PageFaixaSnapshot>();
    states.set(
      1,
      snap({
        imgWidth: 900,
        imgHeight: 2500,
        faixaStart: 400,
        faixaEnd: 2500,
        faixaInicioMarcado: true,
        faixaFimMarcado: false,
      }),
    );
    states.set(
      3,
      snap({
        imgWidth: 900,
        imgHeight: 2500,
        faixaStart: 0,
        faixaEnd: 2200,
        faixaInicioMarcado: false,
        faixaFimMarcado: true,
      }),
    );

    const first = buildPageMappingSnapshotForExtract(states, 1, 3, 900, 2500, true)!;
    expect(first.faixaInicioMarcado).toBe(true);
    expect(first.faixaFimMarcado).toBe(false);
    const faixaP1 = resolveFaixaVerticalFromSnapshot(first, 2500);
    expect(faixaP1?.startY).toBeCloseTo(400, 1);

    const mid = buildPageMappingSnapshotForExtract(states, 2, 3, 900, 2500, true)!;
    expect(mid.faixaInicioMarcado).toBe(false);
    expect(mid.faixaFimMarcado).toBe(false);

    const last = buildPageMappingSnapshotForExtract(states, 3, 3, 900, 2500, true)!;
    expect(last.faixaFimMarcado).toBe(true);
    expect(last.faixaEnd).toBeCloseTo(2200, 1);
  });

  it('resolveFaixaVerticalFromSnapshot aceita só início ou só fim', () => {
    const onlyInicio = snap({
      imgWidth: 900,
      imgHeight: 2500,
      faixaStart: 400,
      faixaEnd: 2500,
      faixaInicioMarcado: true,
      faixaFimMarcado: false,
    });
    const faixa = resolveFaixaVerticalFromSnapshot(onlyInicio, 2500);
    expect(faixa?.startY).toBeCloseTo(400, 1);
    expect(faixa?.endY).toBe(2500);

    const onlyFim = snap({
      imgWidth: 900,
      imgHeight: 2500,
      faixaStart: 0,
      faixaEnd: 2100,
      faixaInicioMarcado: false,
      faixaFimMarcado: true,
    });
    const faixaFim = resolveFaixaVerticalFromSnapshot(onlyFim, 2500);
    expect(faixaFim?.startY).toBe(0);
    expect(faixaFim?.endY).toBeCloseTo(2100, 1);
  });

  it('collectFaixaMarcadoresGlobais agrega marcas de várias páginas', () => {
    const states = new Map<number, PageFaixaSnapshot>();
    states.set(
      1,
      snap({
        imgWidth: 900,
        imgHeight: 2500,
        faixaInicioMarcado: true,
        faixaFimMarcado: false,
      }),
    );
    states.set(
      3,
      snap({
        imgWidth: 900,
        imgHeight: 2500,
        faixaFimMarcado: true,
      }),
    );
    const g = collectFaixaMarcadoresGlobais(states, {
      faixaInicioMarcado: false,
      faixaFimMarcado: false,
      semDelimitacaoVertical: false,
    });
    expect(g.inicioMarcado).toBe(true);
    expect(g.fimMarcado).toBe(true);
  });

  it('migra layout legado para faixaPorPagina', () => {
    const layout = {
      faixaStart: 400,
      faixaEnd: 2100,
      faixaStartNorm: 0.16,
      faixaEndNorm: 0.84,
      faixaInicioMarcado: true,
      faixaFimMarcado: true,
      faixaFimPagina: 3,
      imgHeight: 2500,
      semDelimitacaoVertical: false,
    } as ExtratoOcrLayoutSaved;

    const porPagina = resolveFaixaPorPaginaFromLayout(layout, 3);
    expect(porPagina['1']?.faixaInicioMarcado).toBe(true);
    expect(porPagina['3']?.faixaFimMarcado).toBe(true);
    expect(porPagina['3']?.faixaEndNorm).toBeCloseTo(0.84, 3);
  });

  it('limita intervalo de extração ao total de páginas do PDF', () => {
    const states = new Map<number, PageFaixaSnapshot>();
    states.set(
      37,
      snap({
        imgWidth: 900,
        imgHeight: 2500,
        faixaFimMarcado: true,
      }),
    );
    const range = resolveExtractPageRange(states, 21);
    expect(range.startPage).toBe(1);
    expect(range.endPage).toBe(21);
  });

  it('herda colunas da pág. 1 em outras páginas mesmo com snapshot local vazio', () => {
    const states = new Map<number, PageFaixaSnapshot>();
    states.set(
      1,
      snap({
        imgWidth: 1000,
        imgHeight: 2500,
        columns: [
          { id: 'codigoReduzido', start: 40, end: 120, color: 'bg-indigo-500' },
          { id: 'codigoClassificacao', start: 200, end: 380, color: 'bg-blue-500' },
          { id: 'descricao', start: 400, end: 820, color: 'bg-emerald-500' },
        ],
      }),
    );
    states.set(
      9,
      snap({
        imgWidth: 1050,
        imgHeight: 2480,
        columns: [],
        faixaStart: 0,
        faixaEnd: 2480,
        faixaInicioMarcado: true,
        faixaFimMarcado: true,
      }),
    );

    const p9 = buildPageMappingSnapshotForUi(states, 9, 1050, 2480, true)!;
    expect(p9.columns.find((c) => c.id === 'codigoReduzido')?.start).toBeCloseTo(42, 0);
    expect(p9.columns.find((c) => c.id === 'descricao')?.end).toBeCloseTo(861, 0);
  });
});
