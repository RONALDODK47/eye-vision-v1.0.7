import { describe, expect, it } from 'vitest';
import type { ExtratoFiscalContext } from './extratoFiscalContext';
import { matchExtratoComFiscal } from './extratoFiscalMatcher';
import { resolveExtratoContasDebitoCredito, type ExtratoContaPlanoLike } from './extratoContaResolver';
import { emptyFiscalContasImposto } from './fiscalContasImposto';

const plano: ExtratoContaPlanoLike[] = [
  { code: '1.01.02.0001', name: 'BANCO SICOOB', tipo: 'A', group: 'ATIVO' },
  { code: '2.01.01.0002', name: 'FORNECEDORES DIVERSOS', tipo: 'A', group: 'PASSIVO' },
  { code: '3.02.01.0001', name: 'ICMS S/ COMPRAS', tipo: 'A', group: 'DESPESA' },
  { code: '2.01.08.0001', name: 'ICMS A RECOLHER', tipo: 'A', group: 'PASSIVO' },
  { code: '4.01.01.0001', name: 'RECEITA SERVICOS', tipo: 'A', group: 'RECEITA' },
];

const fiscalCtx: ExtratoFiscalContext = {
  contasConfig: {
    ...emptyFiscalContasImposto(),
    ICMS: { debito: '3.02.01.0001', credito: '2.01.08.0001' },
  },
  entries: [
    {
      valor: 1500,
      mesRef: '2025-03',
      data: '01/03/2025 — 31/03/2025',
      imposto: 'ICMS',
      kind: 'acumulador',
      descricao: 'Total débitos ICMS (E110)',
      registro: 'E110',
      codigo: 'E110-DEB',
      acumuladorKey: 'E110|E110-DEB|ICMS',
      contaDebito: '3.02.01.0001',
      contaCredito: '2.01.08.0001',
    },
    {
      valor: 320.5,
      mesRef: '2025-03',
      data: '15/03/2025',
      imposto: 'ICMS',
      kind: 'imposto',
      descricao: 'ICMS a recolher (E116)',
      registro: 'E116',
      codigo: 'E116',
      acumuladorKey: 'E116|E116|ICMS',
      contaDebito: '3.02.01.0001',
      contaCredito: '2.01.08.0001',
    },
  ],
  acumuladorRegras: [],
};

describe('matchExtratoComFiscal', () => {
  it('encontra acumulador fiscal pelo valor e mês (com NF → fornecedor no resolver)', () => {
    const m = matchExtratoComFiscal(fiscalCtx, {
      date: '2025-03-10',
      value: 1500,
      nature: 'D',
      description: 'PGTO FORNECEDOR MATERIAIS',
    });
    expect(m?.kind).toBe('com_nf');
    expect(m?.contaContrapartida).toBe('3.02.01.0001');
  });

  it('encontra imposto a recolher no pagamento DARF', () => {
    const m = matchExtratoComFiscal(fiscalCtx, {
      date: '2025-03-15',
      value: 320.5,
      nature: 'D',
      description: 'DARF ICMS MARCO',
    });
    expect(m?.kind).toBe('imposto');
    expect(m?.contaContrapartida).toBe('2.01.08.0001');
  });
});

describe('resolveExtratoContasDebitoCredito + fiscal', () => {
  it('sem regra cadastrada: fiscal não preenche contrapartida', () => {
    const r = resolveExtratoContasDebitoCredito({
      description: 'COMPRA COM NF',
      nature: 'D',
      value: 1500,
      date: '2025-03-12',
      plano,
      cache: {},
      contaBancoPreferida: '1.01.02.0001',
      fiscalContext: fiscalCtx,
    });
    expect(r.fiscalMatch).toBeFalsy();
    expect(r.contaDebito).toBe('');
    expect(r.contaCredito).toBe('1.01.02.0001');
  });

  it('sem regra: PIX deixa contrapartida em branco', () => {
    const r = resolveExtratoContasDebitoCredito({
      description: 'PIX ENV FORNECEDOR',
      nature: 'D',
      value: 99.9,
      date: '2025-03-12',
      plano,
      cache: {},
      contaBancoPreferida: '1.01.02.0001',
      fiscalContext: fiscalCtx,
    });
    expect(r.fiscalMatch).toBeFalsy();
    expect(r.contaDebito).toBe('');
    expect(r.contaCredito).toBe('1.01.02.0001');
  });
});
