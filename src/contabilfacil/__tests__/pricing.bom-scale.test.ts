import { describe, expect, it } from 'vitest';
import {
  applyRecipeScaleFromBaseline,
  computeMaterialCost,
  computePricingBreakdowns,
  resolveRecipeQuantityBase,
  recipeDoublesToScaleFactor,
  scaleBomRecipe,
  stockItemWithAppliedRecipeDoubles,
  stockItemWithRecipeScale,
  tryRecoverInflatedRecipeBase,
} from '../logic/pricingCalculator';
import {
  createDefaultPricingWorkspace,
  createEmptyStockItem,
  normalizeStockItem,
} from '../logic/pricingTypes';

describe('scaleBomRecipe', () => {
  it('multiplica quantidades da BOM e qtd produzida pelo mesmo fator', () => {
    const scaled = scaleBomRecipe(
      [
        { stockItemId: 'a', quantity: 3, unit: 'un' },
        { stockItemId: 'b', quantity: 0.5, unit: 'kg' },
      ],
      7,
      2,
    );
    expect(scaled.productionQty).toBe(14);
    expect(scaled.bom[0]!.quantity).toBe(6);
    expect(scaled.bom[1]!.quantity).toBe(1);
  });

  it('custo por unidade do produto permanece igual após escalar a receita', () => {
    const farinha = createEmptyStockItem('Empresa', 'materia_prima');
    farinha.id = 'mp1';
    farinha.name = 'Farinha';
    farinha.purchasePrice = 10;
    farinha.unitsPurchased = 1;
    farinha.measureQuantity = 1;
    farinha.packageUnit = 'kg';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'PUDIM';
    pa.useBom = true;
    pa.monthlyQty = 7;
    pa.bom = [{ stockItemId: 'mp1', quantity: 0.2, unit: 'kg' }];

    const items = [normalizeStockItem(farinha), normalizeStockItem(pa)];
    const stockById = new Map(items.map((s) => [s.id, s]));

    const before = computeMaterialCost(items[1]!, stockById);
    const after = computeMaterialCost(items[1]!, stockById);

    expect(before.cost).toBeCloseTo(after.cost, 6);
    const scaled = scaleBomRecipe(pa.bom, pa.monthlyQty, 2);
    expect(scaled.productionQty).toBe(14);
    expect(scaled.bom[0]!.quantity).toBeCloseTo(0.4, 4);
  });

  it('aplicar o mesmo fator duas vezes a partir da base não acumula', () => {
    const baseline = {
      bom: [{ stockItemId: 'a', quantity: 2, unit: 'un' as const }],
      productionQty: 5,
    };
    const once = applyRecipeScaleFromBaseline(baseline, 2);
    const twice = applyRecipeScaleFromBaseline(baseline, 2);
    expect(twice).toEqual(once);
    expect(twice.productionQty).toBe(10);
    expect(twice.bom[0]!.quantity).toBe(4);
  });

  it('fator 1 restaura a receita base', () => {
    const baseline = {
      bom: [{ stockItemId: 'a', quantity: 3, unit: 'un' as const }],
      productionQty: 7,
    };
    const scaled = applyRecipeScaleFromBaseline(baseline, 3);
    const restored = applyRecipeScaleFromBaseline(baseline, 1);
    expect(restored).toEqual(baseline);
    expect(scaled.productionQty).toBe(21);
  });

  it('recupera composição salva com fator inteiro uniforme', () => {
    const base = {
      bom: [{ stockItemId: 'a', quantity: 7000, unit: 'ml' as const }],
      productionQty: 7,
    };
    const inflated = applyRecipeScaleFromBaseline(base, 8);
    const recovered = tryRecoverInflatedRecipeBase(inflated.bom, inflated.productionQty);
    expect(recovered?.recoveredFactor).toBe(8);
    expect(recovered?.bom[0]!.quantity).toBe(7000);
    expect(recovered?.productionQty).toBe(7);
  });

  it('recipeDoublesToScaleFactor: 1 vez em dobro = ×2, 2 vezes = ×4', () => {
    expect(recipeDoublesToScaleFactor(0)).toBe(1);
    expect(recipeDoublesToScaleFactor(1)).toBe(2);
    expect(recipeDoublesToScaleFactor(2)).toBe(4);
    expect(recipeDoublesToScaleFactor(3)).toBe(8);
  });

  it('stockItemWithAppliedRecipeDoubles usa doubles salvo mesmo fora do editor', () => {
    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'PUDIM';
    pa.useBom = true;
    pa.monthlyQty = 7;
    pa.bom = [{ stockItemId: 'mp1', quantity: 2, unit: 'un' }];
    pa.recipeQuantityBaseBom = pa.bom;
    pa.recipeQuantityBaseProductionQty = 7;
    pa.recipeQuantityDoubles = 1;
    const normalized = normalizeStockItem(pa);
    const shown = stockItemWithAppliedRecipeDoubles(normalized, null, 0, new Map());
    expect(shown.monthlyQty).toBe(7);
    expect(shown.bom[0]!.quantity).toBe(4);
  });

  it('stockItemWithRecipeScale reflete fator na qtd produzida e BOM para exibição', () => {
    const base = {
      bom: [{ stockItemId: 'a', quantity: 2, unit: 'un' as const }],
      productionQty: 7,
    };
    const item = {
      id: 'pa',
      category: 'produto_acabado' as const,
      useBom: true,
      bom: base.bom,
      monthlyQty: 7,
    };
    const shown = stockItemWithRecipeScale(item, base, 5);
    expect(shown.monthlyQty).toBe(7);
    expect(shown.bom[0]!.quantity).toBe(10);
  });

  it('vezes em dobro altera qtd/mês e receita na precificação', () => {
    const leite = createEmptyStockItem('Empresa', 'materia_prima');
    leite.id = 'mp1';
    leite.purchasePrice = 10;
    leite.unitsPurchased = 1;
    leite.measureQuantity = 1;
    leite.packageUnit = 'kg';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.id = 'pa1';
    pa.useBom = true;
    pa.monthlyQty = 7;
    pa.recipeQuantityBaseProductionQty = 7;
    pa.recipeQuantityBaseBom = [{ stockItemId: 'mp1', quantity: 0.2, unit: 'kg' }];
    pa.recipeQuantityDoubles = 1;
    pa.bom = [{ stockItemId: 'mp1', quantity: 0.2, unit: 'kg' }];

    const ws = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [normalizeStockItem(leite), normalizeStockItem(pa)],
      settings: {
        markupPercent: 0,
        marginPercent: 0,
        mode: 'markup_only' as const,
        costAllocationMode: 'por_volume' as const,
      },
    };
    const base = computePricingBreakdowns({
      ...ws,
      stockItems: [
        normalizeStockItem(leite),
        normalizeStockItem({ ...pa, recipeQuantityDoubles: 0 }),
      ],
    })[0]!;
    const doubled = computePricingBreakdowns(ws)[0]!;
    expect(doubled.monthlyQty).toBe(14);
    expect(doubled.materialCost).toBeCloseTo(base.materialCost, 4);
    expect(doubled.pricedUnitPrice).toBeCloseTo(base.pricedUnitPrice, 4);
    expect(doubled.allocatedCosts).toBeCloseTo(base.allocatedCosts, 4);
    expect(doubled.allocatedExpenses).toBeCloseTo(base.allocatedExpenses, 4);
    expect(doubled.allocationShare).toBeCloseTo(base.allocationShare, 4);
    expect(doubled.pricedMonthlyTotal).toBeCloseTo(doubled.pricedUnitPrice * 14, 2);
    expect(doubled.pricedMonthlyTotal).toBeCloseTo(base.pricedUnitPrice * 14, 2);
    expect(doubled.pricedMonthlyTotal).toBeGreaterThan(base.pricedMonthlyTotal);
  });

  it('resolveRecipeQuantityBase prioriza recipeQuantityBaseBom salvo', () => {
    const resolved = resolveRecipeQuantityBase({
      bom: [{ stockItemId: 'a', quantity: 999, unit: 'ml' as const }],
      monthlyQty: 99,
      recipeQuantityBaseBom: [{ stockItemId: 'a', quantity: 140, unit: 'ml' as const }],
      recipeQuantityBaseProductionQty: 7,
    });
    expect(resolved.bom[0]!.quantity).toBe(140);
    expect(resolved.productionQty).toBe(7);
  });

});
