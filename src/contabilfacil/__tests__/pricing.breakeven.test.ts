import { describe, expect, it } from 'vitest';
import {
  computeBreakevenMetrics,
  computeConsolidatedProvisionRevenue,
  computeRequiredRevenueToCoverAndProfit,
  resolveEffectiveMarginPercent,
} from '../logic/pricingBreakeven';
import { computeDashboardSummary, computePricingBreakdowns } from '../logic/pricingCalculator';
import {
  resolveDisplayedUnitPrice,
  resolveExpectedQtyDisplay,
  resolveExpectedRevenueDisplay,
} from '../logic/pricingPrecificacaoTable';
import {
  createDefaultPricingWorkspace,
  createEmptyStockItem,
  normalizeStockItem,
} from '../logic/pricingTypes';

function pudimWorkspace(monthlyQty: number, marginPercent: number) {
  const pudim = createEmptyStockItem('Empresa', 'produto_acabado');
  pudim.name = 'PUDIM';
  pudim.useBom = false;
  pudim.directCost = 2.19;
  pudim.monthlyQty = monthlyQty;

  return {
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
    settings: {
      markupPercent: 33.3,
      marginPercent,
      mode: 'margin_only' as const,
      costAllocationMode: 'por_volume' as const,
    },
  };
}

describe('provisão mensal e receita', () => {
  it('resolveEffectiveMarginPercent no modo both usa o maior entre margem e markup', () => {
    expect(
      resolveEffectiveMarginPercent({
        markupPercent: 33.3,
        marginPercent: 25,
        mode: 'both',
      }),
    ).toBeCloseTo(25, 1);
  });

  it('provisão de qtd = meta − qtd/mês; zera ao atingir a meta', () => {
    const row = computePricingBreakdowns(pudimWorkspace(1, 25))[0]!;
    expect(row.monthlyTargetQty).not.toBeNull();
    expect(row.provisionQtyPerMonth).toBe(Math.max(0, row.monthlyTargetQty! - 1));

    const atMeta = computePricingBreakdowns(
      pudimWorkspace(row.monthlyTargetQty!, 25),
    )[0]!;
    expect(atMeta.provisionQtyPerMonth).toBe(0);
    expect(atMeta.provisionRevenue).toBe(0);
  });

  it('provisão de receita = provisão de qtd × preço unitário', () => {
    const row = computePricingBreakdowns(pudimWorkspace(0, 25))[0]!;
    expect(row.provisionQtyPerMonth!).toBeGreaterThan(0);
    expect(row.provisionRevenue!).toBeCloseTo(
      row.provisionQtyPerMonth! * row.pricedUnitPrice,
      2,
    );
  });

  it('aumentar qtd/mês reduz provisão de quantidade', () => {
    const base = computePricingBreakdowns(pudimWorkspace(0, 25))[0]!;
    const higher = computePricingBreakdowns(pudimWorkspace(3, 25))[0]!;
    expect(base.provisionQtyPerMonth!).toBeGreaterThan(0);
    expect(higher.provisionQtyPerMonth!).toBeLessThan(base.provisionQtyPerMonth!);
  });

  it('dashboard: receita provisão = meta − receita projetada', () => {
    const breakdowns = computePricingBreakdowns(pudimWorkspace(7, 25));
    const dashboard = computeDashboardSummary(breakdowns, pudimWorkspace(7, 25));
    const target = computeRequiredRevenueToCoverAndProfit(178.3, 25);
    expect(dashboard.monthlyTargetRevenue).toBeCloseTo(target, 2);
    expect(dashboard.provisionRevenueToCover).toBeCloseTo(
      computeConsolidatedProvisionRevenue(178.3, 25, dashboard.totalMonthlyRevenue),
      2,
    );
  });

  it('tabela: ponto de equilíbrio mostra meta de unidades e receita necessárias', () => {
    const belowMeta = computePricingBreakdowns(pudimWorkspace(0, 25))[0]!;
    expect(belowMeta.monthlyTargetQty).not.toBeNull();
    expect(belowMeta.provisionQtyPerMonth!).toBeGreaterThan(0);
    expect(resolveExpectedQtyDisplay(belowMeta, 0)).toBe(belowMeta.monthlyTargetQty);
    expect(resolveExpectedRevenueDisplay(belowMeta, 0)).toBeCloseTo(
      belowMeta.monthlyTargetRevenue!,
      2,
    );

    const aboveMeta = computePricingBreakdowns(pudimWorkspace(7, 25))[0]!;
    expect(resolveExpectedQtyDisplay(aboveMeta, 7)).toBe(aboveMeta.monthlyTargetQty);
    expect(resolveExpectedRevenueDisplay(aboveMeta, 7)).toBeCloseTo(
      aboveMeta.monthlyTargetRevenue!,
      2,
    );
    if (
      aboveMeta.monthlyTargetQty != null &&
      aboveMeta.provisionQtyPerMonth != null &&
      aboveMeta.provisionQtyPerMonth === 0
    ) {
      expect(aboveMeta.monthlyTargetQty).toBeLessThanOrEqual(7);
    }
  });

  it('tabela: abaixo da meta mostra mínimo e receita que falta', () => {
    const row = computePricingBreakdowns(pudimWorkspace(0, 25))[0]!;
    expect(row.provisionQtyPerMonth!).toBeGreaterThan(0);
    expect(resolveExpectedQtyDisplay(row, 0)).toBe(row.monthlyTargetQty);
    expect(resolveExpectedRevenueDisplay(row, 0)).toBeCloseTo(
      row.monthlyTargetQty! * row.pricedUnitPrice,
      2,
    );
  });

  it('computeBreakevenMetrics calcula meta mesmo com preço abaixo do custo total/un.', () => {
    const result = computeBreakevenMetrics({
      materialCost: 10,
      totalUnitCost: 25,
      pricedUnitPrice: 8,
      monthlyCostsUsed: 50,
      monthlyExpensesUsed: 50,
      creditsRecovery: 0,
      monthlyQty: 7,
      baseQty: 7,
    });
    expect(result.monthlyTargetQty).not.toBeNull();
    expect(result.monthlyTargetRevenue).not.toBeNull();
    expect(result.monthlyTargetQty!).toBeGreaterThan(0);
  });
});
