import { describe, expect, it } from 'vitest';
import {
  computeStockBomMeasureUsage,
  formatStockMaterialDemandLabel,
  maxFinishedUnitsFromCurrentStock,
  recipeBatchesPerMonth,
  resolveFinishedProductionTarget,
  resolveMaterialDemandFinishedUnits,
  resolveRecipeBatchYield,
  validateBomMaterialCoverage,
} from '../logic/pricingCalculator';
import { createEmptyStockItem, normalizeStockItem, type BomLine } from '../logic/pricingTypes';

describe('validateBomMaterialCoverage', () => {
  it('detecta falta de MP quando qtd/mês exige mais receitas que o estoque', () => {
    const leite = createEmptyStockItem('Empresa', 'materia_prima');
    leite.name = 'Leite';
    leite.purchasePrice = 5;
    leite.unitsPurchased = 1;
    leite.measureQuantity = 1000;
    leite.packageUnit = 'ml';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'Pudim';
    pa.useBom = true;
    pa.recipeYieldQty = 7;
    pa.monthlyQty = 200;
    pa.recipeQuantityBaseBom = [{ stockItemId: leite.id, quantity: 395, unit: 'ml' }];
    pa.recipeQuantityBaseProductionQty = 7;
    const bom: BomLine[] = [{ stockItemId: leite.id, quantity: 395, unit: 'ml' }];
    pa.bom = bom;

    const items = [normalizeStockItem(leite), normalizeStockItem(pa)];
    const product = items[1]!;

    expect(resolveRecipeBatchYield(product)).toBe(7);
    expect(recipeBatchesPerMonth(product)).toBeCloseTo(200 / 7, 5);
    expect(resolveMaterialDemandFinishedUnits(product)).toBe(200);
    expect(resolveFinishedProductionTarget(product)).toBe(200);

    const result = validateBomMaterialCoverage(product, items);
    expect(result.ok).toBe(false);
    expect(result.monthlyQty).toBe(200);
    expect(result.targetFinishedQty).toBe(200);
    expect(result.maxFinishedFromStock).toBeCloseTo(17.72, 1);
    expect(maxFinishedUnitsFromCurrentStock(product, items)).toBeCloseTo(17.72, 1);
    expect(result.shortages.length).toBeGreaterThan(0);
    expect(result.shortages[0]?.stockItemId).toBe(leite.id);
  });

  it('maxFinishedFromStock com meta 40 un/mês e leite 1580 g', () => {
    const leite = createEmptyStockItem('Empresa', 'insumo');
    leite.name = 'Leite condensado';
    leite.unitsPurchased = 1;
    leite.measureQuantity = 1580;
    leite.packageUnit = 'g';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'Pudim';
    pa.useBom = true;
    pa.recipeYieldQty = 7;
    pa.monthlyQty = 40;
    const bom: BomLine[] = [{ stockItemId: leite.id, quantity: 395, unit: 'g' }];
    pa.bom = bom;
    pa.recipeQuantityBaseBom = bom;
    pa.recipeQuantityBaseProductionQty = 7;

    const items = [normalizeStockItem(leite), normalizeStockItem(pa)];
    const result = validateBomMaterialCoverage(items[1]!, items);
    expect(result.maxFinishedFromStock).toBe(28);
    expect(result.monthlyQty).toBe(40);
    expect(result.ok).toBe(false);
  });

  it('alerta mostra medida e unidades compradas', () => {
    const leite = createEmptyStockItem('Empresa', 'insumo');
    leite.name = 'Leite condensado';
    leite.unitsPurchased = 1;
    leite.measureQuantity = 1580;
    leite.packageUnit = 'g';

    expect(formatStockMaterialDemandLabel(normalizeStockItem(leite), 1580)).toBe('1580 g (1 un)');
    expect(formatStockMaterialDemandLabel(normalizeStockItem(leite), 677.143)).toMatch(/677.*g.*0\.43 un/);
  });

  it('ok quando qtd/mês cabe no estoque para as receitas do rendimento', () => {
    const leite = createEmptyStockItem('Empresa', 'materia_prima');
    leite.name = 'Leite';
    leite.purchasePrice = 5;
    leite.unitsPurchased = 1;
    leite.measureQuantity = 10000;
    leite.packageUnit = 'ml';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'Pudim';
    pa.useBom = true;
    pa.recipeYieldQty = 7;
    pa.monthlyQty = 7;
    const bom: BomLine[] = [{ stockItemId: leite.id, quantity: 395, unit: 'ml' }];
    pa.bom = bom;
    pa.recipeQuantityBaseBom = bom;
    pa.recipeQuantityBaseProductionQty = 7;

    const items = [normalizeStockItem(leite), normalizeStockItem(pa)];
    const result = validateBomMaterialCoverage(items[1]!, items);
    expect(result.ok).toBe(true);
    expect(result.shortages).toHaveLength(0);
  });

  it('detecta falta quando rendimento sobe sem ajustar a composição', () => {
    const ovos = createEmptyStockItem('Empresa', 'insumo');
    ovos.name = 'Ovos';
    ovos.purchasePrice = 12;
    ovos.unitsPurchased = 12;
    ovos.packageUnit = 'un';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'Bolo';
    pa.useBom = true;
    pa.recipeYieldQty = 14;
    pa.monthlyQty = 0;
    const bom: BomLine[] = [{ stockItemId: ovos.id, quantity: 7, unit: 'un' }];
    pa.bom = bom;
    pa.recipeQuantityBaseBom = bom;
    pa.recipeQuantityBaseProductionQty = 7;

    const items = [normalizeStockItem(ovos), normalizeStockItem(pa)];
    const result = validateBomMaterialCoverage(items[1]!, items);
    expect(result.ok).toBe(false);
    expect(result.scaleFactor).toBeCloseTo(2, 5);
    expect(result.targetFinishedQty).toBe(14);
  });

  it('computeStockBomMeasureUsage desconta insumo pela qtd/mês ÷ rendimento', () => {
    const leite = createEmptyStockItem('Empresa', 'materia_prima');
    leite.name = 'Leite';
    leite.purchasePrice = 10;
    leite.unitsPurchased = 1;
    leite.measureQuantity = 10000;
    leite.packageUnit = 'ml';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'Pudim';
    pa.useBom = true;
    pa.recipeYieldQty = 7;
    pa.monthlyQty = 14;
    pa.bom = [{ stockItemId: leite.id, quantity: 700, unit: 'ml' }];

    const items = [normalizeStockItem(leite), normalizeStockItem(pa)];
    const usage = computeStockBomMeasureUsage(items[0]!, items);
    expect(usage.lines[0]?.quantityInItemUnit).toBeCloseTo(1400, 2);
    expect(usage.remainingTotal).toBeCloseTo(8600, 2);
  });
});
