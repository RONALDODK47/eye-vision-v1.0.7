import { describe, expect, it } from 'vitest';
import { validateAiRegraSugestao, validateAiRegrasLote } from './extratoRegrasAiPrecision';

const plano = [
  { code: '111', name: 'BANCO SICOOB', codigoReduzido: '100', group: 'ATIVO' },
  { code: '211', name: 'FORNECEDORES DIVERSOS', codigoReduzido: '200', group: 'PASSIVO' },
  { code: '112', name: 'CLIENTES DIVERSOS', codigoReduzido: '300', group: 'ATIVO' },
  { code: '113', name: 'EMPRESTIMO A RECEBER COLIGADAS', codigoReduzido: '150', group: 'ATIVO' },
  { code: '215', name: 'EMPRESTIMO SICOOB', codigoReduzido: '250', group: 'PASSIVO' },
  { code: '216', name: 'EMPRESTIMO SICOOB CTR-12345', codigoReduzido: '251', group: 'PASSIVO' },
  { code: '114', name: 'A.J.T.F. LTDA', codigoReduzido: '1094', group: 'ATIVO' },
  { code: '115', name: 'ACME COMERCIO ME', codigoReduzido: '402', group: 'PASSIVO' },
  { code: '312', name: 'TARIFAS BANCARIAS', codigoReduzido: '500', group: 'DESPESA' },
  { code: '116', name: 'FUNDO FIXO DE CAIXA', codigoReduzido: '85', group: 'ATIVO' },
];

const coligadas = [
  { id: '1', nome: 'AJTF', aliases: ['AJTF', 'A.J.T.F', 'A J T F'], contaReduzida: '1094' },
];

describe('validateAiRegraSugestao', () => {
  it('rejeita conta inventada', () => {
    expect(
      validateAiRegraSugestao(
        { descricao: 'PIX EMIT', nature: 'D', contaContrapartida: '99999' },
        plano,
      ),
    ).toBeNull();
  });

  it('aceita conta com match semântico (tarifa)', () => {
    const v = validateAiRegraSugestao(
      { descricao: 'TARIFA PACOTE', nature: 'D', contaContrapartida: '500' },
      [
        ...plano,
        { code: '312', name: 'TARIFAS BANCARIAS', codigoReduzido: '500', group: 'DESPESA' },
      ],
    );
    expect(v).not.toBeNull();
    expect(v!.contaContrapartida).toBe('500');
  });

  it('agrupa fornecedor nominal em conta geral', () => {
    const v = validateAiRegraSugestao(
      {
        descricao: 'PIX EMIT ACME COMERCIO ME',
        nature: 'D',
        contaContrapartida: '402',
      },
      plano,
    );
    expect(v).not.toBeNull();
    expect(v!.contaContrapartida).toBe('200');
    expect(v!.descricao).toBe('PIX EMIT');
  });

  it('corrige coligada que veio como fornecedor', () => {
    const v = validateAiRegraSugestao(
      {
        descricao: 'PIX EMIT',
        nature: 'D',
        contaContrapartida: '200',
      },
      plano,
      coligadas,
      [],
      ['PIX ENVIADO A J T F LTDA'],
    );
    expect(v).not.toBeNull();
    expect(v!.contaContrapartida).toBe('1094');
    expect(v!.descricao).toBe('AJTF');
  });

  it('corrige coligada que veio como fornecedor (descricao com nome)', () => {
    const v = validateAiRegraSugestao(
      {
        descricao: 'PIX ENVIADO A J T F LTDA',
        nature: 'D',
        contaContrapartida: '200',
      },
      plano,
      coligadas,
    );
    expect(v).not.toBeNull();
    expect(v!.contaContrapartida).toBe('1094');
  });

  it('empréstimo sem contrato vai para fundo fixo de caixa', () => {
    const v = validateAiRegraSugestao(
      {
        descricao: 'EMPRESTIMO CONCEDIDO COLIGADA',
        nature: 'D',
        contaContrapartida: '250',
      },
      plano,
    );
    expect(v).not.toBeNull();
    expect(v!.contaContrapartida).toBe('85');
  });

  it('empréstimo com contrato no histórico usa conta do plano', () => {
    const v = validateAiRegraSugestao(
      {
        descricao: 'AMORT EMPRESTIMO CTR-12345',
        nature: 'D',
        contaContrapartida: '250',
      },
      plano,
    );
    expect(v).not.toBeNull();
    expect(v!.contaContrapartida).toBe('251');
  });

  it('imposto RFB genérico vai para fundo fixo', () => {
    const v = validateAiRegraSugestao(
      {
        descricao: 'PGTO DARF RECEITA FEDERAL',
        nature: 'D',
        contaContrapartida: '250',
      },
      plano,
    );
    expect(v).not.toBeNull();
    expect(v!.contaContrapartida).toBe('85');
    expect(v!.descricao).toBe('IMPOSTO PENDENTE RFB');
  });

  it('corrige imposto genérico que IA mandou para conta de IRPJ', () => {
    const planoImposto = [
      ...plano,
      { code: '220', name: 'IRPJ A RECOLHER', codigoReduzido: '601', group: 'PASSIVO' },
    ];
    const v = validateAiRegraSugestao(
      {
        descricao: 'PGTO DARF RFB',
        nature: 'D',
        contaContrapartida: '601',
      },
      planoImposto,
      [],
      [],
      ['PGTO DARF RECEITA FEDERAL SEM DISCRIMINACAO'],
    );
    expect(v).not.toBeNull();
    expect(v!.contaContrapartida).toBe('85');
    expect(v!.descricao).toBe('IMPOSTO PENDENTE RFB');
  });

  it('corrige empréstimo com contrato identificado no doc de inteligência', () => {
    const v = validateAiRegraSugestao(
      {
        descricao: 'LIBERAC CRED EMPRESTIMO CTR-99999',
        nature: 'C',
        contaContrapartida: '150',
      },
      plano,
      [],
      ['Contrato de empréstimo CTR-99999 com banco Sicoob'],
    );
    expect(v).not.toBeNull();
    expect(v!.contaContrapartida).toBe('250');
  });

  it('aceita tarifa coerente', () => {
    const v = validateAiRegraSugestao(
      {
        descricao: 'TARIFA PACOTE SERVICOS',
        nature: 'D',
        contaContrapartida: '500',
      },
      plano,
    );
    expect(v).not.toBeNull();
    expect(v!.contaContrapartida).toBe('500');
  });

  it('corrige BB RENDE que veio como fornecedor', () => {
    const planoAplic = [
      ...plano,
      { code: '117', name: 'APLICACAO FINANCEIRA', codigoReduzido: '432', group: 'ATIVO' },
      { code: '418', name: 'RECEITA FINANCEIRA JUROS', codigoReduzido: '510', group: 'RECEITA' },
    ];
    const deb = validateAiRegraSugestao(
      { descricao: 'BB RENDE FACIL', nature: 'D', contaContrapartida: '200' },
      planoAplic,
    );
    expect(deb?.descricao).toBe('APLICACAO FINANCEIRA');
    expect(deb?.contaContrapartida).toBe('432');

    const cred = validateAiRegraSugestao(
      { descricao: 'RENDIMENTOS REND PAGO APLIC AUT', nature: 'C', contaContrapartida: '300' },
      planoAplic,
    );
    expect(cred?.descricao).toBe('RENDIMENTO APLICACAO');
    expect(cred?.contaContrapartida).toBe('510');
  });

  it('lote descarta inválidas e deduplica', () => {
    const out = validateAiRegrasLote(
      [
        { descricao: 'PIX EMIT A', nature: 'D', contaContrapartida: '200' },
        { descricao: 'PIX EMIT B', nature: 'D', contaContrapartida: '200' },
        { descricao: 'XYZ', nature: 'D', contaContrapartida: '999' },
      ],
      plano,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.descricao).toBe('PIX EMIT');
  });

  it('corrige PIX REC que IA mandou para imposto de renda', () => {
    const planoImposto = [
      ...plano,
      { code: '220', name: 'IMPOSTO DE RENDA A RECOLHER', codigoReduzido: '32', group: 'PASSIVO' },
    ];
    const v = validateAiRegraSugestao(
      { descricao: 'PIX REC', nature: 'C', contaContrapartida: '32' },
      planoImposto,
      [],
      [],
      ['PIX RECEBIDO CLIENTE ABC LTDA'],
    );
    expect(v).not.toBeNull();
    expect(v!.contaContrapartida).toBe('300');
    expect(v!.descricao).toBe('PIX REC');
  });

  it('corrige IA que sugeriu reavaliação para coligada', () => {
    const planoColig = [
      ...plano,
      { code: '114', name: 'A.J.T.F. LTDA', codigoReduzido: '1094', group: 'ATIVO' },
      { code: '256', name: 'REAVALIACAO DE ATIVOS', codigoReduzido: '256', group: 'ATIVO' },
    ];
    const v = validateAiRegraSugestao(
      { descricao: 'AJTF', nature: 'D', contaContrapartida: '256' },
      planoColig,
      coligadas,
    );
    expect(v).not.toBeNull();
    expect(v!.contaContrapartida).toBe('1094');
  });
});
