import { describe, expect, it } from 'vitest';
import { computePricingBreakdowns } from '../logic/pricingCalculator';
import { buildGlobalPricingReportIntro, buildPricingProductReport } from '../logic/pricingReport';
import { downloadPricingCalculationReportPdf } from '../../lib/pricingPdfExporter';
import {
  createDefaultPricingWorkspace,
  createEmptyStockItem,
  normalizeStockItem,
} from '../logic/pricingTypes';

const fmt = {
  money: (n: number) => `R$${n.toFixed(2)}`,
  qty: (n: number) => String(n),
  pct: (n: number) => `${n}%`,
};

describe('relatório de precificação', () => {
  it('inclui seções de qtd/mês, preço e meta sem prejuízo', () => {
    const pudim = createEmptyStockItem('Empresa', 'produto_acabado');
    pudim.name = 'PUDIM';
    pudim.useBom = false;
    pudim.directCost = 2.19;
    pudim.monthlyQty = 7;
    pudim.recipeQuantityDoubles = 1;

    const workspace = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [normalizeStockItem(pudim)],
      costExpenses: [
        {
          id: 'd1',
          companyName: 'Empresa',
          segment: 'produto_acabado' as const,
          type: 'despesa' as const,
          name: 'Operacional',
          category: '',
          notes: '',
          monthlyAmount: 178.3,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const row = computePricingBreakdowns(workspace)[0]!;
    const report = buildPricingProductReport(row, workspace, fmt);

    expect(report.productName).toBe('PUDIM');
    expect(report.sections.map((s) => s.title)).toEqual(
      expect.arrayContaining([
        '1. Quantidade na precificação',
        '5. Meta sem prejuízo (qtd e valor esperados)',
      ]),
    );

    const metaSection = report.sections.find((s) => s.title.includes('Meta sem prejuízo'));
    expect(metaSection?.lines.some((l) => l.label.includes('Mínimo de un./mês'))).toBe(true);
    expect(metaSection?.lines.some((l) => l.label.includes('Contribuição'))).toBe(true);
  });

  it('exportação PDF do relatório não lança erro', () => {
    const pudim = createEmptyStockItem('Empresa', 'produto_acabado');
    pudim.name = 'PUDIM';
    pudim.useBom = false;
    pudim.directCost = 2.19;
    pudim.monthlyQty = 7;
    const workspace = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [normalizeStockItem(pudim)],
    };
    const row = computePricingBreakdowns(workspace)[0]!;
    const report = buildPricingProductReport(row, workspace, fmt);
    const intro = buildGlobalPricingReportIntro(workspace.settings, fmt);

    expect(() =>
      downloadPricingCalculationReportPdf({
        companyName: 'Empresa',
        globalIntro: intro,
        productReports: [report],
      }),
    ).not.toThrow();
  });
});
