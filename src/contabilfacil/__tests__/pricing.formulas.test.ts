import { describe, expect, it } from 'vitest';
import {
  bomStoredAsMonthlyBatch,
  computePricingBreakdowns,
  priceFromMargin,
  priceFromMarkup,
  priceFromMarkupAndMargin,
  resolvePricingMaterialUnitCost,
  resolveSellingUnitPrice,
} from '../logic/pricingCalculator';
import { pricingRowArithmeticCheck } from '../logic/pricingPrecificacaoTable';
import {
  createDefaultPricingWorkspace,
  createEmptyStockItem,
  normalizeStockItem,
} from '../logic/pricingTypes';

describe('fórmulas de precificação — invariantes', () => {
  it('markup, margem e modo both seguem as fórmulas documentadas', () => {
    const cost = 10;
    expect(priceFromMarkup(cost, 50)).toBeCloseTo(15, 4);
    expect(priceFromMargin(cost, 50)).toBeCloseTo(20, 4);
    expect(priceFromMarkupAndMargin(cost, 33.3, 25)).toBeCloseTo((10 * 1.333) / 0.75, 2);
    expect(resolveSellingUnitPrice(cost, { markupPercent: 50, marginPercent: 0, mode: 'markup_only' })).toBe(15);
    expect(resolveSellingUnitPrice(cost, { markupPercent: 0, marginPercent: 50, mode: 'margin_only' })).toBe(20);
  });

  it('bomStoredAsMonthlyBatch distingue lote do mês vs receita ×1', () => {
    const batchBom = [{ stockItemId: 'mp', quantity: 7, unit: 'un' as const }];
    const unitBom = [{ stockItemId: 'leite', quantity: 395, unit: 'ml' as const }];
    expect(bomStoredAsMonthlyBatch(batchBom, 14.82, 14.82, 7)).toBe(true);
    expect(bomStoredAsMonthlyBatch(unitBom, 1.97, 1.97, 7)).toBe(false);
    expect(bomStoredAsMonthlyBatch(batchBom, 2.12, 2.12, 1)).toBe(false);
  });

  it('linha completa: preço = f(custo total); venda total = preço × qtd; rateio estável com dobro', () => {
    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'PUDIM';
    pa.useBom = false;
    pa.directCost = 2.19;
    pa.monthlyQty = 7;
    pa.recipeQuantityDoubles = 1;

    const ws = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [normalizeStockItem(pa)],
      costExpenses: [
        {
          id: 'd1',
          companyName: 'Empresa',
          segment: 'produto_acabado' as const,
          type: 'despesa' as const,
          name: 'Fixo',
          category: '',
          notes: '',
          monthlyAmount: 178.3,
          createdAt: new Date().toISOString(),
        },
      ],
      settings: {
        markupPercent: 0,
        marginPercent: 50,
        mode: 'margin_only' as const,
        costAllocationMode: 'por_unidades_mes' as const,
      },
    };

    const row = computePricingBreakdowns(ws)[0]!;
    const base = computePricingBreakdowns({
      ...ws,
      stockItems: [normalizeStockItem({ ...pa, recipeQuantityDoubles: 0 })],
    })[0]!;

    expect(row.materialCost).toBeCloseTo(2.19, 2);
    expect(row.pricedUnitPrice).toBeCloseTo(priceFromMargin(row.totalUnitCost, 50), 2);
    expect(row.pricedUnitPrice).toBeCloseTo(base.pricedUnitPrice, 4);
    expect(row.allocatedExpenses).toBeCloseTo(base.allocatedExpenses, 4);
    expect(row.allocationShare).toBeCloseTo(base.allocationShare, 4);
    expect(row.monthlyQty).toBe(14);
    expect(pricingRowArithmeticCheck(row, 14).matches).toBe(true);
    expect(row.pricedMonthlyTotal).toBeCloseTo(row.pricedUnitPrice * 14, 2);
    expect(row.pricedMonthlyTotal).toBeGreaterThan(base.pricedMonthlyTotal);
  });

  it('cenário pudim: markup 30% sobre custo total/un., não só material', () => {
    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'PUDIM';
    pa.useBom = false;
    pa.directCost = 2.12;
    pa.monthlyQty = 7;

    const ws = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [normalizeStockItem(pa)],
      costExpenses: [
        {
          id: 'c1',
          companyName: 'Empresa',
          segment: 'produto_acabado' as const,
          type: 'custo' as const,
          name: 'Fixo',
          category: '',
          notes: '',
          monthlyAmount: 198.3,
          createdAt: new Date().toISOString(),
        },
      ],
      settings: {
        markupPercent: 30,
        marginPercent: 0,
        mode: 'markup_only' as const,
        costAllocationMode: 'por_unidades_mes' as const,
      },
    };

    const row = computePricingBreakdowns(ws)[0]!;
    expect(row.materialCost).toBeCloseTo(2.12, 2);
    expect(row.totalUnitCost).toBeCloseTo(2.12 + 198.3 / 7, 1);
    expect(row.pricedUnitPrice).toBeCloseTo(row.totalUnitCost * 1.3, 1);
    expect(row.pricedUnitPrice).toBeGreaterThan(35);
    expect(row.profitPerUnit).toBeGreaterThan(0);
  });

  it('BOM lote ÷ qtd base = material/un.; preço usa custo total', () => {
    const mp = createEmptyStockItem('Empresa', 'materia_prima');
    mp.purchasePrice = 14.82;
    mp.unitsPurchased = 7;
    mp.measureQuantity = 1;
    mp.packageUnit = 'un';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.useBom = true;
    pa.monthlyQty = 7;
    pa.recipeYieldQty = 7;
    pa.bom = [{ stockItemId: mp.id, quantity: 7, unit: 'un' }];

    const stockById = new Map([
      [mp.id, normalizeStockItem(mp)],
      [pa.id, normalizeStockItem(pa)],
    ]);
    const ws = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [...stockById.values()],
      settings: {
        ...createDefaultPricingWorkspace('Empresa').settings,
        marginPercent: 40,
        mode: 'margin_only' as const,
      },
    };

    const unit = resolvePricingMaterialUnitCost(stockById.get(pa.id)!, stockById, ws);
    expect(unit).toBeCloseTo(14.82 / 7, 2);

    const row = computePricingBreakdowns(ws)[0]!;
    expect(row.materialCost).toBeCloseTo(unit, 4);
    expect(row.pricedUnitPrice).toBeCloseTo(priceFromMargin(row.totalUnitCost, 40), 2);
  });
});
