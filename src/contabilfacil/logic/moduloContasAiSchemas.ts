export type ModuloContasAiId =
  | 'emprestimo'
  | 'aplicacao'
  | 'parcelamento'
  | 'folha'
  | 'fiscal'
  | 'honorarios';

export type ModuloContaCampoDef = {
  key: string;
  label: string;
  /** Palavras-chave para fallback local no plano (sem IA). */
  keywords: string[];
  /** Preferência de grupo do plano (1=ativo, 2=passivo, 3=PL, 4=receita, 5+=despesa). */
  preferGroup?: '1' | '2' | '3' | '4' | '5';
};

const EMPRESTIMO_CAMPOS: ModuloContaCampoDef[] = [
  {
    key: 'accEmprestimoDebit',
    label: 'Valor do empréstimo — débito',
    keywords: ['banco', 'caixa', 'disponib', 'conta movimento'],
    preferGroup: '1',
  },
  {
    key: 'accEmprestimoCredit',
    label: 'Valor do empréstimo — crédito',
    keywords: ['emprestimo', 'financiamento', 'passivo', 'longo prazo', 'mutuo'],
    preferGroup: '2',
  },
  {
    key: 'accIofDebit',
    label: 'IOF — débito',
    keywords: ['iof', 'despesa financeira', 'tributo'],
    preferGroup: '5',
  },
  {
    key: 'accIofCredit',
    label: 'IOF — crédito',
    keywords: ['banco', 'caixa', 'emprestimo', 'financiamento'],
    preferGroup: '1',
  },
  {
    key: 'accJurosAproDebit',
    label: 'Provisão de juros — débito',
    keywords: ['juros a apropriar', 'encargos', 'despesa financeira'],
    preferGroup: '5',
  },
  {
    key: 'accJurosAproCredit',
    label: 'Provisão de juros — crédito',
    keywords: ['juros a apropriar', 'juros a pagar', 'passivo'],
    preferGroup: '2',
  },
  {
    key: 'accApropriacaoDebit',
    label: 'Apropriação de juros — débito',
    keywords: ['despesa financeira', 'juros', 'encargos'],
    preferGroup: '5',
  },
  {
    key: 'accApropriacaoCredit',
    label: 'Apropriação de juros — crédito',
    keywords: ['juros a apropriar', 'juros a pagar'],
    preferGroup: '2',
  },
  {
    key: 'accTransferenciaDebit',
    label: 'Transferência LP→CP — débito',
    keywords: ['emprestimo', 'longo prazo', 'financiamento'],
    preferGroup: '2',
  },
  {
    key: 'accTransferenciaCredit',
    label: 'Transferência LP→CP — crédito',
    keywords: ['emprestimo', 'curto prazo', 'circulante', 'financiamento'],
    preferGroup: '2',
  },
];

const APLICACAO_CAMPOS: ModuloContaCampoDef[] = [
  {
    key: 'accAplicacaoDebit',
    label: 'Aplicação financeira — débito',
    keywords: ['aplicacao', 'cdb', 'lci', 'lca', 'tesouro', 'investimento'],
    preferGroup: '1',
  },
  {
    key: 'accAplicacaoCredit',
    label: 'Aplicação financeira — crédito',
    keywords: ['banco', 'caixa', 'conta movimento'],
    preferGroup: '1',
  },
  {
    key: 'accReceitaJurosDebit',
    label: 'Receita de juros — débito',
    keywords: ['aplicacao', 'cdb', 'juros a receber', 'rendimento'],
    preferGroup: '1',
  },
  {
    key: 'accReceitaJurosCredit',
    label: 'Receita de juros — crédito',
    keywords: ['receita financeira', 'rendimento', 'juros'],
    preferGroup: '4',
  },
  {
    key: 'accIRRFDebit',
    label: 'IRRF aplicação — débito',
    keywords: ['irrf', 'imposto de renda', 'retido'],
    preferGroup: '5',
  },
  {
    key: 'accIRRFCredit',
    label: 'IRRF aplicação — crédito',
    keywords: ['banco', 'aplicacao', 'irrf a recolher'],
    preferGroup: '2',
  },
  {
    key: 'accIOFDebit',
    label: 'IOF aplicação — débito',
    keywords: ['iof', 'despesa financeira'],
    preferGroup: '5',
  },
  {
    key: 'accIOFCredit',
    label: 'IOF aplicação — crédito',
    keywords: ['banco', 'aplicacao'],
    preferGroup: '1',
  },
];

const PARCELAMENTO_CAMPOS: ModuloContaCampoDef[] = [
  {
    key: 'accEmprestimoDebit',
    label: 'Conta parcelamentos — débito',
    keywords: ['cliente', 'parcelamento', 'a receber', 'duplicata'],
    preferGroup: '1',
  },
  {
    key: 'accEmprestimoCredit',
    label: 'Conta parcelamentos — crédito',
    keywords: ['receita', 'venda', 'servico'],
    preferGroup: '4',
  },
  {
    key: 'accParcelaDebit',
    label: 'Provisão parcela — débito',
    keywords: ['despesa', 'custo', 'provisao'],
    preferGroup: '5',
  },
  {
    key: 'accParcelaCredit',
    label: 'Provisão parcela — crédito',
    keywords: ['provisao', 'a pagar', 'passivo'],
    preferGroup: '2',
  },
  {
    key: 'accPagamentoDebit',
    label: 'Pagamento parcela — débito',
    keywords: ['provisao', 'a pagar', 'passivo'],
    preferGroup: '2',
  },
  {
    key: 'accPagamentoCredit',
    label: 'Pagamento parcela — crédito',
    keywords: ['banco', 'caixa'],
    preferGroup: '1',
  },
  {
    key: 'accJurosAproDebit',
    label: 'Provisão juros — débito',
    keywords: ['juros', 'despesa financeira'],
    preferGroup: '5',
  },
  {
    key: 'accJurosAproCredit',
    label: 'Provisão juros — crédito',
    keywords: ['juros a pagar', 'juros a apropriar'],
    preferGroup: '2',
  },
  {
    key: 'accApropriacaoDebit',
    label: 'Apropriação juros — débito',
    keywords: ['despesa financeira', 'juros'],
    preferGroup: '5',
  },
  {
    key: 'accApropriacaoCredit',
    label: 'Apropriação juros — crédito',
    keywords: ['juros a apropriar', 'juros a pagar'],
    preferGroup: '2',
  },
  {
    key: 'accTransferenciaDebit',
    label: 'Transferência LP→CP — débito',
    keywords: ['longo prazo', 'parcelamento'],
    preferGroup: '2',
  },
  {
    key: 'accTransferenciaCredit',
    label: 'Transferência LP→CP — crédito',
    keywords: ['curto prazo', 'circulante', 'parcelamento'],
    preferGroup: '2',
  },
];

const FOLHA_CAMPOS: ModuloContaCampoDef[] = [
  { key: 'SALARIO.debito', label: 'Salários — débito', keywords: ['salario', 'folha', 'despesa com pessoal'], preferGroup: '5' },
  { key: 'SALARIO.credito', label: 'Salários — crédito', keywords: ['salario a pagar', 'ordenado a pagar'], preferGroup: '2' },
  { key: 'PROLABORE.debito', label: 'Pró-labore — débito', keywords: ['prolabore', 'pro-labore', 'despesa'], preferGroup: '5' },
  { key: 'PROLABORE.credito', label: 'Pró-labore — crédito', keywords: ['prolabore a pagar', 'pro-labore a pagar'], preferGroup: '2' },
  { key: 'INSS_RECOLHER.debito', label: 'INSS a recolher — débito', keywords: ['inss', 'encargos sociais', 'despesa'], preferGroup: '5' },
  { key: 'INSS_RECOLHER.credito', label: 'INSS a recolher — crédito', keywords: ['inss a recolher', 'inss a pagar'], preferGroup: '2' },
  { key: 'INSS_RECUPERAR.debito', label: 'INSS a recuperar — débito', keywords: ['inss a recuperar', 'inss a compensar'], preferGroup: '1' },
  { key: 'INSS_RECUPERAR.credito', label: 'INSS a recuperar — crédito', keywords: ['inss', 'encargos'], preferGroup: '5' },
  { key: 'FGTS_RECOLHER.debito', label: 'FGTS a recolher — débito', keywords: ['fgts', 'encargos'], preferGroup: '5' },
  { key: 'FGTS_RECOLHER.credito', label: 'FGTS a recolher — crédito', keywords: ['fgts a recolher', 'fgts a pagar'], preferGroup: '2' },
  { key: 'FGTS_RECUPERAR.debito', label: 'FGTS a recuperar — débito', keywords: ['fgts a recuperar'], preferGroup: '1' },
  { key: 'FGTS_RECUPERAR.credito', label: 'FGTS a recuperar — crédito', keywords: ['fgts'], preferGroup: '5' },
  { key: 'IRRF_RECOLHER.debito', label: 'IRRF a recolher — débito', keywords: ['irrf', 'imposto de renda'], preferGroup: '5' },
  { key: 'IRRF_RECOLHER.credito', label: 'IRRF a recolher — crédito', keywords: ['irrf a recolher', 'irrf a pagar'], preferGroup: '2' },
  { key: 'IRRF_RECUPERAR.debito', label: 'IRRF a recuperar — débito', keywords: ['irrf a recuperar'], preferGroup: '1' },
  { key: 'IRRF_RECUPERAR.credito', label: 'IRRF a recuperar — crédito', keywords: ['irrf'], preferGroup: '5' },
];

const FISCAL_CAMPOS: ModuloContaCampoDef[] = [
  { key: 'PIS.debito', label: 'PIS a recolher — débito', keywords: ['pis', 'despesa', 'imposto'], preferGroup: '5' },
  { key: 'PIS.credito', label: 'PIS a recolher — crédito', keywords: ['pis a recolher', 'pis a pagar'], preferGroup: '2' },
  { key: 'PIS.debitoRecuperar', label: 'PIS a recuperar — débito', keywords: ['pis a recuperar', 'credito pis'], preferGroup: '1' },
  { key: 'PIS.creditoRecuperar', label: 'PIS a recuperar — crédito', keywords: ['pis', 'imposto'], preferGroup: '5' },
  { key: 'COFINS.debito', label: 'COFINS a recolher — débito', keywords: ['cofins', 'despesa'], preferGroup: '5' },
  { key: 'COFINS.credito', label: 'COFINS a recolher — crédito', keywords: ['cofins a recolher', 'cofins a pagar'], preferGroup: '2' },
  { key: 'COFINS.debitoRecuperar', label: 'COFINS a recuperar — débito', keywords: ['cofins a recuperar', 'credito cofins'], preferGroup: '1' },
  { key: 'COFINS.creditoRecuperar', label: 'COFINS a recuperar — crédito', keywords: ['cofins'], preferGroup: '5' },
  { key: 'ICMS.debito', label: 'ICMS a recolher — débito', keywords: ['icms', 'despesa'], preferGroup: '5' },
  { key: 'ICMS.credito', label: 'ICMS a recolher — crédito', keywords: ['icms a recolher', 'icms a pagar'], preferGroup: '2' },
  { key: 'ICMS.debitoRecuperar', label: 'ICMS a recuperar — débito', keywords: ['icms a recuperar', 'credito icms'], preferGroup: '1' },
  { key: 'ICMS.creditoRecuperar', label: 'ICMS a recuperar — crédito', keywords: ['icms'], preferGroup: '5' },
  { key: 'IRRF.debito', label: 'IRRF — débito', keywords: ['irrf', 'imposto de renda'], preferGroup: '5' },
  { key: 'IRRF.credito', label: 'IRRF — crédito', keywords: ['irrf a recolher', 'irrf a pagar'], preferGroup: '2' },
  { key: 'IRRF.debitoRecuperar', label: 'IRRF a recuperar — débito', keywords: ['irrf a recuperar'], preferGroup: '1' },
  { key: 'IRRF.creditoRecuperar', label: 'IRRF a recuperar — crédito', keywords: ['irrf'], preferGroup: '5' },
  { key: 'CSLL.debito', label: 'CSLL — débito', keywords: ['csll', 'contribuicao social'], preferGroup: '5' },
  { key: 'CSLL.credito', label: 'CSLL — crédito', keywords: ['csll a recolher', 'csll a pagar'], preferGroup: '2' },
  { key: 'CSLL.debitoRecuperar', label: 'CSLL a recuperar — débito', keywords: ['csll a recuperar'], preferGroup: '1' },
  { key: 'CSLL.creditoRecuperar', label: 'CSLL a recuperar — crédito', keywords: ['csll'], preferGroup: '5' },
  { key: 'SIMPLES_NACIONAL.debito', label: 'Simples Nacional — débito', keywords: ['simples', 'das', 'pgdas'], preferGroup: '5' },
  { key: 'SIMPLES_NACIONAL.credito', label: 'Simples Nacional — crédito', keywords: ['simples a recolher', 'das a pagar'], preferGroup: '2' },
  { key: 'SIMPLES_NACIONAL.debitoRecuperar', label: 'Simples a recuperar — débito', keywords: ['simples a recuperar'], preferGroup: '1' },
  { key: 'SIMPLES_NACIONAL.creditoRecuperar', label: 'Simples a recuperar — crédito', keywords: ['simples'], preferGroup: '5' },
];

const HONORARIOS_CAMPOS: ModuloContaCampoDef[] = [
  {
    key: 'debito',
    label: 'Honorários — débito',
    keywords: ['honorario', 'servico contabil', 'despesa com servico', 'assessoria'],
    preferGroup: '5',
  },
  {
    key: 'credito',
    label: 'Honorários — crédito',
    keywords: ['fornecedor', 'a pagar', 'honorario a pagar'],
    preferGroup: '2',
  },
];

export function getModuloContasCampoDefs(modulo: ModuloContasAiId): ModuloContaCampoDef[] {
  switch (modulo) {
    case 'emprestimo':
      return EMPRESTIMO_CAMPOS;
    case 'aplicacao':
      return APLICACAO_CAMPOS;
    case 'parcelamento':
      return PARCELAMENTO_CAMPOS;
    case 'folha':
      return FOLHA_CAMPOS;
    case 'fiscal':
      return FISCAL_CAMPOS;
    case 'honorarios':
      return HONORARIOS_CAMPOS;
    default:
      return [];
  }
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

type PlanoRow = { code: string; name: string; codigoReduzido?: string };

/** Fallback local: escolhe conta do plano por palavras-chave + grupo. */
export function sugerirContasLocalDoPlano(
  campos: ModuloContaCampoDef[],
  plano: PlanoRow[],
  contasAtuais: Record<string, string> = {},
  onlyEmpty = true,
): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();

  for (const campo of campos) {
    const atual = (contasAtuais[campo.key] ?? '').trim();
    if (onlyEmpty && atual) continue;

    let best: PlanoRow | null = null;
    let bestScore = 0;
    for (const p of plano) {
      const red = String(p.codigoReduzido ?? '').trim();
      if (!red || red.includes('.') || used.has(red)) continue;
      const name = norm(p.name);
      const code = p.code.trim();
      if (!code) continue;
      const group = code.replace(/\D/g, '')[0] ?? '';
      let score = 0;
      for (const kw of campo.keywords) {
        if (name.includes(norm(kw))) score += 10;
      }
      if (campo.preferGroup && group === campo.preferGroup) score += 3;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best && bestScore >= 10) {
      const red = String(best.codigoReduzido ?? '').trim();
      if (red && !red.includes('.')) {
        out[campo.key] = red;
        used.add(red);
      }
    }
  }
  return out;
}

/** Aplica sugestões flat (key → conta) em objeto aninhado folha/fiscal. */
export function applyFlatContasToNestedConfig<T extends Record<string, Record<string, string>>>(
  current: T,
  flat: Record<string, string>,
): T {
  const next = { ...current } as T;
  for (const [key, conta] of Object.entries(flat)) {
    if (!conta.trim()) continue;
    const [rubrica, field] = key.split('.');
    if (!rubrica || !field) continue;
    const prev = next[rubrica as keyof T];
    if (!prev || typeof prev !== 'object') continue;
    next[rubrica as keyof T] = { ...prev, [field]: conta.trim() } as T[keyof T];
  }
  return next;
}
