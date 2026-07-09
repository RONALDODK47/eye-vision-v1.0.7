import { describe, expect, it } from 'vitest';
import { gerarNotaExplicativa } from './notaExplicativaEngine';
import { resolveCpcsParaEmpresa } from './notaExplicativaCpc';
import { defaultNotaExplicativaDados } from './notaExplicativaTypes';

describe('notaExplicativaEngine', () => {
  it('combina CPCs de comércio + serviços + simples nacional', () => {
    const dados = {
      ...defaultNotaExplicativaDados('ACME LTDA'),
      atividades: ['comercio', 'servicos'] as const,
      regime: 'simples_nacional' as const,
      razaoSocial: 'ACME COMERCIO E SERVICOS LTDA',
      cnpj: '12.345.678/0001-99',
    };
    const cpcs = resolveCpcsParaEmpresa(dados);
    expect(cpcs.some((c) => c.codigo === 'CPC 16')).toBe(true);
    expect(cpcs.some((c) => c.codigo === 'CPC 47')).toBe(true);
    expect(cpcs.some((c) => c.codigo === 'ITG 2000')).toBe(true);

    const { secoes } = gerarNotaExplicativa({ dados, overrides: {}, updatedAt: '' });
    expect(secoes.length).toBeGreaterThan(8);
    expect(secoes.some((s) => s.id === 'estoque')).toBe(true);
    expect(secoes.some((s) => s.id === 'receber')).toBe(true);
    expect(secoes.some((s) => s.corpo.includes('ACME'))).toBe(true);
  });

  it('inclui seção rural e CPC 29 para agroindústria', () => {
    const dados = {
      ...defaultNotaExplicativaDados('FAZENDA LTDA'),
      atividades: ['rural', 'agroindustria'] as const,
      regime: 'lucro_real' as const,
    };
    const { secoes, cpcsAplicaveis } = gerarNotaExplicativa({ dados, overrides: {}, updatedAt: '' });
    expect(cpcsAplicaveis.some((c) => c.codigo === 'CPC 29')).toBe(true);
    expect(cpcsAplicaveis.some((c) => c.codigo === 'CPC 32')).toBe(true);
    expect(secoes.some((s) => s.id === 'rural')).toBe(true);
  });

  it('inclui seção de endividamento e CPCs por modalidade (empréstimo + arrendamento)', () => {
    const dados = {
      ...defaultNotaExplicativaDados('INDUSTRIA LTDA'),
      atividades: ['industria'] as const,
      regime: 'lucro_real' as const,
      possuiEmprestimos: true,
      possuiFinanciamentos: true,
      tiposEndividamento: ['emprestimo_bancario', 'arrendamento_mercantil', 'custos_emprestimos_ativo'] as const,
      saldoEmprestimosCP: 'R$ 50.000,00',
      saldoEmprestimosLP: 'R$ 200.000,00',
      saldoFinanciamentosCP: 'R$ 12.000,00',
      saldoFinanciamentosLP: 'R$ 88.000,00',
    };
    const { secoes, cpcsAplicaveis } = gerarNotaExplicativa({ dados, overrides: {}, updatedAt: '' });
    expect(secoes.some((s) => s.id === 'endividamento')).toBe(true);
    const endiv = secoes.find((s) => s.id === 'endividamento');
    expect(endiv?.corpo).toContain('Empréstimos bancários');
    expect(endiv?.corpo).toContain('CPC 06');
    expect(cpcsAplicaveis.some((c) => c.codigo === 'CPC 48')).toBe(true);
    expect(cpcsAplicaveis.some((c) => c.codigo === 'CPC 06')).toBe(true);
    expect(cpcsAplicaveis.some((c) => c.codigo === 'CPC 20')).toBe(true);
  });

  it('gera seção de imunidade e NBC TG 1001 para entidade imune', () => {
    const dados = {
      ...defaultNotaExplicativaDados('TEMPLO DA PAZ'),
      regime: 'imune' as const,
      fundamentoImunidadeIsencao: 'Art. 150, VI, alínea b, da Constituição Federal',
      razaoSocial: 'TEMPLO DA PAZ',
      cnpj: '00.000.000/0001-00',
    };
    const { secoes, cpcsAplicaveis } = gerarNotaExplicativa({ dados, overrides: {}, updatedAt: '' });
    expect(cpcsAplicaveis.some((c) => c.codigo === 'NBC TG 1001')).toBe(true);
    expect(secoes.some((s) => s.id === 'imunidade_isencao')).toBe(true);
    expect(secoes.some((s) => s.id === 'tributos')).toBe(false);
    const imune = secoes.find((s) => s.id === 'imunidade_isencao');
    expect(imune?.corpo).toContain('imune');
    expect(imune?.corpo).toContain('Art. 150');
  });

  it('gera seção de isenção para entidade isenta', () => {
    const dados = {
      ...defaultNotaExplicativaDados('ASSOCIACAO BENEFICENTE'),
      regime: 'isenta' as const,
      fundamentoImunidadeIsencao: 'Lei nº 9.532/97, art. 12',
    };
    const { secoes } = gerarNotaExplicativa({ dados, overrides: {}, updatedAt: '' });
    const isenta = secoes.find((s) => s.id === 'imunidade_isencao');
    expect(isenta?.corpo).toContain('isenta');
    expect(isenta?.corpo).toContain('Lei nº 9.532/97');
  });
});
