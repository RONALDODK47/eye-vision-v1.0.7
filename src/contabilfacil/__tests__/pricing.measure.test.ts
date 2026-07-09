import { describe, expect, it } from 'vitest';
import {
  applyStockMaterialShortfallsToItems,
  bomLineCost,
  compatibleBomUnitsForStock,
  computeMaterialCost,
  computeStockRemainingAfterBom,
  defaultBomUnitForStock,
  measureProrationCost,
  stockItemWithRecipeScale,
  validateBomMaterialCoverage,
  collectWorkspaceMaterialShortages,
  resolveReplenishShortageForStockItem,
  stockItemDepletedByBom,
} from '../logic/pricingCalculator';
import {
  STOCK_MEASURE_UNIT_OPTIONS,
  createEmptyStockItem,
  normalizeStockItem,
  stockTotalMeasure,
} from '../logic/pricingTypes';

describe('pricing measure cm/m', () => {
  it('dropdown de estoque inclui un, cm e m', () => {
    expect(STOCK_MEASURE_UNIT_OPTIONS).toContain('un');
    expect(STOCK_MEASURE_UNIT_OPTIONS).toContain('cm');
    expect(STOCK_MEASURE_UNIT_OPTIONS).toContain('m');
    expect(STOCK_MEASURE_UNIT_OPTIONS.indexOf('un')).toBe(0);
  });

  it('BOM lista todas as unidades incluindo unidade', () => {
    const filme = createEmptyStockItem('Empresa', 'insumo');
    filme.packageUnit = 'm';
    expect(compatibleBomUnitsForStock(filme)).toContain('un');
    expect(compatibleBomUnitsForStock(filme)).toContain('cm');
    expect(compatibleBomUnitsForStock(filme)).toContain('kg');
    expect(defaultBomUnitForStock(filme)).toBe('cm');
  });

  it('rateia custo do rolo por centímetros usados na composição', () => {
    const filme = createEmptyStockItem('Empresa', 'insumo');
    filme.name = 'Papel filme';
    filme.unitPrice = 150;
    filme.unitsPurchased = 1;
    filme.measureQuantity = 300;
    filme.packageUnit = 'm';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.useBom = true;
    pa.bom = [{ stockItemId: filme.id, quantity: 50, unit: 'cm' }];

    const stock = normalizeStockItem(filme);
    const stockById = new Map([[stock.id, stock]]);

    expect(measureProrationCost(stock, 50, 'cm')).toBeCloseTo(0.25, 4);
    expect(bomLineCost(stockById, 50, 'cm', stock.id)).toBeCloseTo(0.25, 4);

    const material = computeMaterialCost(pa, stockById);
    expect(material.cost).toBeCloseTo(0.25, 4);
  });

  it('395 g/un × 24 un: usar 395 g na BOM desconta só uma porção do total', () => {
    const leite = createEmptyStockItem('Empresa', 'insumo');
    leite.id = 'leite-1';
    leite.name = 'Leite condensado';
    leite.unitsPurchased = 24;
    leite.measureQuantity = 395;
    leite.packageUnit = 'g';
    leite.unitPrice = 5;
    leite.purchasePrice = 120;

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.id = 'pa-1';
    pa.useBom = true;
    pa.bom = [{ stockItemId: 'leite-1', quantity: 395, unit: 'g' }];

    const stock = normalizeStockItem(leite);
    expect(stockTotalMeasure(stock)).toBe(9480);

    const allItems = [stock, pa];
    const remaining = computeStockRemainingAfterBom(stock, allItems);

    expect(remaining.measureTotal).toBeCloseTo(9085, 4);
    expect(remaining.measurePerUnit).toBeCloseTo(9085 / 24, 4);
    expect(remaining.valueTotal).toBeCloseTo(120 * (9085 / 9480), 2);
  });

  it('receita em dobro na BOM do PA dobra o uso do insumo no restante', () => {
    const leite = createEmptyStockItem('Empresa', 'insumo');
    leite.id = 'leite-1';
    leite.unitsPurchased = 24;
    leite.measureQuantity = 395;
    leite.packageUnit = 'g';
    leite.unitPrice = 5;
    leite.purchasePrice = 120;

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.id = 'pa-1';
    pa.useBom = true;
    pa.bom = [{ stockItemId: 'leite-1', quantity: 395, unit: 'g' }];

    const stock = normalizeStockItem(leite);
    const base = { bom: pa.bom, productionQty: pa.monthlyQty };
    const paDobrado = stockItemWithRecipeScale(pa, base, 2);
    const remainingBase = computeStockRemainingAfterBom(stock, [stock, pa]);
    const remainingDobro = computeStockRemainingAfterBom(stock, [stock, paDobrado]);

    expect(remainingDobro.measureTotal).toBeCloseTo(remainingBase.measureTotal - 395, 4);
    expect(remainingDobro.usedCostTotal).toBeCloseTo(remainingBase.usedCostTotal * 2, 2);
  });

  it('3 un de ovo: 12 un a R$ 15 — custo na BOM = 3/12 × 15', () => {
    const ovo = createEmptyStockItem('Empresa', 'insumo');
    ovo.id = 'ovo-1';
    ovo.name = 'Ovo';
    ovo.unitsPurchased = 1;
    ovo.measureQuantity = 12;
    ovo.packageUnit = 'un';
    ovo.unitPrice = 15;
    ovo.purchasePrice = 15;

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.id = 'pa-1';
    pa.useBom = true;
    pa.bom = [{ stockItemId: 'ovo-1', quantity: 3, unit: 'un' }];

    const stock = normalizeStockItem(ovo);
    const stockById = new Map([[stock.id, stock]]);

    expect(bomLineCost(stockById, 3, 'un', stock.id)).toBeCloseTo(3.75, 4);

    const material = computeMaterialCost(pa, stockById);
    expect(material.cost).toBeCloseTo(3.75, 4);
  });

  it('3 un de ovo: 12 un compradas a R$ 15 total (sem medida/un) — ainda rateia', () => {
    const ovo = createEmptyStockItem('Empresa', 'insumo');
    ovo.id = 'ovo-2';
    ovo.unitsPurchased = 12;
    ovo.unitPrice = 1.25;
    ovo.purchasePrice = 15;

    const stock = normalizeStockItem(ovo);
    const stockById = new Map([[stock.id, stock]]);

    expect(bomLineCost(stockById, 3, 'un', stock.id)).toBeCloseTo(3.75, 4);
  });

  it('resolveReplenishShortageForStockItem quando estoque físico zerou mas cobertura não lista falta', () => {
    const leite = createEmptyStockItem('Empresa', 'insumo');
    leite.id = 'leite-1';
    leite.name = 'leite condensado';
    leite.unitsPurchased = 1;
    leite.measureQuantity = 395;
    leite.packageUnit = 'ml';
    leite.unitPrice = 10;
    leite.purchasePrice = 10;

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.id = 'pa-1';
    pa.useBom = true;
    pa.monthlyQty = 1;
    pa.recipeYieldQty = 1;
    pa.bom = [{ stockItemId: leite.id, quantity: 395, unit: 'ml' }];
    pa.recipeQuantityBaseBom = pa.bom;
    pa.recipeQuantityBaseProductionQty = 1;

    const leiteNorm = normalizeStockItem(leite);
    const all = [{ ...leiteNorm, packageSize: 0 }, normalizeStockItem(pa)];
    expect(stockItemDepletedByBom(all[0]!, all)).toBe(true);
    const listed = collectWorkspaceMaterialShortages(all).find((s) => s.stockItemId === leite.id);
    expect(listed?.shortfallQty).toBeGreaterThan(0);

    const resolved = resolveReplenishShortageForStockItem(all[0]!, all);
    expect(resolved?.shortfallQty).toBeGreaterThan(0);
    expect(resolved?.shortfallLabel.length).toBeGreaterThan(0);
  });

  it('stockItemDepletedByBom quando estoque físico zerou e há uso na composição', () => {
    const emb = createEmptyStockItem('Empresa', 'insumo');
    emb.id = 'emb';
    emb.unitsPurchased = 10;
    emb.measureQuantity = 3;
    emb.packageUnit = 'g';
    emb.purchasePrice = 18.6;

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.id = 'pa';
    pa.useBom = true;
    pa.monthlyQty = 120;
    pa.recipeYieldQty = 12;
    pa.bom = [{ stockItemId: emb.id, quantity: 3, unit: 'g' }];
    pa.recipeQuantityBaseBom = pa.bom;
    pa.recipeQuantityBaseProductionQty = 12;

    const embNorm = normalizeStockItem(emb);
    const all = [{ ...embNorm, packageSize: 0 }, normalizeStockItem(pa)];
    expect(stockItemDepletedByBom(all[0]!, all)).toBe(true);
  });

  it('3 ovos (un) de 80 un a R$ 100 não podem custar R$ 78,75 na composição', () => {
    const ovo = createEmptyStockItem('Empresa', 'insumo');
    ovo.id = 'ovo-un';
    ovo.unitsPurchased = 80;
    ovo.measureQuantity = 62.857 / 80;
    ovo.packageUnit = 'g';
    ovo.purchasePrice = 100;
    ovo.unitPrice = 1.25;

    const stock = normalizeStockItem(ovo);
    const stockById = new Map([[stock.id, stock]]);

    expect(bomLineCost(stockById, 3, 'un', stock.id)).toBeCloseTo(3.75, 2);
    expect(bomLineCost(stockById, 3, 'un', stock.id)).toBeLessThan(10);
  });

  it('ovo em g na BOM: valor no catálogo cai e alerta some após repor falta', () => {
    const ovo = createEmptyStockItem('Empresa', 'insumo');
    ovo.id = 'ovo-g';
    ovo.name = 'ovo';
    ovo.unitsPurchased = 80;
    ovo.measureQuantity = 62.857 / 80;
    ovo.packageUnit = 'g';
    ovo.purchasePrice = 100;
    ovo.unitPrice = 1.25;

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.id = 'pa-1';
    pa.useBom = true;
    pa.monthlyQty = 80;
    pa.recipeYieldQty = 12;
    pa.bom = [{ stockItemId: ovo.id, quantity: 10, unit: 'g' }];
    pa.recipeQuantityBaseBom = pa.bom;
    pa.recipeQuantityBaseProductionQty = 12;

    const stock = normalizeStockItem(ovo);
    const paNorm = normalizeStockItem(pa);
    const allItems = [stock, paNorm];

    const before = computeStockRemainingAfterBom(stock, allItems);
    expect(before.usage.lines.length).toBeGreaterThan(0);
    expect(before.valueTotal).toBeLessThan(100);

    const coverage = validateBomMaterialCoverage(paNorm, allItems);
    expect(coverage.ok).toBe(false);
    const shortfall = coverage.shortages.find((s) => s.stockItemId === ovo.id);
    expect(shortfall?.shortfallQty).toBeGreaterThan(0);

    const restocked = applyStockMaterialShortfallsToItems(allItems, [
      { stockItemId: ovo.id, shortfallQty: shortfall!.shortfallQty },
    ]);
    const ovoAfter = restocked.find((s) => s.id === ovo.id)!;
    const allAfter = [ovoAfter, paNorm];
    const after = computeStockRemainingAfterBom(ovoAfter, allAfter);
    const coverageAfter = validateBomMaterialCoverage(paNorm, allAfter);

    expect(coverageAfter.ok).toBe(true);
    expect(coverageAfter.shortages).toHaveLength(0);
    expect(before.valueTotal).toBeLessThan(100);
    expect(before.usage.lines.length).toBeGreaterThan(0);
  });

  it('divide custo total da composição pela qtd produzida', () => {
    const ovo = createEmptyStockItem('Empresa', 'insumo');
    ovo.id = 'ovo-1';
    ovo.unitsPurchased = 1;
    ovo.measureQuantity = 12;
    ovo.packageUnit = 'un';
    ovo.purchasePrice = 15;

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.useBom = true;
    pa.bom = [{ stockItemId: 'ovo-1', quantity: 3, unit: 'un' }];

    const stock = normalizeStockItem(ovo);
    const stockById = new Map([[stock.id, stock]]);

    const material = computeMaterialCost(normalizeStockItem(pa), stockById);
    expect(material.compositionTotal).toBeCloseTo(3.75, 4);
    expect(material.cost).toBeCloseTo(3.75, 4);
  });
});
