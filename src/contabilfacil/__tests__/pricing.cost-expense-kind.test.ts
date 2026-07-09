import { describe, expect, it } from 'vitest';
import { computeCostExpenseKindTotals } from '../logic/pricingTypes';
import type { CostExpenseItem } from '../logic/pricingTypes';

function row(
  partial: Pick<CostExpenseItem, 'type' | 'segment' | 'monthlyAmount'> &
    Partial<Pick<CostExpenseItem, 'kind'>>,
): CostExpenseItem {
  return {
    id: crypto.randomUUID(),
    companyName: 'Empresa',
    name: 'Teste',
    category: '',
    notes: '',
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe('computeCostExpenseKindTotals', () => {
  it('soma custos e despesas fixos e variáveis por segmento', () => {
    const items: CostExpenseItem[] = [
      row({ type: 'custo', segment: 'produto_acabado', monthlyAmount: 30000, kind: 'fixo' }),
      row({ type: 'custo', segment: 'produto_acabado', monthlyAmount: 500, kind: 'variavel' }),
      row({ type: 'despesa', segment: 'produto_acabado', monthlyAmount: 5000, kind: 'fixo' }),
      row({ type: 'despesa', segment: 'mercadoria', monthlyAmount: 200, kind: 'variavel' }),
    ];

    const pa = computeCostExpenseKindTotals(items, 'produto_acabado');
    expect(pa.fixedCosts).toBe(30000);
    expect(pa.variableCosts).toBe(500);
    expect(pa.fixedExpenses).toBe(5000);
    expect(pa.variableExpenses).toBe(0);

    const all = computeCostExpenseKindTotals(items);
    expect(all.variableExpenses).toBe(200);
  });

  it('trata lançamentos legados sem kind como fixo', () => {
    const items = [row({ type: 'custo', segment: 'servico', monthlyAmount: 1000 })];
    expect(computeCostExpenseKindTotals(items, 'servico').fixedCosts).toBe(1000);
  });
});
