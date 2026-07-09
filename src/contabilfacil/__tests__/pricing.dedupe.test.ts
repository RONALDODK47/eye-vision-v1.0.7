import { describe, expect, it } from 'vitest';
import { dedupeStockItemsByName, dedupePricingWorkspaceStock } from '../logic/pricingCalculator';
import { createEmptyStockItem, normalizeStockItem, stockTotalMeasure } from '../logic/pricingTypes';

describe('dedupeStockItemsByName', () => {
  it('remove cópias com o mesmo nome na mesma categoria e soma quantidades', () => {
    const a = createEmptyStockItem('Empresa', 'insumo');
    a.name = 'Leite';
    a.unitsPurchased = 2;
    a.purchasePrice = 10;
    a.createdAt = '2024-01-01T00:00:00.000Z';

    const b = createEmptyStockItem('Empresa', 'insumo');
    b.name = '  leite  ';
    b.unitsPurchased = 3;
    b.purchasePrice = 15;
    b.createdAt = '2024-06-01T00:00:00.000Z';

    const c = createEmptyStockItem('Empresa', 'materia_prima');
    c.name = 'Leite';
    c.unitsPurchased = 1;
    c.purchasePrice = 5;

    const { items, removedIds } = dedupeStockItemsByName([
      normalizeStockItem(a),
      normalizeStockItem(b),
      normalizeStockItem(c),
    ]);

    expect(items).toHaveLength(2);
    expect(removedIds).toHaveLength(1);
    expect(removedIds[0]).toBe(b.id);

    const kept = items.find((i) => i.id === a.id)!;
    expect(kept.unitsPurchased).toBe(5);
    expect(kept.purchasePrice).toBe(25);
  });

  it('soma medida total ao fundir duplicatas com mesma unidade', () => {
    const a = createEmptyStockItem('Empresa', 'insumo');
    a.name = 'Leite';
    a.unitsPurchased = 1;
    a.measureQuantity = 1580;
    a.packageUnit = 'g';
    a.createdAt = '2024-01-01T00:00:00.000Z';

    const b = createEmptyStockItem('Empresa', 'insumo');
    b.name = 'Leite';
    b.unitsPurchased = 1;
    b.measureQuantity = 420;
    b.packageUnit = 'g';
    b.createdAt = '2024-06-01T00:00:00.000Z';

    const { items } = dedupeStockItemsByName([
      normalizeStockItem(a),
      normalizeStockItem(b),
    ]);

    expect(items).toHaveLength(1);
    expect(stockTotalMeasure(items[0]!)).toBeCloseTo(2000, 1);
  });

  it('não agrupa itens sem nome', () => {
    const a = createEmptyStockItem('Empresa', 'insumo');
    const b = createEmptyStockItem('Empresa', 'insumo');
    const { items, removedIds } = dedupeStockItemsByName([
      normalizeStockItem(a),
      normalizeStockItem(b),
    ]);
    expect(items).toHaveLength(2);
    expect(removedIds).toHaveLength(0);
  });

  it('remapeia BOM para o id mantido', () => {
    const mp = createEmptyStockItem('Empresa', 'materia_prima');
    mp.name = 'Açúcar';
    mp.createdAt = '2024-01-01T00:00:00.000Z';

    const mpDup = createEmptyStockItem('Empresa', 'materia_prima');
    mpDup.name = 'Açúcar';
    mpDup.createdAt = '2024-02-01T00:00:00.000Z';

    const pa = createEmptyStockItem('Empresa', 'produto_acabado');
    pa.name = 'Bolo';
    pa.useBom = true;
    pa.bom = [{ stockItemId: mpDup.id, quantity: 2, unit: 'kg' }];

    const { workspace } = dedupePricingWorkspaceStock({
      companyName: 'Empresa',
      stockItems: [normalizeStockItem(mp), normalizeStockItem(mpDup), normalizeStockItem(pa)],
      serviceItems: [],
      costExpenses: [],
      credits: [],
      settings: {
        markupPercent: 0,
        marginPercent: 0,
        mode: 'markup_only',
        costAllocationMode: 'por_unidades_mes',
      },
      productOverrides: {},
      updatedAt: '',
    });

    expect(workspace.stockItems).toHaveLength(2);
    const bolo = workspace.stockItems.find((s) => s.name === 'Bolo')!;
    expect(bolo.bom[0]?.stockItemId).toBe(mp.id);
  });
});
