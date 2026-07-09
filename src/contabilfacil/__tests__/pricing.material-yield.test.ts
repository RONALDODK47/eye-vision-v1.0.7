import { describe, expect, it } from 'vitest';
import { pricingMaterialUnitCost } from '../logic/pricingPrecificacaoTable';
import {
  bomLineCost,
  compositionCostSummary,
  compositionCostSummaryForStockItem,
  compositionMaterialTotalFromBom,
  computeMaterialCost,
  computePricingBreakdowns,
  effectiveMonthlyQtyForPricing,
  materialUnitCostFromCompositionTotal,
  monthlyQtyLooksLikeRecipeYield,
  priceFromMargin,
  resolvePricingMaterialUnitCost,
} from '../logic/pricingCalculator';
import {
  createDefaultPricingWorkspace,
  createEmptyStockItem,
  normalizeStockItem,
  type BomLine,
} from '../logic/pricingTypes';

describe('material e qtd/mês (sem rendimento)', () => {
  it('material por unidade = soma da BOM ÷ qtd/mês (igual ao editor)', () => {
    const leite = createEmptyStockItem('Empresa', 'materia_prima');
    leite.name = 'Leite';
    leite.purchasePrice = 5;
    leite.unitsPurchased = 1;
    leite.measureQuantity = 1000;
    leite.packageUnit = 'ml';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'PUDIM';
    pa.useBom = true;
    pa.monthlyQty = 7;
    const bom: BomLine[] = [{ stockItemId: leite.id, quantity: 395, unit: 'ml' }];
    pa.bom = bom;

    const stockById = new Map([
      [leite.id, normalizeStockItem(leite)],
      [pa.id, normalizeStockItem(pa)],
    ]);
    const normalized = stockById.get(pa.id)!;
    const { cost, compositionTotal, detail } = computeMaterialCost(normalized, stockById);

    const ws = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [stockById.get(leite.id)!, stockById.get(pa.id)!],
    };
    const unit = resolvePricingMaterialUnitCost(normalized, stockById, ws);
    expect(unit).toBeCloseTo(cost, 2);
    expect(unit).toBeGreaterThan(0.2);
  });

  it('override de qtd base + vezes em dobro usa a mesma qtd no rateio e na tabela', () => {
    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'PUDIM';
    pa.useBom = true;
    pa.bom = [];
    pa.directCost = 2;
    pa.monthlyQty = 112;
    pa.recipeQuantityDoubles = 1;

    const ws = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [normalizeStockItem(pa)],
      productOverrides: {
        [pa.id]: { monthlyQty: 112 },
      },
      settings: {
        markupPercent: 0,
        marginPercent: 0,
        mode: 'markup_only' as const,
        costAllocationMode: 'por_unidades_mes' as const,
      },
    };

    const row = computePricingBreakdowns(ws)[0]!;
    expect(row.monthlyQty).toBe(224);
    expect(row.pricedMonthlyTotal).toBeCloseTo(row.pricedUnitPrice * 224, 2);
  });

  it('custo unitário = custo material total ÷ qtd/mês', () => {
    const mp = createEmptyStockItem('Empresa', 'materia_prima');
    mp.name = 'Mix';
    mp.purchasePrice = 14.82;
    mp.unitsPurchased = 7;
    mp.measureQuantity = 1;
    mp.packageUnit = 'un';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'PUDIM';
    pa.useBom = true;
    pa.monthlyQty = 7;
    pa.recipeYieldQty = 7;
    pa.bom = [{ stockItemId: mp.id, quantity: 7, unit: 'un' }];

    const stockById = new Map([
      [mp.id, normalizeStockItem(mp)],
      [pa.id, normalizeStockItem(pa)],
    ]);
    const total = compositionMaterialTotalFromBom(pa.bom, stockById);
    expect(total).toBeCloseTo(14.82, 2);
    expect(materialUnitCostFromCompositionTotal(total, 7)).toBeCloseTo(14.82 / 7, 2);
  });

  it('resolvePricingMaterialUnitCost divide total da BOM pela qtd/mês (lote)', () => {
    const mp = createEmptyStockItem('Empresa', 'materia_prima');
    mp.name = 'Mix';
    mp.purchasePrice = 14.82;
    mp.unitsPurchased = 7;
    mp.measureQuantity = 1;
    mp.packageUnit = 'un';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'PUDIM';
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
      stockItems: [stockById.get(mp.id)!, stockById.get(pa.id)!],
    };
    expect(resolvePricingMaterialUnitCost(stockById.get(pa.id)!, stockById, ws)).toBeCloseTo(
      14.82 / 7,
      2,
    );
  });

  it('BOM salva como lote com base ×1 ainda usa total ÷ qtd na precificação', () => {
    const mp = createEmptyStockItem('Empresa', 'materia_prima');
    mp.name = 'Mix';
    mp.purchasePrice = 15.33;
    mp.unitsPurchased = 7;
    mp.measureQuantity = 1;
    mp.packageUnit = 'un';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'PUDIM';
    pa.useBom = true;
    pa.monthlyQty = 7;
    pa.recipeYieldQty = 7;
    pa.bom = [{ stockItemId: mp.id, quantity: 7, unit: 'un' }];
    pa.recipeQuantityBaseBom = [{ stockItemId: mp.id, quantity: 1, unit: 'un' }];
    pa.recipeQuantityBaseProductionQty = 7;

    const stockById = new Map([
      [mp.id, normalizeStockItem(mp)],
      [pa.id, normalizeStockItem(pa)],
    ]);
    const ws = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [stockById.get(mp.id)!, stockById.get(pa.id)!],
    };
    const row = computePricingBreakdowns(ws)[0]!;
    expect(row.materialCost).toBeCloseTo(15.33 / 7, 1);
    expect(pricingMaterialUnitCost(row)).toBeCloseTo(row.materialCost, 4);
  });

  it('BOM salva multiplicada pela qtd/mês não infla custo material na precificação', () => {
    const mp = createEmptyStockItem('Empresa', 'materia_prima');
    mp.name = 'Mix';
    mp.purchasePrice = 15.33;
    mp.unitsPurchased = 7;
    mp.measureQuantity = 1;
    mp.packageUnit = 'un';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'PUDIM';
    pa.useBom = true;
    pa.monthlyQty = 7;
    pa.recipeYieldQty = 7;
    pa.bom = [{ stockItemId: mp.id, quantity: 7, unit: 'un' }];
    pa.recipeQuantityBaseBom = [{ stockItemId: mp.id, quantity: 1, unit: 'un' }];
    pa.recipeQuantityBaseProductionQty = 7;

    const stockById = new Map([
      [mp.id, normalizeStockItem(mp)],
      [pa.id, normalizeStockItem(pa)],
    ]);
    const row = computePricingBreakdowns({
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [stockById.get(mp.id)!, stockById.get(pa.id)!],
      settings: {
        markupPercent: 0,
        marginPercent: 0,
        mode: 'markup_only' as const,
        costAllocationMode: 'por_unidades_mes' as const,
      },
    })[0]!;

    expect(computeMaterialCost(stockById.get(pa.id)!, stockById).cost).toBeCloseTo(15.33 / 7, 2);
    expect(row.materialCost).toBeCloseTo(15.33 / 7, 2);
    expect(row.materialCost).toBeLessThan(3);
  });

  it('preço de venda usa custo unitário total (material + rateio)', () => {
    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'PUDIM';
    pa.useBom = false;
    pa.directCost = 2.19;
    pa.monthlyQty = 7;

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
        markupPercent: 33.3,
        marginPercent: 25,
        mode: 'both' as const,
        costAllocationMode: 'por_unidades_mes' as const,
      },
    };

    const row = computePricingBreakdowns(ws)[0]!;
    expect(row.materialCost).toBeCloseTo(2.19, 2);
    expect(row.allocatedExpenses).toBeGreaterThan(20);
    expect(row.pricedUnitPrice).toBeCloseTo(
      (row.totalUnitCost * (1 + 33.3 / 100)) / (1 - 25 / 100),
      2,
    );
    expect(row.priceDrivingFactor).toBe('both');
    expect(row.pricedUnitPrice).toBeGreaterThan(row.totalUnitCost);
  });

  it('monthlyQtyLooksLikeRecipeYield quando qtd/mês = rendimento', () => {
    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.recipeYieldQty = 7;
    pa.monthlyQty = 7;
    expect(monthlyQtyLooksLikeRecipeYield(pa)).toBe(true);
    pa.monthlyQty = 100;
    expect(monthlyQtyLooksLikeRecipeYield(pa)).toBe(false);
  });

  it('alterar só o rendimento não reduz o custo total da receita', () => {
    const mp = createEmptyStockItem('Empresa', 'materia_prima');
    mp.purchasePrice = 12.95;
    mp.unitsPurchased = 1;
    mp.packageUnit = 'un';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.useBom = true;
    pa.recipeYieldQty = 7;
    pa.recipeQuantityBaseProductionQty = 7;
    pa.bom = [{ stockItemId: mp.id, quantity: 1, unit: 'un' }];
    pa.recipeQuantityBaseBom = pa.bom;

    const stockById = new Map([[mp.id, normalizeStockItem(mp)], [pa.id, normalizeStockItem(pa)]]);
    const at7 = compositionCostSummaryForStockItem(pa, stockById);
    const paYield14 = { ...pa, recipeYieldQty: 14, recipeQuantityBaseProductionQty: 14 };
    const at14 = compositionCostSummaryForStockItem(paYield14, stockById);

    expect(at7.recipeBatchTotalCost).toBeCloseTo(12.95, 2);
    expect(at14.recipeBatchTotalCost).toBeCloseTo(12.95, 2);
    expect(at7.unitMaterialCost).toBeCloseTo(12.95 / 7, 2);
    expect(at14.unitMaterialCost).toBeCloseTo(12.95 / 14, 2);
  });

  it('custo material total = soma das linhas da composição na tela', () => {
    const a = createEmptyStockItem('Empresa', 'insumo');
    a.id = 'a';
    a.unitsPurchased = 12;
    a.purchasePrice = 15;

    const b = createEmptyStockItem('Empresa', 'materia_prima');
    b.id = 'b';
    b.unitsPurchased = 80;
    b.measureQuantity = 1;
    b.packageUnit = 'g';
    b.purchasePrice = 100;

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.useBom = true;
    pa.recipeYieldQty = 7;
    pa.bom = [
      { stockItemId: a.id, quantity: 3, unit: 'un' },
      { stockItemId: b.id, quantity: 10, unit: 'g' },
    ];

    const stockById = new Map([
      [a.id, normalizeStockItem(a)],
      [b.id, normalizeStockItem(b)],
    ]);
    const lineSum = pa.bom.reduce(
      (s, line) =>
        s +
        bomLineCost(stockById, line.quantity, line.unit, line.stockItemId),
      0,
    );
    const total = compositionMaterialTotalFromBom(pa.bom, stockById);
    expect(total).toBeCloseTo(lineSum, 2);
    expect(total).toBeCloseTo(3.75 + 12.5, 2);
  });

  it('compositionCostSummary: total da receita e custo por 1 un. com rendimento', () => {
    const mp = createEmptyStockItem('Empresa', 'materia_prima');
    mp.purchasePrice = 14.82;
    mp.unitsPurchased = 7;
    mp.measureQuantity = 1;
    mp.packageUnit = 'un';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.useBom = true;
    pa.recipeYieldQty = 7;
    pa.bom = [{ stockItemId: mp.id, quantity: 7, unit: 'un' }];

    const stockById = new Map([
      [mp.id, normalizeStockItem(mp)],
      [pa.id, normalizeStockItem(pa)],
    ]);
    const summary = compositionCostSummary(pa.bom, stockById, 7);
    expect(summary.recipeBatchTotalCost).toBeCloseTo(14.82, 2);
    expect(summary.unitMaterialCost).toBeCloseTo(14.82 / 7, 2);
    expect(summary.recipeYieldQty).toBe(7);
  });

  it('rendimento 7 divide insumos da receita; qtd/mês 100 não altera material/un.', () => {
    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'PUDIM';
    pa.useBom = true;
    pa.recipeYieldQty = 7;
    pa.monthlyQty = 100;

    const leite = createEmptyStockItem('Empresa', 'materia_prima');
    leite.purchasePrice = 42;
    leite.unitsPurchased = 1;
    leite.measureQuantity = 1000;
    leite.packageUnit = 'ml';

    pa.bom = [{ stockItemId: leite.id, quantity: 1000, unit: 'ml' }];
    const stockById = new Map([
      [leite.id, normalizeStockItem(leite)],
      [pa.id, normalizeStockItem(pa)],
    ]);
    const bomTotal = compositionMaterialTotalFromBom(pa.bom, stockById);
    expect(bomTotal).toBeCloseTo(42, 2);

    const ws = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [...stockById.values()],
    };
    const row = computePricingBreakdowns(ws)[0]!;
    expect(row.materialCost).toBeCloseTo(42 / 7, 2);
    expect(row.materialCost).toBeLessThan(10);
    expect(row.monthlyQty).toBe(100);
  });

  it('rateio usa qtd/mês de vendas, não rendimento (88,30 ÷ 100)', () => {
    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'PUDIM';
    pa.useBom = true;
    pa.recipeYieldQty = 7;
    pa.monthlyQty = 100;

    const leite = createEmptyStockItem('Empresa', 'materia_prima');
    leite.purchasePrice = 42;
    leite.unitsPurchased = 1;
    leite.measureQuantity = 1000;
    leite.packageUnit = 'ml';
    pa.bom = [{ stockItemId: leite.id, quantity: 1000, unit: 'ml' }];

    const ws = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [normalizeStockItem(leite), normalizeStockItem(pa)],
      costExpenses: [
        {
          id: 'fix',
          companyName: 'Empresa',
          segment: 'produto_acabado' as const,
          type: 'despesa' as const,
          name: 'Fixos',
          category: '',
          notes: '',
          monthlyAmount: 88.3,
          createdAt: new Date().toISOString(),
        },
      ],
      settings: {
        markupPercent: 0,
        marginPercent: 0,
        mode: 'markup_only' as const,
        costAllocationMode: 'por_unidades_mes' as const,
      },
    };
    const row = computePricingBreakdowns(ws)[0]!;
    expect(row.materialCost).toBeCloseTo(6, 1);
    expect(row.displayUnitCosts).toBeCloseTo(88.3 / 100, 2);
    expect(row.totalUnitCost).toBeCloseTo(row.materialCost + 88.3 / 100, 2);

    const wrongQty = computePricingBreakdowns({
      ...ws,
      stockItems: [
        normalizeStockItem(leite),
        normalizeStockItem({ ...pa, monthlyQty: 7 }),
      ],
    })[0]!;
    expect(wrongQty.displayUnitCosts).toBeGreaterThan(row.displayUnitCosts * 10);
  });

  it('vezes em dobro multiplica qtd/mês na precificação, não o custo material/un', () => {
    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'PUDIM';
    pa.useBom = false;
    pa.directCost = 10;
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
          monthlyAmount: 196,
          createdAt: new Date().toISOString(),
        },
      ],
      settings: {
        markupPercent: 33,
        marginPercent: 30,
        mode: 'margin_only' as const,
        costAllocationMode: 'por_volume' as const,
      },
    };

    expect(effectiveMonthlyQtyForPricing(pa)).toBe(14);
    const row = computePricingBreakdowns(ws)[0]!;
    expect(row.monthlyQty).toBe(14);
    expect(row.materialCost).toBeCloseTo(10, 2);
    expect(row.allocatedExpenses).toBeCloseTo(196 / 7, 2);

    const base = computePricingBreakdowns({
      ...ws,
      stockItems: [normalizeStockItem({ ...pa, recipeQuantityDoubles: 0 })],
    })[0]!;
    expect(row.pricedUnitPrice).toBeCloseTo(base.pricedUnitPrice, 4);
    expect(row.allocatedExpenses).toBeCloseTo(base.allocatedExpenses, 4);
  });
});
