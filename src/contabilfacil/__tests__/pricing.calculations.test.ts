import { describe, expect, it } from 'vitest';
import {
  computePricingBreakdowns,
  marginPercentToMarkupPercent,
  markupPercentToMarginPercent,
  priceFromMargin,
  resolvePricingSettingsOnModeChange,
} from '../logic/pricingCalculator';
import {
  createDefaultPricingWorkspace,
  createEmptyStockItem,
  normalizeStockItem,
} from '../logic/pricingTypes';
import { calcBasic, calcPercent } from '../logic/pricingMeasureCalculator';

describe('pricingMeasureCalculator — operações básicas', () => {
  it('adição: 10 + 5', () => {
    const result = calcBasic({ mode: 'adicao', a: 10, b: 5 });
    expect(result.error).toBeUndefined();
    expect(result.value).toBe(15);
  });

  it('subtração: 10 − 3', () => {
    const result = calcBasic({ mode: 'subtracao', a: 10, b: 3 });
    expect(result.value).toBe(7);
  });

  it('multiplicação: 4 × 2,5', () => {
    const result = calcBasic({ mode: 'multiplicacao', a: 4, b: 2.5 });
    expect(result.value).toBe(10);
  });

  it('divisão: 10 ÷ 4', () => {
    const result = calcBasic({ mode: 'divisao', a: 10, b: 4 });
    expect(result.value).toBe(2.5);
  });

  it('divisão por zero retorna erro', () => {
    const result = calcBasic({ mode: 'divisao', a: 10, b: 0 });
    expect(result.error).toMatch(/zero/i);
  });

  it('porcentagem: 30% de R$ 100', () => {
    const result = calcBasic({ mode: 'porcentagem', a: 30, b: 100 });
    expect(result.value).toBeCloseTo(30, 4);
  });

  it('markup 50% sobre custo R$ 10', () => {
    const result = calcPercent({ type: 'markup', percent: 50, baseValue: 10 });
    expect(result.primaryValue).toBeCloseTo(15, 4);
  });
});

describe('precificação — base de custo e conversão markup/margem', () => {
  it('50% de margem equivale a 100% de markup', () => {
    expect(marginPercentToMarkupPercent(50)).toBeCloseTo(100, 4);
    expect(markupPercentToMarginPercent(100)).toBeCloseTo(50, 4);
  });

  it('ao mudar para somente markup com margem preenchida, converte o percentual', () => {
    const patch = resolvePricingSettingsOnModeChange(
      { markupPercent: 0, marginPercent: 50, mode: 'margin_only' },
      'markup_only',
    );
    expect(patch.markupPercent).toBeCloseTo(100, 2);
  });

  it('margem de 50% incide sobre custo unitário total (material + rateio)', () => {
    const pudim = createEmptyStockItem('Empresa', 'produto_acabado');
    pudim.useBom = false;
    pudim.directCost = 2.19;
    pudim.monthlyQty = 7;
    const [row] = computePricingBreakdowns({
      ...createDefaultPricingWorkspace('Empresa'),
      stockItems: [normalizeStockItem(pudim)],
      costExpenses: [
        {
          id: 'd1',
          companyName: 'Empresa',
          segment: 'produto_acabado',
          type: 'despesa',
          name: 'Fixo',
          category: '',
          notes: '',
          monthlyAmount: 178.3,
          createdAt: new Date().toISOString(),
        },
      ],
      settings: {
        ...createDefaultPricingWorkspace('Empresa').settings,
        markupPercent: 0,
        marginPercent: 50,
        mode: 'margin_only',
      },
    });
    expect(row.pricedUnitPrice).toBeCloseTo(priceFromMargin(row.totalUnitCost, 50), 2);
    expect(row.pricedUnitPrice).toBeGreaterThan(row.totalUnitCost);
    expect(row.allocatedExpenses).toBeCloseTo(178.3 / 7, 2);
  });
});
