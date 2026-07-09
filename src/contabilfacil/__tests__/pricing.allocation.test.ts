import { describe, expect, it } from 'vitest';
import { buildRateioConcentrationAlerts } from '../logic/pricingAllocationInsight';
import {
  computePricingBreakdowns,
  costAllocationWeight,
  countSegmentAllocationParticipants,
} from '../logic/pricingCalculator';
import {
  createDefaultPricingWorkspace,
  createEmptyStockItem,
  normalizeStockItem,
} from '../logic/pricingTypes';

describe('rateio de custos e despesas', () => {
  it('costAllocationWeight por volume usa custo material × qtd/mês', () => {
    expect(costAllocationWeight(2.19, 7, 'por_volume')).toBeCloseTo(15.33, 2);
    expect(costAllocationWeight(2.19, 0, 'por_volume')).toBe(0);
  });

  it('divide custos do segmento pela qtd/mês quando há um único produto (cenário pudim)', () => {
    const pudim = createEmptyStockItem('Empresa', 'produto_acabado');
    pudim.name = 'PUDIM';
    pudim.useBom = false;
    pudim.directCost = 2.19;
    pudim.monthlyQty = 7;

    const workspace = {
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
        marginPercent: 25,
        mode: 'both' as const,
        costAllocationMode: 'por_volume' as const,
      },
    };

    const [row] = computePricingBreakdowns(workspace);
    expect(row.allocatedExpenses).toBeCloseTo(178.3 / 7, 2);
    expect(row.allocationShare).toBeCloseTo(1, 4);
    expect(row.monthlyCostsUsed).toBe(0);
    expect(row.monthlyExpensesUsed).toBeCloseTo(178.3, 2);
    expect(row.displayUnitCosts).toBeCloseTo(178.3 / 7, 2);
    expect(row.displayMonthlyExpensesTotal).toBeCloseTo(178.3, 2);
    expect(row.totalUnitCost).toBeCloseTo(2.19 + 178.3 / 7, 2);
    expect(row.displayUnitCosts).toBeCloseTo(row.totalUnitCost - 2.19, 2);
    expect(row.totalUnitCost).toBeLessThan(50);
    expect(row.pricedUnitPrice).toBeCloseTo(
      (row.totalUnitCost * (1 + 33.3 / 100)) / (1 - 25 / 100),
      1,
    );
    expect(row.priceDrivingFactor).toBe('both');
    expect(row.pricedMonthlyTotal).toBeCloseTo(row.pricedUnitPrice * 7, 2);
    expect(row.finalPrice).toBeCloseTo(row.pricedUnitPrice, 4);
    expect(row.achievedMarkupPct).toBeGreaterThan(0);
    expect(row.achievedMarginPct).toBeGreaterThan(0);
  });

  it('workspace padrão rateia custos/despesas pela qtd/mês do segmento', () => {
    const makePa = (name: string, qty: number) => {
      const item = createEmptyStockItem('Empresa', 'produto_acabado');
      item.name = name;
      item.useBom = false;
      item.directCost = 2;
      item.monthlyQty = qty;
      return normalizeStockItem(item);
    };

    const workspace = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [makePa('A', 3), makePa('B', 7)],
      costExpenses: [
        {
          id: 'd1',
          companyName: 'Empresa',
          segment: 'produto_acabado' as const,
          type: 'despesa' as const,
          name: 'Operacional',
          category: '',
          notes: '',
          monthlyAmount: 100,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const rows = computePricingBreakdowns(workspace);
    const a = rows.find((r) => r.name === 'A')!;
    const b = rows.find((r) => r.name === 'B')!;
    expect(a.allocationShare).toBeCloseTo(0.3, 4);
    expect(b.allocationShare).toBeCloseTo(0.7, 4);
    expect(a.monthlyExpensesUsed).toBeCloseTo(30, 2);
    expect(b.monthlyExpensesUsed).toBeCloseTo(70, 2);
    expect(a.allocatedExpenses).toBeCloseTo(100 / 10, 2);
    expect(b.allocatedExpenses).toBeCloseTo(100 / 10, 2);
  });

  it('modo por custo material mantém rateio proporcional ao custo mat. × qtd', () => {
    const a = createEmptyStockItem('Empresa', 'produto_acabado');
    a.name = 'A';
    a.useBom = false;
    a.directCost = 2;
    a.monthlyQty = 10;

    const b = createEmptyStockItem('Empresa', 'produto_acabado');
    b.name = 'B';
    b.useBom = false;
    b.directCost = 8;
    b.monthlyQty = 10;

    const workspace = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [normalizeStockItem(a), normalizeStockItem(b)],
      costExpenses: [
        {
          id: 'c1',
          companyName: 'Empresa',
          segment: 'produto_acabado' as const,
          type: 'custo' as const,
          name: 'Fixo',
          category: '',
          notes: '',
          monthlyAmount: 100,
          createdAt: new Date().toISOString(),
        },
      ],
      settings: {
        markupPercent: 0,
        marginPercent: 0,
        mode: 'markup_only' as const,
        costAllocationMode: 'por_custo_material' as const,
      },
    };

    const breakdowns = computePricingBreakdowns(workspace);
    const rowA = breakdowns.find((r) => r.name === 'A')!;
    const rowB = breakdowns.find((r) => r.name === 'B')!;

    expect(rowA.allocatedCosts).toBeCloseTo(20 / 10, 4);
    expect(rowB.allocatedCosts).toBeCloseTo(80 / 10, 4);
    expect(rowA.allocationShare).toBeCloseTo(0.2, 4);
    expect(rowB.allocationShare).toBeCloseTo(0.8, 4);
  });

  it('por unidades/mês divide custos pela soma das qtd (7 pudins entre vários PA)', () => {
    const makePa = (name: string, mat: number, qty: number) => {
      const item = createEmptyStockItem('Empresa', 'produto_acabado');
      item.name = name;
      item.useBom = false;
      item.directCost = mat;
      item.monthlyQty = qty;
      return normalizeStockItem(item);
    };

    const workspace = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [
        makePa('PUDIM', 2.19, 7),
        makePa('BOLO', 5, 7),
        makePa('TORTA', 8, 7),
      ],
      costExpenses: [
        {
          id: 'c1',
          companyName: 'Empresa',
          segment: 'produto_acabado' as const,
          type: 'custo' as const,
          name: 'Fixo',
          category: '',
          notes: '',
          monthlyAmount: 176,
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

    const pudim = computePricingBreakdowns(workspace).find((r) => r.name === 'PUDIM')!;
    expect(pudim.unitCostExclExpenses).toBeCloseTo(2.19, 2);
    expect(pudim.allocatedCosts).toBeCloseTo(176 / 21, 2);
    expect(pudim.allocatedExpenses).toBeCloseTo(178.3 / 21, 2);
    expect(pudim.totalUnitCost).toBeCloseTo(2.19 + 176 / 21 + 178.3 / 21, 2);
  });

  it('produtos com qtd/mês zero não entram no rateio (só PUDIM com 7 un.)', () => {
    const pudim = createEmptyStockItem('Empresa', 'produto_acabado');
    pudim.name = 'PUDIM';
    pudim.useBom = false;
    pudim.directCost = 2.19;
    pudim.monthlyQty = 7;

    const outro = createEmptyStockItem('Empresa', 'produto_acabado');
    outro.name = 'OUTRO';
    outro.useBom = false;
    outro.directCost = 10;
    outro.monthlyQty = 0;

    const workspace = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [normalizeStockItem(pudim), normalizeStockItem(outro)],
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
        marginPercent: 25,
        mode: 'both' as const,
        costAllocationMode: 'por_volume' as const,
      },
    };

    const row = computePricingBreakdowns(workspace).find((r) => r.name === 'PUDIM')!;
    expect(row.unitCostExclExpenses).toBeCloseTo(2.19, 2);
    expect(row.allocatedExpenses).toBeCloseTo(178.3 / 7, 2);
    expect(row.totalUnitCost).toBeCloseTo(2.19 + 178.3 / 7, 2);
  });

  it('alerta de rateio 100% quando só um PA tem qtd/mês no segmento', () => {
    const pudim = createEmptyStockItem('Empresa', 'produto_acabado');
    pudim.name = 'PUDIM';
    pudim.useBom = false;
    pudim.directCost = 2.19;
    pudim.monthlyQty = 224;

    const outro = createEmptyStockItem('Empresa', 'produto_acabado');
    outro.name = 'BOLO';
    outro.useBom = false;
    outro.directCost = 5;
    outro.monthlyQty = 0;

    const workspace = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [normalizeStockItem(pudim), normalizeStockItem(outro)],
      costExpenses: [
        {
          id: 'c1',
          companyName: 'Empresa',
          segment: 'produto_acabado' as const,
          type: 'despesa' as const,
          name: 'Fixo',
          category: '',
          notes: '',
          monthlyAmount: 3026.24,
          createdAt: new Date().toISOString(),
        },
      ],
      settings: {
        markupPercent: 0,
        marginPercent: 30,
        mode: 'margin_only' as const,
        costAllocationMode: 'por_volume' as const,
      },
    };

    const participants = countSegmentAllocationParticipants(workspace, 'produto_acabado');
    expect(participants.withQty).toBe(1);
    expect(participants.registered).toBe(2);

    const rows = computePricingBreakdowns(workspace);
    const alerts = buildRateioConcentrationAlerts(rows, workspace);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.sharePct).toBeGreaterThan(99);
    expect(alerts[0]!.soleActiveProduct).toBe(true);
    expect(alerts[0]!.allocatedMonthly).toBeCloseTo(3026.24, 0);
  });
});
