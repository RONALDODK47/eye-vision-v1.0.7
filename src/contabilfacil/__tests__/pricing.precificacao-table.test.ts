import { describe, expect, it } from 'vitest';
import {
  buildPrecificacaoTableRow,
  getPrecificacaoTableHeaders,
  precificacaoTableColumnCount,
  pricingCostColumnValues,
  pricingMaterialUnitCost,
  pricingRowArithmeticCheck,
  resolveDisplayedUnitPrice,
  resolvePricingMonthlyQty,
  resolvePricingMonthlyTotal,
  showMarginColumn,
  showMarkupColumn,
} from '../logic/pricingPrecificacaoTable';
import {
  computePricingBreakdowns,
  priceFromMarkup,
  priceFromMarkupAndMargin,
} from '../logic/pricingCalculator';
import { sumBomDetailCosts } from '../logic/pricingCalculator';
import {
  createDefaultPricingWorkspace,
  createEmptyStockItem,
  normalizeStockItem,
} from '../logic/pricingTypes';
import type { PricingBreakdown } from '../logic/pricingTypes';

const fmt = {
  money: (n: number) => n.toFixed(2),
  qty: (n: number) => String(n),
  pct: (n: number) => String(n),
  share: (n: number) => String(n),
};

function sampleBreakdown(overrides: Partial<PricingBreakdown> = {}): PricingBreakdown {
  return {
    productId: 'p1',
    name: 'PUDIM',
    category: 'produto_acabado',
    materialCost: 2.19,
    bomDetail: [],
    allocatedCosts: 10,
    allocatedExpenses: 15,
    allocationShare: 1,
    monthlyCostsUsed: 70,
    monthlyExpensesUsed: 105,
    creditsRecovery: 0,
    unitCostExclExpenses: 2.19,
    displayUnitCosts: 25,
    displayMonthlyExpensesTotal: 105,
    totalUnitCost: 27.19,
    markupPercent: 30,
    marginPercent: 30,
    mode: 'margin_only',
    priceDrivingFactor: 'margin',
    priceByMarkup: 35.35,
    priceByMargin: 38.84,
    finalPrice: 38.84,
    pricedMonthlyTotal: 271.88,
    pricedUnitPrice: 38.84,
    profitPerUnit: 11.65,
    achievedMarkupPct: 42.8,
    achievedMarginPct: 30,
    monthlyQty: 7,
    monthlyRevenue: 271.88,
    monthlyProfit: 81.56,
    roaPct: 42.8,
    monthlyTargetQty: null,
    provisionQtyPerMonth: null,
    monthlyTargetRevenue: null,
    provisionRevenue: null,
    ...overrides,
  };
}

describe('tabela de precificação — colunas de custo', () => {
  it('headers e linha seguem a regra de preço (só markup, só margem ou ambos)', () => {
    expect(precificacaoTableColumnCount('markup_only')).toBe(9);
    expect(precificacaoTableColumnCount('margin_only')).toBe(9);
    expect(precificacaoTableColumnCount('both')).toBe(10);
    expect(showMarkupColumn('markup_only')).toBe(true);
    expect(showMarginColumn('markup_only')).toBe(false);
    expect(showMarkupColumn('margin_only')).toBe(false);
    expect(showMarginColumn('both')).toBe(true);
    for (const mode of ['markup_only', 'margin_only', 'both'] as const) {
      const headers = getPrecificacaoTableHeaders(mode);
      const row = buildPrecificacaoTableRow(sampleBreakdown({ mode }), 7, fmt, mode);
      expect(headers.length).toBe(precificacaoTableColumnCount(mode));
      expect(row).toHaveLength(headers.length);
    }
  });

  it('valor unitário exibido = pricedUnitPrice do cálculo', () => {
    const b = sampleBreakdown({ monthlyQty: 7, pricedMonthlyTotal: 431.48, pricedUnitPrice: 61.64 });
    const ws = createDefaultPricingWorkspace('Empresa');
    const qty = resolvePricingMonthlyQty(b, ws);
    expect(qty).toBe(7);
    expect(resolveDisplayedUnitPrice(b, qty)).toBeCloseTo(61.64, 2);
    expect(pricingRowArithmeticCheck(b, qty).matches).toBe(true);
  });

  it('venda total (mês) só calcula com qtd/mês informada', () => {
    const b = sampleBreakdown({ monthlyQty: 0, pricedMonthlyTotal: 2253.33, pricedUnitPrice: 2253.33 });
    expect(resolvePricingMonthlyTotal(b, 0)).toBeNull();
    expect(resolvePricingMonthlyTotal(b, 3)).toBeCloseTo(6759.99, 2);
    const row = buildPrecificacaoTableRow(b, 0, fmt, b.mode);
    expect(row[row.length - 1]).toBe('—');
  });

  it('modo both: valor de venda difere do custo material quando há markup e margem', () => {
    const pudim = createEmptyStockItem('Empresa', 'produto_acabado');
    pudim.useBom = false;
    pudim.directCost = 2.12;
    const row = computePricingBreakdowns({
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [normalizeStockItem(pudim)],
      settings: {
        ...createDefaultPricingWorkspace('Empresa').settings,
        markupPercent: 48,
        marginPercent: 50,
        mode: 'both',
      },
    })[0]!;
    expect(row.pricedUnitPrice).toBeGreaterThan(row.materialCost + 0.01);
    expect(row.pricedUnitPrice).not.toBeCloseTo(row.materialCost, 2);
  });

  it('modo both: markup e margem entram no preço (fórmula combinada)', () => {
    const pudim = createEmptyStockItem('Empresa', 'produto_acabado');
    pudim.useBom = false;
    pudim.directCost = 2.12;
    pudim.monthlyQty = 7;
    const ws = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [normalizeStockItem(pudim)],
      settings: {
        ...createDefaultPricingWorkspace('Empresa').settings,
        markupPercent: 48,
        marginPercent: 50,
        mode: 'both' as const,
      },
    };
    const row = computePricingBreakdowns(ws)[0]!;
    expect(row.priceDrivingFactor).toBe('both');
    expect(row.pricedUnitPrice).toBeCloseTo(priceFromMarkupAndMargin(2.12, 48, 50), 2);
    const moreMarkup = computePricingBreakdowns({
      ...ws,
      settings: { ...ws.settings, markupPercent: 49 },
    })[0]!;
    const moreMargin = computePricingBreakdowns({
      ...ws,
      settings: { ...ws.settings, marginPercent: 51 },
    })[0]!;
    expect(moreMarkup.pricedUnitPrice).toBeGreaterThan(row.pricedUnitPrice);
    expect(moreMargin.pricedUnitPrice).toBeGreaterThan(row.pricedUnitPrice);
  });

  it('0,1% de markup e 1% de margem alteram o preço final', () => {
    const cost = 10;
    expect(priceFromMarkupAndMargin(cost, 0.1, 1)).toBeGreaterThan(cost);
    expect(priceFromMarkupAndMargin(cost, 0, 0)).toBeCloseTo(cost, 4);
  });

  it('alterar markup muda o valor unitário (markup_only)', () => {
    const pudim = createEmptyStockItem('Empresa', 'produto_acabado');
    pudim.useBom = false;
    pudim.directCost = 2.12;
    pudim.monthlyQty = 7;
    const base = {
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [normalizeStockItem(pudim)],
      settings: { ...createDefaultPricingWorkspace('Empresa').settings, mode: 'markup_only' as const },
    };
    const low = computePricingBreakdowns({ ...base, settings: { ...base.settings, markupPercent: 10 } })[0]!;
    const high = computePricingBreakdowns({ ...base, settings: { ...base.settings, markupPercent: 40 } })[0]!;
    expect(high.pricedUnitPrice).toBeCloseTo(priceFromMarkup(2.12, 40), 2);
    expect(high.pricedUnitPrice).toBeGreaterThan(low.pricedUnitPrice);
  });


  it('expõe material, custos gerais e despesas por unidade', () => {
    const b = sampleBreakdown();
    const costs = pricingCostColumnValues(b);
    expect(costs.materialUnit).toBe(2.19);
    expect(costs.generalCostsUnit).toBe(25);
    expect(costs.allocatedCostsUnit).toBe(10);
    expect(costs.allocatedExpensesUnit).toBe(15);
  });

  it('mercadoria: custos gerais/un. = valor de compra (sem markup)', () => {
    const b = sampleBreakdown({
      category: 'mercadoria',
      materialCost: 1300,
      displayUnitCosts: 0,
      totalUnitCost: 1300,
      allocatedCosts: 0,
      allocatedExpenses: 0,
    });
    const costs = pricingCostColumnValues(b);
    expect(costs.materialUnit).toBeNull();
    expect(costs.generalCostsUnit).toBeCloseTo(1300, 2);
  });

  it('custo material na tabela usa materialCost/un., não soma do lote na BOM', () => {
    const b = sampleBreakdown({
      materialCost: 2.12,
      bomDetail: [
        { name: 'Leite', qty: '200 ml', cost: 7.2 },
        { name: 'Ovos', qty: '14 un', cost: 7.62 },
      ],
    });
    expect(sumBomDetailCosts(b.bomDetail)).toBeCloseTo(14.82, 2);
    expect(pricingMaterialUnitCost(b)).toBeCloseTo(2.12, 2);
    expect(pricingCostColumnValues(b).materialUnit).toBeCloseTo(2.12, 2);
  });
});
