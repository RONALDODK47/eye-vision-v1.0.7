import { describe, expect, it } from 'vitest';
import {
  computeAcquisitionTotal,
  computeDashboardSummary,
  computePricingBreakdowns,
  computeStockInventoryTotal,
  effectiveProjectionQty,
} from '../logic/pricingCalculator';
import {
  createDefaultPricingWorkspace,
  createEmptyStockItem,
  normalizeStockItem,
} from '../logic/pricingTypes';

describe('pricing dashboard', () => {
  it('effectiveProjectionQty usa 1 quando quantidade mensal é zero', () => {
    expect(effectiveProjectionQty(0)).toBe(1);
    expect(effectiveProjectionQty(10)).toBe(10);
  });

  it('consolidado inclui estoque e receita com preço precificado', () => {
    const insumo = createEmptyStockItem('Empresa', 'insumo');
    insumo.name = 'Farinha';
    insumo.unitPrice = 10;
    insumo.unitsPurchased = 2;
    insumo.measureQuantity = 1;
    insumo.packageUnit = 'kg';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'Pão';
    pa.useBom = true;
    pa.bom = [{ stockItemId: insumo.id, quantity: 0.1, unit: 'kg' }];

    const workspace = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [normalizeStockItem(insumo), normalizeStockItem(pa)],
      settings: {
        ...createDefaultPricingWorkspace('Empresa').settings,
        markupPercent: 50,
        marginPercent: 0,
        mode: 'markup_only' as const,
      },
    };

    const breakdowns = computePricingBreakdowns(workspace);
    const dashboard = computeDashboardSummary(breakdowns, workspace);

    expect(computeStockInventoryTotal(workspace)).toBeGreaterThan(0);
    expect(dashboard.totalStockInventory).toBeGreaterThan(0);
    expect(dashboard.totalAcquisitionCost).toBeGreaterThan(0);
    expect(dashboard.totalMaterialCost).toBeGreaterThan(0);
    expect(dashboard.totalConsolidatedCosts).toBeCloseTo(
      dashboard.totalCosts + dashboard.totalExpenses + dashboard.totalMaterialCost,
      2,
    );
    expect(dashboard.totalMonthlyRevenue).toBeGreaterThan(0);
  });

  it('consolidado soma custos, despesas e material mensal total (não unitário)', () => {
    const makePa = (name: string, cost: number, qty: number) => {
      const item = createEmptyStockItem('Empresa', 'produto_acabado');
      item.name = name;
      item.useBom = false;
      item.directCost = cost;
      item.monthlyQty = qty;
      return normalizeStockItem(item);
    };

    const merc = createEmptyStockItem('Empresa', 'mercadoria');
    merc.name = 'Ar condicionado';
    merc.unitPrice = 1300;
    merc.unitsPurchased = 10;
    merc.priceInputMode = 'unit';
    merc.monthlyQty = 5;

    const workspace = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [makePa('PUDIM', 2.19, 7), normalizeStockItem(merc)],
      costExpenses: [
        {
          id: 'c1',
          companyName: 'Empresa',
          segment: 'produto_acabado' as const,
          type: 'custo' as const,
          name: 'Produção',
          category: '',
          notes: '',
          monthlyAmount: 500,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'd1',
          companyName: 'Empresa',
          segment: 'produto_acabado' as const,
          type: 'despesa' as const,
          name: 'Operacional',
          category: '',
          notes: '',
          monthlyAmount: 800,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'd2',
          companyName: 'Empresa',
          segment: 'mercadoria' as const,
          type: 'despesa' as const,
          name: 'Revenda',
          category: '',
          notes: '',
          monthlyAmount: 200,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const breakdowns = computePricingBreakdowns(workspace);
    const dashboard = computeDashboardSummary(breakdowns, workspace);
    const acquisition = computeAcquisitionTotal(workspace);
    const materialMonthly = breakdowns.reduce(
      (s, b) => s + b.materialCost * effectiveProjectionQty(b.monthlyQty),
      0,
    );

    expect(acquisition).toBeCloseTo(13002.19, 2);
    expect(dashboard.totalCosts).toBe(500);
    expect(dashboard.totalExpenses).toBe(1000);
    expect(dashboard.totalAcquisitionCost).toBeCloseTo(13002.19, 2);
    expect(dashboard.totalMaterialCost).toBeCloseTo(materialMonthly, 2);
    expect(dashboard.totalConsolidatedCosts).toBeCloseTo(500 + 1000 + materialMonthly, 2);
    expect(dashboard.totalConsolidatedCosts).toBeLessThan(500 + 1000 + acquisition);

    const paOnly = computeDashboardSummary(
      breakdowns.filter((b) => b.name === 'PUDIM'),
      workspace,
    );
    const paMaterial =
      breakdowns.find((b) => b.name === 'PUDIM')!.materialCost *
      effectiveProjectionQty(breakdowns.find((b) => b.name === 'PUDIM')!.monthlyQty);
    expect(paOnly.totalCosts).toBe(500);
    expect(paOnly.totalExpenses).toBe(1000);
    expect(paOnly.totalMaterialCost).toBeCloseTo(paMaterial, 2);
    expect(paOnly.totalConsolidatedCosts).toBeCloseTo(500 + 1000 + paMaterial, 2);
  });
});
