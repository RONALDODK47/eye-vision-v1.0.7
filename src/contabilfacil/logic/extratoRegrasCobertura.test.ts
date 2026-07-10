import { describe, expect, it } from 'vitest';
import {
  buildFallbackRegrasParaCobertura,
  corrigeRegrasColigadasExistentes,
  corrigeRegrasContasOperacionaisInadequadas,
  agrupaPadroesExtratoParaIa,
  extractPadraoOperacionalAgrupado,
  findUncoveredExtratoRows,
  isContaNominalEmpresa,
  isImpostoGenericoAmbiguous,
  isImpostoSemTipoIdentificavel,
  isLancamentoFornecedorOuClienteGenerico,
  pickFallbackContaPorNatureza,
  pickFundoFixoCaixaConta,
  updateExistingRegrasFromUserChatIntent,
} from './extratoRegrasCobertura';
import type { ExtratoRegraConta } from './extratoRegrasContasStorage';

const plano = [
  { code: '111', name: 'BANCO SICOOB', codigoReduzido: '100' },
  { code: '211', name: 'FORNECEDORES DIVERSOS', codigoReduzido: '200' },
  { code: '112', name: 'CLIENTES DIVERSOS', codigoReduzido: '300' },
  { code: '113', name: 'FUNDO FIXO DE CAIXA', codigoReduzido: '85' },
  { code: '114', name: 'POLO SUL CLIMATIZACAO LTDA', codigoReduzido: '401' },
  { code: '115', name: 'ACME COMERCIO ME', codigoReduzido: '402' },
];

describe('pickFallbackContaPorNatureza', () => {
  it('escolhe fornecedor em saída e cliente em entrada', () => {
    expect(pickFallbackContaPorNatureza('D', plano)).toBe('200');
    expect(pickFallbackContaPorNatureza('C', plano)).toBe('300');
  });

  it('sem conta de clientes usa fundo fixo (não imposto aleatório)', () => {
    const planoSemCliente = [
      { code: '111', name: 'BANCO SICOOB', codigoReduzido: '100' },
      { code: '220', name: 'IMPOSTO DE RENDA A RECOLHER', codigoReduzido: '32' },
      { code: '113', name: 'FUNDO FIXO DE CAIXA', codigoReduzido: '85' },
    ];
    expect(pickFallbackContaPorNatureza('C', planoSemCliente)).toBe('85');
  });
});

describe('corrigeRegrasContasOperacionaisInadequadas', () => {
  it('corrige PIX REC apontando para imposto de renda', () => {
    const planoImposto = [
      ...plano,
      { code: '220', name: 'IMPOSTO DE RENDA A RECOLHER', codigoReduzido: '32' },
    ];
    const regras: ExtratoRegraConta[] = [
      {
        id: '1',
        nome: 'PIX REC',
        descricao: 'PIX REC',
        nature: 'C',
        contaBanco: '100',
        contaContrapartida: '32',
      },
    ];
    const fixed = corrigeRegrasContasOperacionaisInadequadas({
      regras,
      plano: planoImposto,
    });
    expect(fixed[0]!.contaContrapartida).toBe('300');
  });
});

describe('fundo fixo pendência', () => {
  it('acha fundo fixo de caixa no plano', () => {
    expect(pickFundoFixoCaixaConta(plano)).toBe('85');
  });

  it('detecta imposto RFB genérico', () => {
    expect(isImpostoGenericoAmbiguous('PGTO DARF RFB')).toBe(true);
    expect(isImpostoGenericoAmbiguous('DARF IRPJ MENSAL')).toBe(false);
    expect(isImpostoSemTipoIdentificavel('SISPAG TRIBUTO ORGAOS GOV')).toBe(true);
    expect(isImpostoSemTipoIdentificavel('PGTO CODE CONV ORGAOS')).toBe(true);
    expect(isImpostoSemTipoIdentificavel('DARF PIS FEDERAL')).toBe(false);
  });

  it('fallback cobre DARF genérico em fundo fixo', () => {
    const regras = buildFallbackRegrasParaCobertura({
      uncovered: [{ description: 'PGTO DARF RECEITA FEDERAL', nature: 'D', value: 100 }],
      contaBanco: '100',
      plano,
    });
    expect(regras).toHaveLength(1);
    expect(regras[0]!.contaContrapartida).toBe('85');
  });

  it('fallback cobre empréstimo sem contrato em fundo fixo', () => {
    const regras = buildFallbackRegrasParaCobertura({
      uncovered: [{ description: 'DEBITO AMORT EMPRESTIMO SICOOB', nature: 'D', value: 500 }],
      contaBanco: '100',
      plano,
    });
    expect(regras).toHaveLength(1);
    expect(regras[0]!.contaContrapartida).toBe('85');
  });
});

describe('agrupamento fornecedor/cliente', () => {
  it('detecta conta nominal de empresa', () => {
    expect(isContaNominalEmpresa('POLO SUL CLIMATIZACAO LTDA')).toBe(true);
    expect(isContaNominalEmpresa('FORNECEDORES DIVERSOS')).toBe(false);
    expect(isContaNominalEmpresa('CLIENTES DIVERSOS')).toBe(false);
  });

  it('agrupa PIX emitidos de empresas diferentes na mesma regra/conta geral', () => {
    const uncovered = [
      { description: 'PIX EMIT ACME COMERCIO ME', nature: 'D', value: 10 },
      { description: 'PIX EMIT OUTRA EMPRESA XYZ LTDA', nature: 'D', value: 20 },
      { description: 'PIX REC CLIENTE ABC LTDA', nature: 'C', value: 30 },
    ];
    expect(isLancamentoFornecedorOuClienteGenerico(uncovered[0]!.description, 'D')).toBe(true);
    expect(extractPadraoOperacionalAgrupado(uncovered[0]!.description, 'D')).toBe('PIX EMIT');

    const regras = buildFallbackRegrasParaCobertura({
      uncovered,
      contaBanco: '100',
      plano,
    });

    expect(regras).toHaveLength(2);
    const saida = regras.find((r) => r.nature === 'D');
    const entrada = regras.find((r) => r.nature === 'C');
    expect(saida?.descricao).toBe('PIX EMIT');
    expect(saida?.contaContrapartida).toBe('200');
    expect(entrada?.descricao).toBe('PIX REC');
    expect(entrada?.contaContrapartida).toBe('300');
    expect(regras.every((r) => r.contaContrapartida === '200' || r.contaContrapartida === '300')).toBe(
      true,
    );
    expect(findUncoveredExtratoRows(uncovered, regras)).toHaveLength(0);
  });

  it('agrupa nomes de terceiros em RECEBIMENTO CLIENTE (não uma regra por empresa)', () => {
    const uncovered = [
      { description: 'GTR AUTO SE', nature: 'C', value: 100 },
      { description: 'GAZIN INDUSTRIA COMERCIO', nature: 'C', value: 200 },
    ];
    const regras = buildFallbackRegrasParaCobertura({
      uncovered,
      contaBanco: '100',
      plano,
    });
    expect(regras).toHaveLength(1);
    expect(regras[0]!.descricao).toBe('RECEBIMENTO CLIENTE');
    expect(regras[0]!.contaContrapartida).toBe('300');
  });

  it('BB RENDE: crédito → rendimento, débito → aplicação (nunca fornecedor)', () => {
    const planoAplic = [
      ...plano,
      { code: '116', name: 'APLICACAO FINANCEIRA BB RENDE', codigoReduzido: '432' },
      { code: '417', name: 'RECEITA FINANCEIRA JUROS', codigoReduzido: '510' },
    ];
    const uncovered = [
      { description: 'BB RENDE FACIL', nature: 'D', value: 5000 },
      { description: 'RENDIMENTOS REND PAGO APLIC AUT', nature: 'C', value: 12 },
    ];
    const regras = buildFallbackRegrasParaCobertura({
      uncovered,
      contaBanco: '100',
      plano: planoAplic,
    });
    expect(regras).toHaveLength(2);
    const deb = regras.find((r) => r.nature === 'D');
    const cred = regras.find((r) => r.nature === 'C');
    expect(deb?.descricao).toBe('APLICACAO FINANCEIRA');
    expect(deb?.contaContrapartida).toBe('432');
    expect(cred?.descricao).toBe('RENDIMENTO APLICACAO');
    expect(cred?.contaContrapartida).toBe('510');
    expect(deb?.contaContrapartida).not.toBe('200');
  });

  it('PIX para coligada usa conta de coligada no fallback (não fornecedor)', () => {
    const coligadas = [
      {
        id: '1',
        nome: 'AJTF',
        aliases: ['AJTF', 'A.J.T.F', 'A J T F'],
        contaReduzida: '1094',
      },
    ];
    const planoColig = [
      ...plano,
      { code: '114', name: 'A.J.T.F. LTDA', codigoReduzido: '1094', group: 'ATIVO' },
    ];
    const regras = buildFallbackRegrasParaCobertura({
      uncovered: [{ description: 'PIX ENVIADO A J T F LTDA', nature: 'D', value: 100 }],
      contaBanco: '100',
      plano: planoColig,
      coligadas,
    });
    expect(regras).toHaveLength(1);
    expect(regras[0]!.descricao).toBe('AJTF');
    expect(regras[0]!.contaContrapartida).toBe('1094');
    expect(regras[0]!.contaContrapartida).not.toBe('200');
  });
});

describe('agrupaPadroesExtratoParaIa', () => {
  it('agrupa PIX emitidos em um padrão', () => {
    const rows = [
      { description: 'PIX EMIT ACME LTDA', nature: 'D', value: 10 },
      { description: 'PIX EMIT BETA ME', nature: 'D', value: 20 },
    ];
    const g = agrupaPadroesExtratoParaIa(rows);
    expect(g).toHaveLength(1);
    expect(g[0]!.entidade).toBe('PIX EMIT');
    expect(g[0]!.ocorrencias).toBe(2);
  });
});

describe('corrigeRegrasColigadasExistentes', () => {
  it('corrige PIX EMIT + fornecedor quando extrato do lote é coligada', () => {
    const coligadas = [
      {
        id: '1',
        nome: 'AJTF',
        aliases: ['AJTF', 'A.J.T.F', 'A J T F'],
        contaReduzida: '1094',
      },
    ];
    const planoColig = [
      ...plano,
      { code: '114', name: 'A.J.T.F. LTDA', codigoReduzido: '1094', group: 'ATIVO' },
    ];
    const regras: ExtratoRegraConta[] = [
      {
        id: '1',
        nome: 'PIX EMIT',
        descricao: 'PIX EMIT',
        nature: 'D',
        contaBanco: '100',
        contaContrapartida: '200',
      },
    ];
    const fixed = corrigeRegrasColigadasExistentes({
      regras,
      plano: planoColig,
      coligadas,
      extratoSample: [{ description: 'PIX ENVIADO A J T F LTDA', nature: 'D', value: 50 }],
    });
    expect(fixed[0]!.descricao).toBe('AJTF');
    expect(fixed[0]!.contaContrapartida).toBe('1094');
  });

  it('corrige reavaliação de ativos para conta da coligada no plano', () => {
    const coligadas = [
      {
        id: '1',
        nome: 'ONIX',
        aliases: ['ONIX', 'ONIX COMERCIO'],
      },
    ];
    const planoColig = [
      ...plano.filter((p) => !/POLO SUL/i.test(p.name)),
      { code: '114', name: 'ONIX COMERCIO LTDA', codigoReduzido: '1094', group: 'ATIVO' },
      { code: '256', name: 'REAVALIACAO DE ATIVOS', codigoReduzido: '256', group: 'ATIVO' },
    ];
    const regras: ExtratoRegraConta[] = [
      {
        id: '1',
        nome: 'ONIX',
        descricao: 'ONIX',
        nature: 'D',
        contaBanco: '100',
        contaContrapartida: '256',
      },
    ];
    const fixed = corrigeRegrasColigadasExistentes({
      regras,
      plano: planoColig,
      coligadas,
    });
    expect(fixed[0]!.contaContrapartida).toBe('1094');
  });
});

describe('updateExistingRegrasFromUserChatIntent', () => {
  it('altera conta de regra existente conforme o pedido do chat', () => {
    const regras: ExtratoRegraConta[] = [
      {
        id: '1',
        nome: 'POLO SUL CLIMATIZACAO',
        descricao: 'POLO SUL CLIMATIZACAO',
        nature: 'C',
        contaBanco: '100',
        contaContrapartida: '401',
      },
    ];
    const updated = updateExistingRegrasFromUserChatIntent({
      userMessage: 'muda Polo Sul Climatizacao para fundo fixo de caixa',
      regrasDoBanco: regras,
      plano,
      contaContrapartida: '85',
    });
    expect(updated).toHaveLength(1);
    expect(updated[0]!.contaContrapartida).toBe('85');
  });
});
