import { describe, expect, it } from 'vitest';
import {
  applyMaterialShortfallToStock,
  applyStockMaterialShortfallsForProduct,
  applyStockMaterialShortfallsToItems,
  buildStockItemsForBomUsage,
  cloneBomLines,
  computeStockRemainingAfterBom,
  monthlyMaterialDemandForSource,
  stockItemDepletedByBom,
  replenishQtyCappedForMonthlyUse,
  applyStockItemsUpdatePreservingPaCadastro,
  applyStockReplenishForSourceItem,
  applyStockReplenishOnlyThisItem,
  resolveReplenishShortageForStockItem,
  snapshotProdutoAcabadoCadastro,
  resolveStockUnitPriceFromPurchase,
  validateBomMaterialCoverage,
  workspaceReplenishShortageForStockItem,
} from '../logic/pricingCalculator';
import {
  buildPreReplenishSnapshotForItem,
  revertWorkspaceStockBeforeReplenish,
} from '../logic/pricingPreReplenishRestore';
import {
  applyCatalogStockPricing,
  createDefaultPricingWorkspace,
  createEmptyStockItem,
  deriveStockUnitPrice,
  normalizeStockItem,
  stockOnHandMeasure,
  stockPurchaseTotal,
  stockTotalMeasure,
} from '../logic/pricingTypes';

describe('applyCatalogStockPricing', () => {
  it('mantém modo total quando catálogo está em unitário', () => {
    const item = createEmptyStockItem('Empresa', 'insumo');
    item.unitsPurchased = 4;
    item.unitPrice = 10;
    item.purchasePrice = 40;
    item.priceInputMode = 'total';
    item.catalogUnitPrice = 10;
    item.catalogPriceInputMode = 'unit';

    const priced = applyCatalogStockPricing(normalizeStockItem(item));
    expect(priced.priceInputMode).toBe('total');
    expect(priced.purchasePrice).toBe(40);
    expect(priced.unitPrice).toBeCloseTo(10, 4);
  });
});

describe('revertWorkspaceStockBeforeReplenish', () => {
  it('restaura preço e zera estoque que veio só do acrescentar', () => {
    const emb = createEmptyStockItem('Empresa', 'materia_prima');
    emb.name = 'EMBALAGENS';
    emb.packageUnit = 'g';
    emb.unitsPurchased = 1;
    emb.measureQuantity = 40;
    emb.packageSize = 40;
    emb.unitPrice = 7.14;
    emb.purchasePrice = 50;
    emb.priceInputMode = 'unit';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.useBom = true;
    pa.recipeYieldQty = 7;
    pa.monthlyQty = 80;
    pa.bom = [{ stockItemId: emb.id, quantity: 7, unit: 'g' }];
    pa.recipeQuantityBaseBom = pa.bom;
    pa.recipeQuantityBaseProductionQty = 7;

    const workspace = createDefaultPricingWorkspace('Empresa');
    workspace.stockItems = [normalizeStockItem(emb), normalizeStockItem(pa)];

    const restored = revertWorkspaceStockBeforeReplenish(workspace);
    const item = restored.stockItems.find((s) => s.id === emb.id)!;
    expect(stockTotalMeasure(item)).toBe(0);
    expect(item.unitsPurchased).toBe(0);
    expect(restored.stockBeforeReplenish?.[emb.id]).toBeDefined();
    const snap = buildPreReplenishSnapshotForItem(
      workspace.stockItems.find((s) => s.id === emb.id)!,
      workspace.stockItems,
    );
    expect(snap.packageSize).toBe(0);
    expect(snap.purchasePrice).toBeLessThan(50);
  });
});

describe('applyStockReplenishForSourceItem', () => {
  it('reponhe quantidade agregada de todos os PA que usam o insumo', () => {
    const mp = createEmptyStockItem('Empresa', 'materia_prima');
    mp.id = 'mp-shared';
    mp.name = 'Leite';
    mp.packageUnit = 'g';
    mp.unitsPurchased = 1;
    mp.measureQuantity = 100;
    mp.packageSize = 0;

    const paA = createEmptyStockItem('Empresa', 'produto_acabado');
    paA.useBom = true;
    paA.monthlyQty = 40;
    paA.recipeYieldQty = 7;
    paA.bom = [{ stockItemId: mp.id, quantity: 50, unit: 'g' }];
    paA.recipeQuantityBaseBom = paA.bom;
    paA.recipeQuantityBaseProductionQty = 7;

    const paB = createEmptyStockItem('Empresa', 'produto_acabado');
    paB.useBom = true;
    paB.monthlyQty = 28;
    paB.recipeYieldQty = 7;
    paB.bom = [{ stockItemId: mp.id, quantity: 30, unit: 'g' }];
    paB.recipeQuantityBaseBom = paB.bom;
    paB.recipeQuantityBaseProductionQty = 7;

    const items = [normalizeStockItem(mp), normalizeStockItem(paA), normalizeStockItem(paB)];
    const shortage = workspaceReplenishShortageForStockItem(items[0]!, items);
    expect(shortage?.shortfallQty).toBeGreaterThan(50 * (40 / 7));

    const after = applyStockReplenishForSourceItem(items, mp.id);
    const updated = after.find((s) => s.id === mp.id)!;
    expect(stockOnHandMeasure(updated)).toBeGreaterThan(0);
    expect(updated.unitsPurchased).toBeGreaterThan(1);
    expect(updated.measureQuantity).toBe(100);
  });
});

describe('applyStockReplenishOnlyThisItem', () => {
  it('repõe só o item clicado, não os outros faltantes', () => {
    const oleo = createEmptyStockItem('Empresa', 'materia_prima');
    oleo.id = 'oleo-1';
    oleo.name = 'OLEO';
    oleo.unitsPurchased = 1;
    oleo.measureQuantity = 800;
    oleo.packageUnit = 'ml';
    oleo.packageSize = 0;
    oleo.unitPrice = 7;
    oleo.purchasePrice = 7;

    const choco = createEmptyStockItem('Empresa', 'materia_prima');
    choco.id = 'choco-1';
    choco.name = 'BARRA DE CHOCOLATE';
    choco.unitsPurchased = 1;
    choco.measureQuantity = 1600;
    choco.packageUnit = 'g';
    choco.packageSize = 0;
    choco.unitPrice = 53;
    choco.purchasePrice = 53;

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.useBom = true;
    pa.monthlyQty = 10;
    pa.recipeYieldQty = 1;
    pa.bom = [
      { stockItemId: oleo.id, quantity: 50, unit: 'ml' },
      { stockItemId: choco.id, quantity: 200, unit: 'g' },
    ];
    pa.recipeQuantityBaseBom = pa.bom;
    pa.recipeQuantityBaseProductionQty = 1;

    const items = [
      { ...normalizeStockItem(oleo), packageSize: 0 },
      { ...normalizeStockItem(choco), packageSize: 0 },
      normalizeStockItem(pa),
    ];
    const oleoBefore = items[0]!.packageSize;
    const chocoBefore = items[1]!.packageSize;
    expect(stockItemDepletedByBom(items[0]!, items)).toBe(true);
    expect(stockItemDepletedByBom(items[1]!, items)).toBe(true);

    const after = applyStockReplenishOnlyThisItem(items, oleo.id);
    const oleoAfter = after.find((s) => s.id === oleo.id)!;
    const chocoAfter = after.find((s) => s.id === choco.id)!;

    expect(stockOnHandMeasure(oleoAfter)).toBeGreaterThan(oleoBefore);
    expect(stockOnHandMeasure(chocoAfter)).toBe(chocoBefore);
    expect(stockItemDepletedByBom(oleoAfter, after)).toBe(false);
    expect(stockItemDepletedByBom(chocoAfter, after)).toBe(true);
  });
});

describe('Acrescentar com estoque físico zerado', () => {
  it('soma qtd comprada e estoque físico e tira de faltantes', () => {
    const mp = createEmptyStockItem('Empresa', 'materia_prima');
    mp.id = 'mp-val';
    mp.unitsPurchased = 40;
    mp.measureQuantity = 0;
    mp.packageUnit = 'g';
    mp.unitPrice = 1.25;
    mp.purchasePrice = 50;
    mp.priceInputMode = 'unit';
    mp.catalogUnitPrice = 1.25;
    mp.catalogPurchasePrice = 50;

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.useBom = true;
    pa.monthlyQty = 40;
    pa.recipeYieldQty = 7;
    pa.bom = [{ stockItemId: mp.id, quantity: 7, unit: 'g' }];
    pa.recipeQuantityBaseBom = pa.bom;
    pa.recipeQuantityBaseProductionQty = 7;

    const items = [normalizeStockItem(mp), normalizeStockItem(pa)];
    expect(stockOnHandMeasure(items[0]!)).toBe(0);
    expect(stockItemDepletedByBom(items[0]!, items)).toBe(true);

    const afterItems = applyStockReplenishForSourceItem(items, mp.id);
    const updated = afterItems.find((s) => s.id === mp.id)!;

    expect(updated.unitsPurchased).toBeGreaterThan(40);
    expect(stockPurchaseTotal(updated)).toBeGreaterThan(50);
    expect(stockOnHandMeasure(updated)).toBeGreaterThan(0);
    expect(stockItemDepletedByBom(updated, afterItems)).toBe(false);
  });
});

describe('replenishQtyCappedForMonthlyUse', () => {
  it('com medida/un zerada aumenta qtd comprada e estoque físico', () => {
    const mp = createEmptyStockItem('Empresa', 'materia_prima');
    mp.unitsPurchased = 40;
    mp.measureQuantity = 0;
    mp.packageUnit = 'g';
    mp.packageSize = 0;
    mp.unitPrice = 1.25;
    mp.purchasePrice = 50;
    mp.catalogMeasureAtPricing = 28;
    mp.catalogUnitPrice = 1.25;

    const normalized = normalizeStockItem(mp);
    expect(stockOnHandMeasure(normalized)).toBe(0);
    const updated = applyMaterialShortfallToStock(normalized, 280);
    expect(updated.packageSize).toBeCloseTo(280, 2);
    expect(updated.measureQuantity).toBe(0);
    expect(updated.unitsPurchased).toBe(50);
    expect(stockOnHandMeasure(updated)).toBeCloseTo(280, 2);
  });

  it('com medida/un preenchida aumenta qtd comprada e medida total (g)', () => {
    const mp = createEmptyStockItem('Empresa', 'materia_prima');
    mp.unitsPurchased = 40;
    mp.measureQuantity = 28;
    mp.packageUnit = 'g';
    mp.packageSize = 0;
    mp.unitPrice = 1.25;
    mp.purchasePrice = 50;

    const normalized = normalizeStockItem(mp);
    expect(normalized.packageSize).toBeCloseTo(1120, 2);
    const updated = applyMaterialShortfallToStock(normalized, 280);
    expect(updated.unitsPurchased).toBe(50);
    expect(updated.packageSize).toBeCloseTo(1400, 2);
    expect(updated.measureQuantity).toBe(28);
  });

  it('não acrescenta mais que o uso mensal do insumo na composição', () => {
    const mp = createEmptyStockItem('Empresa', 'materia_prima');
    mp.id = 'mp-1';
    mp.unitsPurchased = 10;
    mp.measureQuantity = 8;
    mp.packageUnit = 'ml';
    mp.packageSize = 0;
    mp.purchasePrice = 50;

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.useBom = true;
    pa.monthlyQty = 10;
    pa.recipeYieldQty = 1;
    pa.bom = [{ stockItemId: mp.id, quantity: 8, unit: 'ml' }];
    pa.recipeQuantityBaseBom = pa.bom;
    pa.recipeQuantityBaseProductionQty = 1;

    const all = [normalizeStockItem(mp), normalizeStockItem(pa)];
    const monthly = monthlyMaterialDemandForSource(mp.id, all);
    expect(monthly).toBeCloseTo(80, 2);

    const capped = replenishQtyCappedForMonthlyUse(mp, all, 500);
    expect(capped).toBeCloseTo(80, 2);

    const shortage = resolveReplenishShortageForStockItem(mp, all);
    expect(shortage?.shortfallQty).toBeCloseTo(80, 2);
  });
});

describe('applyMaterialShortfallToStock', () => {
  it('acrescenta medida faltante mantendo unidades compradas', () => {
    const leite = createEmptyStockItem('Empresa', 'insumo');
    leite.name = 'Leite condensado';
    leite.unitsPurchased = 1;
    leite.measureQuantity = 1580;
    leite.packageUnit = 'g';
    leite.purchasePrice = 10;
    leite.unitPrice = 10;

    const updated = applyMaterialShortfallToStock(normalizeStockItem(leite), 677.143);
    expect(updated.measureQuantity).toBeCloseTo(1580, 2);
    expect(updated.unitsPurchased).toBe(2);
    expect(updated.measureQuantity).toBeCloseTo(1580, 2);
    expect(stockTotalMeasure(updated)).toBeCloseTo(3160, 2);
    expect(updated.unitPrice).toBeCloseTo(10, 4);
  });

  it('acrescenta unidades quando item é contável', () => {
    const ovos = createEmptyStockItem('Empresa', 'insumo');
    ovos.unitsPurchased = 12;
    ovos.packageUnit = 'un';
    ovos.purchasePrice = 24;
    ovos.unitPrice = 2;

    const updated = applyMaterialShortfallToStock(normalizeStockItem(ovos), 3);
    expect(updated.unitsPurchased).toBe(15);
    expect(stockTotalMeasure(updated)).toBe(15);
    expect(updated.unitPrice).toBe(2);
    expect(updated.purchasePrice).toBe(30);
  });

  it('respeita total pago cadastrado (modo Total R$) ao repor unidades', () => {
    const item = createEmptyStockItem('Empresa', 'insumo');
    item.unitsPurchased = 4;
    item.packageUnit = 'un';
    item.purchasePrice = 24;
    item.unitPrice = 0;
    item.priceInputMode = 'total';

    const updated = applyMaterialShortfallToStock(normalizeStockItem(item), 3);
    expect(updated.unitPrice).toBeCloseTo(6, 4);
    expect(updated.unitsPurchased).toBe(7);
    expect(stockTotalMeasure(updated)).toBe(7);
    expect(updated.purchasePrice).toBeCloseTo(42, 2);
  });

  it('não altera R$/un cadastrado (ex.: 5,735) ao acrescentar unidades', () => {
    const item = createEmptyStockItem('Empresa', 'insumo');
    item.unitsPurchased = 10;
    item.packageUnit = 'un';
    item.unitPrice = 5.735;
    item.purchasePrice = 57.35;
    item.priceInputMode = 'unit';
    item.catalogUnitPrice = 5.735;
    item.catalogPriceInputMode = 'unit';

    const updated = applyMaterialShortfallToStock(normalizeStockItem(item), 3);
    expect(updated.unitPrice).toBe(5.735);
    expect(resolveStockUnitPriceFromPurchase(updated)).toBe(5.735);
    expect(updated.unitsPurchased).toBe(13);
    expect(stockTotalMeasure(updated)).toBe(13);
    expect(updated.purchasePrice).toBeCloseTo(74.555, 2);
  });

  it('mantém R$/un ao repor medida (ex.: embalagens 0,465/un)', () => {
    const emb = createEmptyStockItem('Empresa', 'materia_prima');
    emb.unitsPurchased = 40;
    emb.measureQuantity = 3;
    emb.packageUnit = 'g';
    emb.unitPrice = 0;
    emb.purchasePrice = 18.6;
    emb.priceInputMode = 'total';
    emb.catalogPurchasePrice = 18.6;
    emb.catalogUnitPrice = 0.465;
    emb.catalogPriceInputMode = 'total';

    const updated = applyMaterialShortfallToStock(normalizeStockItem(emb), 80);
    expect(deriveStockUnitPrice(updated)).toBeCloseTo(0.465, 4);
    expect(updated.unitsPurchased).toBe(67);
    expect(updated.measureQuantity).toBe(3);
    expect(stockTotalMeasure(updated)).toBeCloseTo(201, 2);
    expect(updated.purchasePrice).toBeGreaterThan(18.6);
  });

  it('não altera medida/un nem qtd comprada — só estoque físico (packageSize)', () => {
    const mp = createEmptyStockItem('Empresa', 'materia_prima');
    mp.unitsPurchased = 40;
    mp.measureQuantity = 3;
    mp.packageUnit = 'g';
    mp.packageSize = 120;
    mp.purchasePrice = 18.6;

    const updated = applyMaterialShortfallToStock(normalizeStockItem(mp), 50);
    expect(updated.measureQuantity).toBe(3);
    expect(updated.unitsPurchased).toBeCloseTo(57, 0);
    expect(updated.packageSize).toBeCloseTo(171, 2);
  });
});

describe('applyStockMaterialShortfallsForProduct', () => {
  it('repõe só materiais da composição do PA, não insumos de outro produto', () => {
    const emb = createEmptyStockItem('Empresa', 'materia_prima');
    emb.id = 'emb-pudim';
    emb.name = 'EMBALAGENS';
    emb.packageUnit = 'un';
    emb.unitsPurchased = 1;
    emb.packageSize = 0;
    emb.purchasePrice = 10;
    emb.unitPrice = 10;

    const leite = createEmptyStockItem('Empresa', 'insumo');
    leite.id = 'leite-pudim';
    leite.name = 'leite condensado';
    leite.unitsPurchased = 1;
    leite.measureQuantity = 395;
    leite.packageUnit = 'ml';
    leite.packageSize = 0;
    leite.purchasePrice = 10;

    const sal = createEmptyStockItem('Empresa', 'insumo');
    sal.id = 'sal-outro';
    sal.name = 'sal';
    sal.unitsPurchased = 1;
    sal.measureQuantity = 1000;
    sal.packageUnit = 'g';
    sal.packageSize = 0;
    sal.purchasePrice = 5;

    const pudim = createEmptyStockItem('Empresa', 'produto_acabado');
    pudim.id = 'pa-pudim';
    pudim.useBom = true;
    pudim.monthlyQty = 40;
    pudim.recipeYieldQty = 7;
    pudim.bom = [
      { stockItemId: emb.id, quantity: 7, unit: 'un' },
      { stockItemId: leite.id, quantity: 395, unit: 'ml' },
    ];
    pudim.recipeQuantityBaseBom = cloneBomLines(pudim.bom);
    pudim.recipeQuantityBaseProductionQty = 7;

    const outro = createEmptyStockItem('Empresa', 'produto_acabado');
    outro.id = 'pa-outro';
    outro.useBom = true;
    outro.monthlyQty = 100;
    outro.recipeYieldQty = 1;
    outro.bom = [{ stockItemId: sal.id, quantity: 500, unit: 'g' }];
    outro.recipeQuantityBaseBom = outro.bom;
    outro.recipeQuantityBaseProductionQty = 1;

    const items = [
      { ...normalizeStockItem(emb), packageSize: 0 },
      { ...normalizeStockItem(leite), packageSize: 0 },
      { ...normalizeStockItem(sal), packageSize: 0 },
      normalizeStockItem(pudim),
      normalizeStockItem(outro),
    ];
    const coverage = validateBomMaterialCoverage(items[3]!, items);
    expect(coverage.shortages.map((s) => s.stockItemId).sort()).toEqual(
      [emb.id, leite.id].sort(),
    );

    const salBefore = stockOnHandMeasure(items[2]!);
    const after = applyStockMaterialShortfallsForProduct(items, items[3]!);
    const salAfter = after.find((s) => s.id === sal.id)!;
    const embAfter = after.find((s) => s.id === emb.id)!;

    expect(stockOnHandMeasure(salAfter)).toBe(salBefore);
    expect(stockOnHandMeasure(embAfter)).toBeGreaterThan(0);
    expect(validateBomMaterialCoverage(items[3]!, after).ok).toBe(true);
  });

  it('reponhe três MPs de uma vez para meta do mês do PA', () => {
    const mkMp = (name: string) => {
      const mp = createEmptyStockItem('Empresa', 'materia_prima');
      mp.name = name;
      mp.packageUnit = 'g';
      mp.unitsPurchased = 0;
      mp.measureQuantity = 37;
      mp.purchasePrice = 10;
      mp.unitPrice = 0.27;
      return normalizeStockItem(mp);
    };

    const emb = mkMp('EMBALAGENS');
    const eti = mkMp('ETIQUETAS');
    const sac = mkMp('SACOLA');

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.useBom = true;
    pa.recipeYieldQty = 7;
    pa.monthlyQty = 40;
    pa.bom = [
      { stockItemId: emb.id, quantity: 7, unit: 'g' },
      { stockItemId: eti.id, quantity: 7, unit: 'g' },
      { stockItemId: sac.id, quantity: 7, unit: 'g' },
    ];
    pa.recipeQuantityBaseBom = cloneBomLines(pa.bom);
    pa.recipeQuantityBaseProductionQty = 7;

    const items = [emb, eti, sac, normalizeStockItem(pa)];
    const product = items[3]!;
    expect(validateBomMaterialCoverage(product, items).ok).toBe(false);

    const after = applyStockMaterialShortfallsForProduct(items, product);
    const coverage = validateBomMaterialCoverage(product, after);
    expect(coverage.ok).toBe(true);
    expect(coverage.shortages).toHaveLength(0);
  });

  it('um clique cobre material compartilhado com outro PA no mês', () => {
    const leite = createEmptyStockItem('Empresa', 'materia_prima');
    leite.name = 'Leite';
    leite.packageUnit = 'g';
    leite.unitsPurchased = 1;
    leite.measureQuantity = 395;
    leite.packageSize = 0;

    const paA = createEmptyStockItem('Empresa', 'produto_acabado');
    paA.name = 'Pudim A';
    paA.useBom = true;
    paA.recipeYieldQty = 7;
    paA.monthlyQty = 40;
    paA.bom = [{ stockItemId: leite.id, quantity: 395, unit: 'g' }];
    paA.recipeQuantityBaseBom = paA.bom;
    paA.recipeQuantityBaseProductionQty = 7;

    const paB = createEmptyStockItem('Empresa', 'produto_acabado');
    paB.name = 'Pudim B';
    paB.useBom = true;
    paB.recipeYieldQty = 7;
    paB.monthlyQty = 28;
    paB.bom = [{ stockItemId: leite.id, quantity: 200, unit: 'g' }];
    paB.recipeQuantityBaseBom = paB.bom;
    paB.recipeQuantityBaseProductionQty = 7;

    const items = [normalizeStockItem(leite), normalizeStockItem(paA), normalizeStockItem(paB)];
    const needA =
      validateBomMaterialCoverage(items[1]!, items).shortages[0]?.shortfallQty ?? 0;
    expect(needA).toBeGreaterThan(395 * (40 / 7));

    const afterOne = applyStockMaterialShortfallsForProduct(items, items[1]!);
    expect(validateBomMaterialCoverage(items[1]!, afterOne).ok).toBe(true);
  });
});

describe('applyStockMaterialShortfallsToItems', () => {
  it('aplica falta no lançamento mantido quando há duplicata com mesmo nome', () => {
    const keeper = createEmptyStockItem('Empresa', 'insumo');
    keeper.name = 'Leite';
    keeper.unitsPurchased = 1;
    keeper.measureQuantity = 1580;
    keeper.packageUnit = 'g';
    keeper.createdAt = '2024-01-01T00:00:00.000Z';

    const dup = createEmptyStockItem('Empresa', 'insumo');
    dup.name = 'Leite';
    dup.unitsPurchased = 1;
    dup.measureQuantity = 100;
    dup.packageUnit = 'g';
    dup.createdAt = '2024-06-01T00:00:00.000Z';

    const updated = applyStockMaterialShortfallsToItems(
      [normalizeStockItem(keeper), normalizeStockItem(dup)],
      [{ stockItemId: dup.id, shortfallQty: 500 }],
    );

    expect(updated).toHaveLength(1);
    expect(stockTotalMeasure(updated[0]!)).toBeCloseTo(3160, 1);
  });

  it('não altera composição (BOM) do produto acabado ao repor estoque', () => {
    const emb = createEmptyStockItem('Empresa', 'materia_prima');
    emb.name = 'EMBALAGENS';
    emb.unitsPurchased = 0;
    emb.measureQuantity = 0;
    emb.packageUnit = 'g';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.useBom = true;
    pa.monthlyQty = 80;
    pa.recipeYieldQty = 12;
    pa.bom = [{ stockItemId: emb.id, quantity: 3, unit: 'g' }];
    pa.recipeQuantityBaseBom = cloneBomLines(pa.bom);
    pa.recipeQuantityBaseProductionQty = 12;

    const items = [normalizeStockItem(emb), normalizeStockItem(pa)];
    const paId = items[1]!.id;
    const updated = applyStockMaterialShortfallsToItems(items, [
      { stockItemId: emb.id, shortfallQty: 80 },
    ]);
    const paAfter = updated.find((s) => s.id === paId)!;
    expect(paAfter.bom[0]?.quantity).toBe(3);
    expect(paAfter.recipeQuantityBaseBom?.[0]?.quantity).toBe(3);
    expect(paAfter.monthlyQty).toBe(80);
    expect(paAfter.recipeYieldQty).toBe(12);
  });

  it('applyStockItemsUpdatePreservingPaCadastro mantém qtd/mês e rendimento após repor insumo', () => {
    const emb = createEmptyStockItem('Empresa', 'materia_prima');
    emb.id = 'emb-pa-freeze';
    emb.unitsPurchased = 1;
    emb.measureQuantity = 100;
    emb.packageUnit = 'g';
    emb.purchasePrice = 10;

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.id = 'pa-freeze';
    pa.useBom = true;
    pa.monthlyQty = 120;
    pa.recipeYieldQty = 8;
    pa.bom = [{ stockItemId: emb.id, quantity: 10, unit: 'g' }];
    pa.recipeQuantityBaseBom = cloneBomLines(pa.bom);
    pa.recipeQuantityBaseProductionQty = 8;

    const before = [normalizeStockItem(emb), normalizeStockItem(pa)];
    const snap = snapshotProdutoAcabadoCadastro(before[1]!);
    const afterRaw = applyStockMaterialShortfallsToItems(before, [
      { stockItemId: emb.id, shortfallQty: 50 },
    ]);
    const after = applyStockItemsUpdatePreservingPaCadastro(before, afterRaw);
    const paAfter = after.find((s) => s.id === pa.id)!;

    expect(paAfter.monthlyQty).toBe(snap.monthlyQty);
    expect(paAfter.recipeYieldQty).toBe(snap.recipeYieldQty);
    expect(paAfter.bom[0]?.quantity).toBe(snap.bom[0]?.quantity);
  });
});

describe('buildStockItemsForBomUsage', () => {
  it('recalcula consumo do insumo quando qtd/mês do PA em edição aumenta', () => {
    const leite = createEmptyStockItem('Empresa', 'insumo');
    leite.name = 'Leite';
    leite.unitsPurchased = 1;
    leite.measureQuantity = 10000;
    leite.packageUnit = 'g';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'Pudim';
    pa.useBom = true;
    pa.recipeYieldQty = 7;
    pa.monthlyQty = 70;
    pa.bom = [{ stockItemId: leite.id, quantity: 100, unit: 'g' }];
    pa.recipeQuantityBaseBom = pa.bom;
    pa.recipeQuantityBaseProductionQty = 7;

    const base = buildStockItemsForBomUsage([normalizeStockItem(leite), normalizeStockItem(pa)]);
    const lowUsage = computeStockRemainingAfterBom(base[0]!, base);

    const paLive = { ...pa, monthlyQty: 700 };
    const high = buildStockItemsForBomUsage([normalizeStockItem(leite), normalizeStockItem(pa)], {
      editingProductId: pa.id,
      editingProductLive: paLive,
    });
    const highUsage = computeStockRemainingAfterBom(high[0]!, high);

    expect(highUsage.usage.lines[0]?.quantityInItemUnit).toBeGreaterThan(
      lowUsage.usage.lines[0]?.quantityInItemUnit ?? 0,
    );
    expect(highUsage.measureTotal).toBeLessThan(lowUsage.measureTotal);
  });
});
