(globalThis as any).DOMMatrix = class DOMMatrix {};

import { describe, expect, it } from 'vitest';
import { EXTRATO_OCR_FIXTURES } from './extratoOcrFixtures';
import {
  auditarCoberturaValoresExtrato,
  resolveExtratoValorColBoundsFromColumns,
  segmentarExtratoEmLancamentos,
  validarMapeamentoExtratoOcr,
} from './ocrExtratoPositional';
import { extractGenericRowsFromMapping } from './parcelamentoColunasExtract';

describe('extratoOcrFixtures — contratos OCR puro', () => {
  for (const fx of EXTRATO_OCR_FIXTURES) {
    it(`${fx.id}: ${fx.descricao}`, async () => {
      const columnDefs = Object.entries(fx.columns).map(([id, c]) => ({
        id,
        start: c.start,
        end: c.end,
        color: 'bg-zinc-400',
      }));
      const valorColX = resolveExtratoValorColBoundsFromColumns(columnDefs, fx.imgWidth);

      const segmentos = segmentarExtratoEmLancamentos(fx.items, fx.imgWidth, {
        yTolFactor: 0.36,
        ignoreWords: fx.ignoreWords ?? [],
        valorColX,
      });
      expect(segmentos).toHaveLength(fx.expect.segmentCount);

      const audit = auditarCoberturaValoresExtrato(
        fx.items,
        segmentos,
        fx.imgWidth,
        valorColX,
        fx.ignoreWords ?? [],
      );
      expect(audit.ok).toBe(fx.expect.auditOk);

      const validacao = validarMapeamentoExtratoOcr({
        columns: columnDefs,
        imgWidth: fx.imgWidth,
        imgHeight: fx.imgHeight,
        items: fx.items,
        semDelimitacaoVertical: true,
      });
      expect(validacao.ok).toBe(true);

      const rows = extractGenericRowsFromMapping(
        fx.items,
        { columns: columnDefs },
        fx.imgHeight,
        fx.imgWidth,
        {
          dataColIds: ['data', 'descricao', 'valorCredito', 'valorDebito', 'valorMisto'],
          headerKeywords: ['saldo anterior', 'data'],
          extratoPositional: true,
          statementYear: '2026',
          ignoreLineWords: fx.ignoreWords ?? [],
        },
      );

      if (fx.expect.rows) {
        expect(rows.length).toBeGreaterThanOrEqual(fx.expect.rows.length);
        for (let i = 0; i < fx.expect.rows.length; i++) {
          const exp = fx.expect.rows[i]!;
          const row = rows[i]!;
          if (exp.data) expect(row.data).toMatch(new RegExp(exp.data.replace('/', '\\/')));
          const desc = (row.descricao ?? '').toLowerCase();
          for (const part of exp.descricaoContains ?? []) {
            expect(desc).toContain(part.toLowerCase());
          }
          for (const part of exp.descricaoNotContains ?? []) {
            expect(desc).not.toContain(part.toLowerCase());
          }
          if (exp.valorDebito) expect(row.valorDebito).toContain(exp.valorDebito);
          if (exp.valorCredito) expect(row.valorCredito).toContain(exp.valorCredito);
          if (exp.valorMisto) expect(row.valorMisto).toContain(exp.valorMisto);
        }
      }
    });
  }
});
