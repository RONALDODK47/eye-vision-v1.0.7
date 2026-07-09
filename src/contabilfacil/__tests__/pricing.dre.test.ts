import { describe, expect, it } from 'vitest';
import { computePricingBreakdowns } from '../logic/pricingCalculator';
import { computePricingDre } from '../logic/pricingDre';
import {
  createDefaultPricingWorkspace,
  createEmptyStockItem,
  normalizeStockItem,
} from '../logic/pricingTypes';

describe('computePricingDre', () => {
  it('monta DRE com receita, CMV, custos/despesas e créditos', () => {
    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'Pudim';
    pa.useBom = false;
    pa.directCost = 10;
    pa.monthlyQty = 100;

    const workspace = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [normalizeStockItem(pa)],
      costExpenses: [
        {
          id: 'c1',
          companyName: 'Empresa',
          segment: 'produto_acabado' as const,
          type: 'custo' as const,
          name: 'Produção',
          category: '',
          notes: '',
          monthlyAmount: 5000,
          kind: 'fixo' as const,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'd1',
          companyName: 'Empresa',
          segment: 'produto_acabado' as const,
          type: 'despesa' as const,
          name: 'Marketing',
          category: '',
          notes: '',
          monthlyAmount: 1000,
          kind: 'variavel' as const,
          createdAt: new Date().toISOString(),
        },
      ],
      settings: {
        ...createDefaultPricingWorkspace('Empresa').settings,
        markupPercent: 50,
        marginPercent: 0,
        mode: 'markup_only' as const,
      },
    };

    const breakdowns = computePricingBreakdowns(workspace);
    const dre = computePricingDre(breakdowns, workspace, 'geral');

    expect(dre.grossRevenue).toBeGreaterThan(0);
    expect(dre.grossProfit).toBe(dre.grossRevenue - dre.lines.find((l) => l.id === 'cmv')!.value);
    expect(dre.netResult).toBeCloseTo(
      dre.grossProfit - 5000 - 1000 + dre.lines.find((l) => l.id === 'credits')!.value,
      2,
    );
  });
});
