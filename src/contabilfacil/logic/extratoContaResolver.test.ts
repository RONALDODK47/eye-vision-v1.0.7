import { describe, expect, it } from 'vitest';
import {
  applyExtratoContaResolver,
  cacheKeyExtratoConta,
  classificarOperacaoExtrato,
  normalizeSignificadoExtrato,
  parentGrupoConta,
  resolveExtratoContasDebitoCredito,
  type ExtratoContaMappingCache,
  type ExtratoContaPlanoLike,
} from './extratoContaResolver';
import { readReceitaFederalRegras } from '../../extratoVision/utils/receitaFederalRegras';
import { emptyFiscalContasImposto } from './fiscalContasImposto';
import type { ExtratoFiscalContext } from './extratoFiscalContext';

const plano: ExtratoContaPlanoLike[] = [
  { code: '1.01.01', name: 'ATIVO', tipo: 'S', group: 'ATIVO' },
  { code: '1.01.01.0001', name: 'CAIXA GERAL', tipo: 'A', group: 'ATIVO' },
  { code: '1.01.02.0001', name: 'BANCO SICOOB', tipo: 'A', group: 'ATIVO' },
  { code: '1.01.03.0001', name: 'BANCO BB', tipo: 'A', group: 'ATIVO' },
  { code: '2.01.01.0001', name: 'FORNECEDORES NACIONAIS', tipo: 'A', group: 'PASSIVO' },
  { code: '2.01.01.0002', name: 'FORNECEDORES DIV', tipo: 'A', group: 'PASSIVO' },
  { code: '2.01.01.0003', name: 'FORNECEDORES ESTRANGEIROS', tipo: 'A', group: 'PASSIVO' },
  { code: '3.01.01', name: 'DESPESAS OPERACIONAIS', tipo: 'S', group: 'DESPESA' },
  { code: '3.01.01.0001', name: 'TELEFONE FIXO', tipo: 'A', group: 'DESPESA' },
  { code: '3.01.01.0002', name: 'TELEFONE CELULAR', tipo: 'A', group: 'DESPESA' },
  { code: '3.01.02.0001', name: 'ENERGIA ELETRICA', tipo: 'A', group: 'DESPESA' },
  { code: '3.02.01.0001', name: 'TARIFAS BANCARIAS', tipo: 'A', group: 'DESPESA' },
  { code: '4.01.01.0001', name: 'RECEITA DE SERVICOS', tipo: 'A', group: 'RECEITA' },
];

describe('normalizeSignificadoExtrato', () => {
  it('remove ruído e normaliza acentos', () => {
    expect(normalizeSignificadoExtrato('Pgto. fatura telefone móvel 10/03')).toBe(
      'PGTO FATURA TELEFONE MOVEL',
    );
  });
});

describe('parentGrupoConta', () => {
  it('agrupa analíticas do mesmo bloco sintético', () => {
    expect(parentGrupoConta('3.01.01.0001')).toBe('3.01.01');
    expect(parentGrupoConta('3.01.01.0002')).toBe('3.01.01');
  });
});

describe('classificarOperacaoExtrato', () => {
  it('identifica tarifa bancária e PIX enviado', () => {
    expect(classificarOperacaoExtrato('TARIFA PACOTE SERVICOS', 'D')).toBe('TARIFA_BANCARIA');
    expect(classificarOperacaoExtrato('PIX ENV JOAO SILVA', 'D')).toBe('PAGAMENTO_FORNECEDOR');
    expect(classificarOperacaoExtrato('PIX EMIT OUTRA PAGAMENTO', 'D')).toBe('PAGAMENTO_FORNECEDOR');
    expect(classificarOperacaoExtrato('PIX REC CLIENTE ABC', 'C')).toBe('RECEBIMENTO_CLIENTE');
    expect(classificarOperacaoExtrato('DEB TIT COMPE EFETI', 'D')).toBe('PAGAMENTO_FORNECEDOR');
    expect(classificarOperacaoExtrato('CRED LIQ COBRANCA', 'C')).toBe('LIQUIDACAO_COBRANCA');
  });

  it('empréstimo: pagamento/amortização → passivo; concessão (saída) → ativo; liberação (entrada) → passivo', () => {
    expect(classificarOperacaoExtrato('AMORT EMPRESTIMO SICOOB', 'D')).toBe('EMPRESTIMO_PAGAMENTO');
    expect(classificarOperacaoExtrato('PARCELA EMPRESTIMO BANCO', 'D')).toBe('EMPRESTIMO_PAGAMENTO');
    expect(classificarOperacaoExtrato('PAGAMENTO EMPRESTIMO CONTRATO', 'D')).toBe('EMPRESTIMO_PAGAMENTO');
    // Saída genérica (incl. DEB EMPREST) = concessão → ativo, não passivo.
    expect(classificarOperacaoExtrato('DEB EMPREST CONTRATO 123', 'D')).toBe('EMPRESTIMO_CONCESSAO');
    expect(classificarOperacaoExtrato('EMPRESTIMO CONCEDIDO COLIGADA', 'D')).toBe('EMPRESTIMO_CONCESSAO');
    expect(classificarOperacaoExtrato('MUTUO ENTRE EMPRESAS AJTF', 'D')).toBe('EMPRESTIMO_CONCESSAO');
    expect(classificarOperacaoExtrato('LIBERAC CRED EMPRESTIMO', 'C')).toBe('EMPRESTIMO_RECEBIMENTO');
    expect(classificarOperacaoExtrato('CREDITO EMPRESTIMO BANCO', 'C')).toBe('EMPRESTIMO_RECEBIMENTO');
  });
});

describe('resolveExtratoContasDebitoCredito', () => {
  it('sem regra: contrapartida em branco e banco salvo no crédito (débito)', () => {
    const r = resolveExtratoContasDebitoCredito({
      description: 'DEBITO FATURA TELEFONE FIXO',
      nature: 'D',
      plano,
      cache: {},
      contaBancoPreferida: '1.01.02.0001',
    });
    expect(r.contaDebito).toBe('');
    expect(r.contaCredito).toBe('1.01.02.0001');
  });

  it('sem regra: contrapartida em branco e banco salvo no débito (crédito)', () => {
    const r = resolveExtratoContasDebitoCredito({
      description: 'CREDITO RECEITA SERVICOS',
      nature: 'C',
      plano,
      cache: {},
      contaBancoPreferida: '1.01.02.0001',
    });
    expect(r.contaDebito).toBe('1.01.02.0001');
    expect(r.contaCredito).toBe('');
  });

  it('não infere tarifa nem fornecedor sem regra cadastrada', () => {
    const tarifa = resolveExtratoContasDebitoCredito({
      description: 'TARIFA PACOTE SERVICOS',
      nature: 'D',
      plano,
      cache: {},
      contaBancoPreferida: '1.01.02.0001',
    });
    expect(tarifa.contaDebito).toBe('');
    expect(tarifa.contaCredito).toBe('1.01.02.0001');

    const pix = resolveExtratoContasDebitoCredito({
      description: 'PIX ENV 12345678900',
      nature: 'D',
      plano,
      cache: {},
      contaBancoPreferida: '1.01.02.0001',
    });
    expect(pix.contaDebito).toBe('');
    expect(pix.contaCredito).toBe('1.01.02.0001');
  });

  it('transferência não escolhe segundo banco automaticamente', () => {
    const r = resolveExtratoContasDebitoCredito({
      description: 'TRANSFERENCIA ENTRE CONTAS',
      nature: 'D',
      plano,
      cache: {},
      contaBancoPreferida: '1.01.02.0001',
    });
    expect(r.logica).toBe('TRANSFERENCIA');
    expect(r.contaCredito).toBe('1.01.02.0001');
    expect(r.contaDebito).toBe('');
  });

  it('ignora cache antigo sem regra de contas', () => {
    const significado = normalizeSignificadoExtrato('DEBITO ENERGIA ELETRICA');
    const cache: ExtratoContaMappingCache = {
      [cacheKeyExtratoConta(significado, 'D')]: {
        contaDebito: '3.01.01.0001',
        contaCredito: '1.01.02.0001',
      },
    };
    const r = resolveExtratoContasDebitoCredito({
      description: 'DEBITO ENERGIA ELETRICA',
      nature: 'D',
      plano,
      cache,
      contaBancoPreferida: '1.01.03.0001',
    });
    expect(r.fromCache).toBeFalsy();
    expect(r.contaCredito).toBe('1.01.03.0001');
    expect(r.contaDebito).toBe('');
  });

  it('usa conta banco preferida do layout OCR salvo', () => {
    const r = resolveExtratoContasDebitoCredito({
      description: 'DEBITO ENERGIA ELETRICA',
      nature: 'D',
      plano,
      cache: {},
      contaBancoPreferida: '1.01.03.0001',
    });
    expect(r.contaCredito).toBe('1.01.03.0001');
    expect(r.contaDebito).toBe('');
  });

  it('não usa primeiro banco do plano quando conta salva ausente', () => {
    const r = resolveExtratoContasDebitoCredito({
      description: 'DEBITO ENERGIA ELETRICA',
      nature: 'D',
      plano,
      cache: {},
    });
    expect(r.contaCredito).toBe('');
    expect(r.contaDebito).toBe('');
  });

  it('par manual válido força banco salvo no lado correto', () => {
    const r = resolveExtratoContasDebitoCredito({
      description: 'DEBITO ENERGIA ELETRICA',
      nature: 'D',
      plano,
      cache: {},
      contaBancoPreferida: '1.01.03.0001',
      contaDebitoManual: '3.01.02.0001',
      contaCreditoManual: '1.01.02.0001',
    });
    expect(r.contaDebito).toBe('3.01.02.0001');
    expect(r.contaCredito).toBe('1.01.03.0001');
  });

  it('não infere fornecedor via RF sem regra cadastrada', () => {
    const rfStore = readReceitaFederalRegras('TESTE');
    const r = resolveExtratoContasDebitoCredito({
      description: 'DEB.TIT.COMPE.EFETI',
      nature: 'D',
      plano,
      cache: {},
      contaBancoPreferida: '1.01.02.0001',
      rfStore,
    });
    expect(r.contaCredito).toBe('1.01.02.0001');
    expect(r.contaDebito).toBe('');
    expect(r.rfRegraId).toBeFalsy();
  });
});

describe('contabilidade senior (plano real)', () => {
  const planoReal: ExtratoContaPlanoLike[] = [
    { code: '1110200001', name: 'BANCO SICOOB', tipo: 'A', group: 'ATIVO', codigoReduzido: '1110200001' },
    { code: '1110200002', name: 'BANCO CRESOL', tipo: 'A', group: 'ATIVO', codigoReduzido: '1110200002' },
    { code: '2110100001', name: 'FORNECEDORES DIVERSOS', tipo: 'A', group: 'PASSIVO' },
    { code: '2110200002', name: 'FORNECEDORES ESTRANGEIROS', tipo: 'A', group: 'PASSIVO' },
    { code: '1150100008', name: '(-) BAIXA CUSTO MERCADORIA VENDIDA', tipo: 'A', group: 'ATIVO' },
    { code: '2150100001', name: 'EMPRESTIMO SICOOB', tipo: 'A', group: 'PASSIVO' },
    { code: '1130100001', name: 'EMPRESTIMO A RECEBER COLIGADAS', tipo: 'A', group: 'ATIVO' },
    { code: '2120100004', name: 'PROVISAO PARA IMPOSTO DE RENDA', tipo: 'A', group: 'PASSIVO' },
    { code: '5110100001', name: 'RESULTADO DO EXERCICIO', tipo: 'A', group: 'DESPESA' },
    { code: '3120100001', name: 'TARIFAS BANCARIAS', tipo: 'A', group: 'DESPESA' },
    { code: '4120100001', name: 'RECEITA DE VENDAS', tipo: 'A', group: 'RECEITA' },
    { code: '1120100001', name: 'CLIENTES DIVERSOS', tipo: 'A', group: 'ATIVO' },
  ];

  it('sem regra: PIX emitido deixa contrapartida em branco', () => {
    const rfStore = readReceitaFederalRegras('TESTE');
    const r = resolveExtratoContasDebitoCredito({
      description: 'DOC.: PIX EMIT.OUTRA PAGAMENTO PIX',
      nature: 'D',
      plano: planoReal,
      cache: {},
      contaBancoPreferida: '1110200001',
      rfStore,
    });
    expect(r.contaCredito).toBe('1110200001');
    expect(r.contaDebito).toBe('');
  });

  it('classifica concessão de empréstimo (saída) como EMPRESTIMO_CONCESSAO', () => {
    expect(classificarOperacaoExtrato('EMPRESTIMO CONCEDIDO COLIGADA AJTF', 'D')).toBe(
      'EMPRESTIMO_CONCESSAO',
    );
    expect(classificarOperacaoExtrato('AMORT EMPRESTIMO SICOOB', 'D')).toBe('EMPRESTIMO_PAGAMENTO');
    expect(classificarOperacaoExtrato('LIBERACAO CREDITO EMPRESTIMO', 'C')).toBe(
      'EMPRESTIMO_RECEBIMENTO',
    );
  });
});

describe('applyExtratoContaResolver', () => {
  it('sem regra: contrapartida permanece em branco', () => {
    const rows = [
      {
        description: 'DEBITO FATURA TELEFONE FIXO',
        nature: 'D' as const,
      },
      {
        description: 'DEBITO TELEFONE CELULAR OPERADORA',
        nature: 'D' as const,
      },
    ];
    const { rows: out } = applyExtratoContaResolver(rows, plano, {}, {
      contaBancoPreferida: '1.01.02.0001',
    });
    expect(out[0]!.accountDebit).toBeFalsy();
    expect(out[0]!.accountCredit).toBe('1.01.02.0001');
    expect(out[0]!.accountCode).toBe('');
    expect(out[1]!.accountDebit).toBeFalsy();
    expect(out[1]!.accountCredit).toBe('1.01.02.0001');
  });

  it('preserva conciliação manual já gravada (não apaga no auto-reapply)', () => {
    const { rows: out } = applyExtratoContaResolver(
      [
        {
          id: '1',
          description: 'CREDITO PIX RECEBIDO',
          nature: 'C' as const,
          accountDebit: '1.01.02.0001',
          accountCredit: '4.01.01.0001',
        },
      ],
      plano,
      {},
      { contaBancoPreferida: '1.01.02.0001' },
    );
    expect(out[0]!.accountDebit).toBe('1.01.02.0001');
    expect(out[0]!.accountCredit).toBe('4.01.01.0001');
  });

  it('preserva contrapartida digitada no campo débito em lançamento tipo C', () => {
    const { rows: out } = applyExtratoContaResolver(
      [
        {
          id: '2',
          description: 'CREDITO RECEBIMENTO',
          nature: 'C' as const,
          accountDebit: '4.01.01.0001',
          accountCredit: '',
        },
      ],
      plano,
      {},
      { contaBancoPreferida: '1.01.02.0001' },
    );
    expect(out[0]!.accountDebit).toBe('1.01.02.0001');
    expect(out[0]!.accountCredit).toBe('4.01.01.0001');
  });

  it('não apaga conta manual incompleta ainda não validada no plano', () => {
    const { rows: out } = applyExtratoContaResolver(
      [
        {
          id: '3',
          description: 'CREDITO PIX',
          nature: 'C' as const,
          accountDebit: '9',
          accountCredit: '',
        },
      ],
      plano,
      {},
      { contaBancoPreferida: '1.01.02.0001' },
    );
    expect(out[0]!.accountDebit).toBe('1.01.02.0001');
    expect(out[0]!.accountCredit).toBe('9');
  });

  it('não replica conta banco no accountCode legado (evita débito e crédito iguais na tela)', () => {
    const { rows: out } = applyExtratoContaResolver(
      [
        {
          description: 'PIX ENV FORNECEDOR',
          nature: 'D' as const,
          accountCode: '1.1.1.02.000',
        },
      ],
      plano,
      {},
      { contaBancoPreferida: '1.1.1.02.000' },
    );
    expect(out[0]!.accountCredit).toBe('1.1.1.02.000');
    expect(out[0]!.accountDebit).toBeFalsy();
    expect(out[0]!.accountCode).toBe('');
  });
});

describe('saída sem NF (histórico vago)', () => {
  const planoSemNota: ExtratoContaPlanoLike[] = [
    { code: '1110200001', name: 'BANCO SICOOB', tipo: 'A', group: 'ATIVO' },
    { code: '2110100001', name: 'FORNECEDORES DIVERSOS', tipo: 'A', group: 'PASSIVO' },
    { code: '3120200001', name: 'USO E CONSUMO', tipo: 'A', group: 'DESPESA' },
  ];

  const fiscalVazio: ExtratoFiscalContext = {
    contasConfig: emptyFiscalContasImposto(),
    entries: [],
  };

  it('histórico vago deixa contrapartida em branco (sem diálogo sem NF)', () => {
    const r = resolveExtratoContasDebitoCredito({
      description: 'PAGAMENTO',
      nature: 'D',
      value: 500,
      date: '2025-03-10',
      plano: planoSemNota,
      cache: {},
      contaBancoPreferida: '1110200001',
      fiscalContext: fiscalVazio,
    });
    expect(r.needsSemNotaConfirm).toBeFalsy();
    expect(r.contaDebito).toBe('');
    expect(r.contaCredito).toBe('1110200001');
  });

  it('applyExtratoContaResolver não gera pendingSemNota sem regra', () => {
    const { rows: out, pendingSemNota } = applyExtratoContaResolver(
      [{ description: 'PAGAMENTO', nature: 'D' as const, value: 500, date: '2025-03-10' }],
      planoSemNota,
      {},
      { contaBancoPreferida: '1110200001', fiscalContext: fiscalVazio },
    );
    expect(pendingSemNota).toHaveLength(0);
    expect(out[0]!.accountCredit).toBe('1110200001');
    expect(out[0]!.accountDebit).toBeFalsy();
  });
});

describe('regras de contas personalizadas', () => {
  const planoRegras: ExtratoContaPlanoLike[] = [
    { code: '1110200001', name: 'BANCO SICOOB', tipo: 'A', group: 'ATIVO' },
    { code: '2110100001', name: 'FORNECEDORES DIVERSOS', tipo: 'A', group: 'PASSIVO' },
    { code: '2120100005', name: 'SALARIOS A PAGAR', tipo: 'A', group: 'PASSIVO' },
    { code: '2120100010', name: 'PRO LABORE A PAGAR', tipo: 'A', group: 'PASSIVO' },
  ];

  const regras = [
    {
      id: 'r1',
      nome: 'Folha Maria',
      descricao: 'MARIA SILVA',
      nature: 'D' as const,
      contaBanco: '1110200001',
      contaContrapartida: '2120100005',
    },
    {
      id: 'r2',
      nome: 'Socio Carlos',
      descricao: 'CARLOS EDUARDO',
      nature: 'D' as const,
      contaBanco: '1110200001',
      contaContrapartida: '2120100010',
    },
  ];

  it('PIX com descricao cadastrada usa conta da regra', () => {
    const r = resolveExtratoContasDebitoCredito({
      description: 'PIX EMIT OUTRA PAGAMENTO MARIA SILVA',
      nature: 'D',
      plano: planoRegras,
      cache: {},
      contaBancoPreferida: '1110200001',
      regrasContas: regras,
    });
    expect(r.regraContaId).toBe('r1');
    expect(r.contaDebito).toBe('2120100005');
    expect(r.contaCredito).toBe('1110200001');
    expect(r.contaDebito).not.toBe('2110100001');
  });

  it('regra de socio tem prioridade sobre fornecedor generico', () => {
    const r = resolveExtratoContasDebitoCredito({
      description: 'TED ENV CARLOS EDUARDO',
      nature: 'D',
      plano: planoRegras,
      cache: {},
      contaBancoPreferida: '1110200001',
      regrasContas: regras,
    });
    expect(r.regraContaId).toBe('r2');
    expect(r.contaDebito).toBe('2120100010');
  });

  it('regra vence par auto-preenchido errado (estrangeiros) no reaplicar', () => {
    const regraCompe = [
      {
        id: 'r-compe',
        nome: 'COMPE',
        descricao: 'DEB TIT COMPE EFETI',
        nature: 'D' as const,
        contaBanco: '1110200001',
        contaContrapartida: '2110100001',
      },
    ];
    const planoCompe: ExtratoContaPlanoLike[] = [
      ...planoRegras,
      { code: '2110200002', name: 'FORNECEDORES ESTRANGEIROS', tipo: 'A', group: 'PASSIVO' },
    ];
    const r = resolveExtratoContasDebitoCredito({
      description: 'DEB.TIT.COMPE.EFETI',
      nature: 'D',
      plano: planoCompe,
      cache: {},
      contaBancoPreferida: '1110200001',
      regrasContas: regraCompe,
      contaDebitoManual: '2110200002',
      contaCreditoManual: '1110200001',
    });
    expect(r.regraContaId).toBe('r-compe');
    expect(r.contaDebito).toBe('2110100001');
    expect(r.contaDebito).not.toBe('2110200002');
    expect(r.contaCredito).toBe('1110200001');
  });

  it('entrada (C): banco no débito e contrapartida no crédito — nunca iguais', () => {
    const regrasC = [
      {
        id: 'r-ted',
        nome: 'TED Marcia',
        descricao: 'MARCIA RODRIGUES',
        nature: 'C' as const,
        contaBanco: '1000',
        contaContrapartida: '2001',
      },
    ];
    const planoC: ExtratoContaPlanoLike[] = [
      { code: '1000', name: 'BANCO SICOOB', tipo: 'A', group: 'ATIVO', codigoReduzido: '1000' },
      { code: '2001', name: 'CLIENTES DIVERSOS', tipo: 'A', group: 'ATIVO', codigoReduzido: '2001' },
    ];
    const r = resolveExtratoContasDebitoCredito({
      description: 'TED RECEBIDA MARCIA RODRIGUES DE SOUZA',
      nature: 'C',
      plano: planoC,
      cache: {},
      contaBancoPreferida: '1000',
      regrasContas: regrasC,
    });
    expect(r.regraContaId).toBe('r-ted');
    expect(r.contaDebito).toBe('1000');
    expect(r.contaCredito).toBe('2001');
    expect(r.contaDebito).not.toBe(r.contaCredito);
  });

  it('saída (D): banco no crédito e contrapartida no débito — nunca iguais', () => {
    const regrasD = [
      {
        id: 'r-sis',
        nome: 'SISPAG',
        descricao: 'SISPAG FORNECEDORES',
        nature: 'D' as const,
        contaBanco: '1004',
        contaContrapartida: '3001',
      },
    ];
    const planoD: ExtratoContaPlanoLike[] = [
      { code: '1004', name: 'BANCO ITAU', tipo: 'A', group: 'ATIVO', codigoReduzido: '1004' },
      { code: '3001', name: 'FORNECEDORES', tipo: 'A', group: 'PASSIVO', codigoReduzido: '3001' },
    ];
    const r = resolveExtratoContasDebitoCredito({
      description: 'SISPAG FORNECEDORES',
      nature: 'D',
      plano: planoD,
      cache: {},
      contaBancoPreferida: '1004',
      regrasContas: regrasD,
    });
    expect(r.regraContaId).toBe('r-sis');
    expect(r.contaDebito).toBe('3001');
    expect(r.contaCredito).toBe('1004');
    expect(r.contaDebito).not.toBe(r.contaCredito);
  });
});
