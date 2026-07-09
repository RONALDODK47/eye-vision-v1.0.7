import { PARCELAMENTO_CAMPOS } from '../../lib/parcelamentoColunasExtract';

export type DataIngestionType = 'loans' | 'installments' | 'apps' | 'extrato' | 'plano' | 'balancete' | 'folha';

export type OcrColunaCampoDef = {
  id: string;
  name: string;
  required?: boolean;
  color: string;
  borderColor: string;
  isIgnore?: boolean;
};

export type OcrColunasModuleConfig = {
  title: string;
  confirmLabel: string;
  campos: OcrColunaCampoDef[];
  dataColIds: string[];
  headerKeywords: string[];
  /** Extrato OCR: painel alterna quais colunas aparecem no mapeamento (não altera o OCR em si). */
  supportsValorModo?: boolean;
  /** Plano de contas (e similares): seletor DocTR / IA / Híbrido na extração. */
  supportsExtractEngine?: boolean;
};

const IGNORAR_CAMPOS: OcrColunaCampoDef[] = [
  {
    id: 'ignorar1',
    name: 'Ignorar coluna 1',
    color: 'bg-slate-600',
    borderColor: 'border-slate-400 border-dashed',
    isIgnore: true,
  },
  {
    id: 'ignorar2',
    name: 'Ignorar coluna 2',
    color: 'bg-slate-600',
    borderColor: 'border-slate-400 border-dashed',
    isIgnore: true,
  },
  {
    id: 'ignorar3',
    name: 'Ignorar coluna 3',
    color: 'bg-slate-600',
    borderColor: 'border-slate-400 border-dashed',
    isIgnore: true,
  },
];

const COMMON_HEADERS = [
  'empresa',
  'cliente',
  'contrato',
  'nome',
  'codigo',
  'data',
  'valor',
  'descricao',
  'total',
  'saldo',
  'principal',
  'vencimento',
];

export function getOcrColunasConfig(dataType: DataIngestionType): OcrColunasModuleConfig {
  switch (dataType) {
    case 'loans':
      return {
        title: 'Mapear colunas — contratos',
        confirmLabel: 'Importar contratos',
        dataColIds: [
          'empresa',
          'contrato',
          'tipo',
          'principal',
          'taxa',
          'parcelas',
          'dataInicio',
          'carencia',
          'tipoCarencia',
          'indexador',
          'iof',
          'custos',
        ],
        headerKeywords: COMMON_HEADERS,
        campos: [
          { id: 'empresa', name: 'Empresa', color: 'bg-blue-500', borderColor: 'border-blue-500' },
          { id: 'contrato', name: 'Contrato', color: 'bg-indigo-500', borderColor: 'border-indigo-500' },
          { id: 'tipo', name: 'Tipo (SAC/PRICE)', color: 'bg-violet-500', borderColor: 'border-violet-500' },
          { id: 'principal', name: 'Principal (R$)', color: 'bg-emerald-500', borderColor: 'border-emerald-500' },
          { id: 'taxa', name: 'Taxa (%)', color: 'bg-amber-500', borderColor: 'border-amber-500' },
          { id: 'parcelas', name: 'Parcelas', color: 'bg-cyan-500', borderColor: 'border-cyan-500' },
          { id: 'dataInicio', name: 'Data início', color: 'bg-teal-500', borderColor: 'border-teal-500' },
          { id: 'carencia', name: 'Carência (meses)', color: 'bg-orange-500', borderColor: 'border-orange-500' },
          { id: 'tipoCarencia', name: 'Tipo carência', color: 'bg-rose-500', borderColor: 'border-rose-500' },
          { id: 'indexador', name: 'Indexador', color: 'bg-lime-500', borderColor: 'border-lime-500' },
          { id: 'iof', name: 'IOF (R$)', color: 'bg-fuchsia-500', borderColor: 'border-fuchsia-500' },
          { id: 'custos', name: 'Custos (R$)', color: 'bg-pink-500', borderColor: 'border-pink-500' },
          ...IGNORAR_CAMPOS,
        ],
      };
    case 'installments':
      return {
        title: 'Mapear colunas — cronograma',
        confirmLabel: 'Importar cronograma',
        dataColIds: ['numero', 'vencimento', 'valor', 'pagamento', 'juros', 'encargos', 'honorarios', 'multa'],
        headerKeywords: [
          ...COMMON_HEADERS,
          'parcela',
          'vencimento',
          'principal',
          'pagamento',
          'juros',
          'multa',
          'honorario',
          'encargo',
        ],
        campos: PARCELAMENTO_CAMPOS.map((campo) => ({
          id: campo.id,
          name: campo.name,
          required: campo.required,
          color: campo.color,
          borderColor: campo.borderColor,
          isIgnore: campo.id.startsWith('ignorar'),
        })),
      };
    case 'apps':
      return {
        title: 'Mapear colunas — aplicações',
        confirmLabel: 'Importar aplicações',
        dataColIds: ['nomeAtivo', 'valorAplicado', 'taxa', 'indexador', 'dataAplicacao'],
        headerKeywords: [...COMMON_HEADERS, 'ativo', 'aplicacao', 'indexador'],
        campos: [
          { id: 'nomeAtivo', name: 'Nome do ativo', color: 'bg-blue-500', borderColor: 'border-blue-500' },
          { id: 'valorAplicado', name: 'Valor aplicado (R$)', color: 'bg-emerald-500', borderColor: 'border-emerald-500' },
          { id: 'taxa', name: 'Taxa (%)', color: 'bg-amber-500', borderColor: 'border-amber-500' },
          { id: 'indexador', name: 'Indexador', color: 'bg-violet-500', borderColor: 'border-violet-500' },
          { id: 'dataAplicacao', name: 'Data aplicação', color: 'bg-cyan-500', borderColor: 'border-cyan-500' },
          ...IGNORAR_CAMPOS,
        ],
      };
    case 'extrato':
      return {
        title: 'Leitor e recortador — extrato',
        confirmLabel: 'Colar extrato na tabela',
        supportsValorModo: true,
        dataColIds: [
          'data',
          'descricao',
          'valorCredito',
          'valorDebito',
          'valorMisto',
          'contaDebito',
          'contaCredito',
          'contaContabil',
          'historicoOperacao',
        ],
        headerKeywords: [...COMMON_HEADERS, 'natureza', 'conta', 'debito', 'credito', 'conciliado', 'operacao'],
        campos: [
          { id: 'data', name: 'Data', color: 'bg-cyan-500', borderColor: 'border-cyan-500' },
          { id: 'descricao', name: 'Descrição / Histórico', color: 'bg-blue-500', borderColor: 'border-blue-500' },
          { id: 'valorDebito', name: 'Valor débito (R$)', color: 'bg-red-500', borderColor: 'border-red-500' },
          { id: 'valorCredito', name: 'Valor crédito (R$)', color: 'bg-emerald-600', borderColor: 'border-emerald-600' },
          {
            id: 'valorMisto',
            name: 'Valor misto débito/crédito',
            color: 'bg-orange-500',
            borderColor: 'border-orange-500',
          },
          { id: 'contaDebito', name: 'Conta débito', color: 'bg-red-700', borderColor: 'border-red-700' },
          { id: 'contaCredito', name: 'Conta crédito', color: 'bg-emerald-700', borderColor: 'border-emerald-700' },
          { id: 'contaContabil', name: 'Conta contábil', color: 'bg-violet-500', borderColor: 'border-violet-500' },
          { id: 'historicoOperacao', name: 'Operação (TXT)', color: 'bg-indigo-500', borderColor: 'border-indigo-500' },
          ...IGNORAR_CAMPOS,
        ],
      };
    case 'plano':
      return {
        title: 'Mapear colunas — plano de contas',
        confirmLabel: 'Importar contas',
        supportsExtractEngine: true,
        dataColIds: ['codigoReduzido', 'codigoClassificacao', 'descricao', 'tipo', 'nivel'],
        headerKeywords: [
          'classifica',
          'reduzido',
          'codigo',
          'descricao',
          'nome',
          'tipo',
          'nivel',
          'grau',
          'sintet',
          'analit',
          'plano de contas',
        ],
        campos: [
          {
            id: 'codigoReduzido',
            name: 'Código reduzido',
            color: 'bg-indigo-500',
            borderColor: 'border-indigo-500',
          },
          {
            id: 'codigoClassificacao',
            name: 'Código classificação',
            color: 'bg-blue-500',
            borderColor: 'border-blue-500',
          },
          {
            id: 'descricao',
            name: 'Descrição',
            color: 'bg-emerald-500',
            borderColor: 'border-emerald-500',
          },
          { id: 'tipo', name: 'Tipo (S/A)', color: 'bg-cyan-500', borderColor: 'border-cyan-500' },
          { id: 'nivel', name: 'Nível', color: 'bg-teal-500', borderColor: 'border-teal-500' },
          ...IGNORAR_CAMPOS,
        ],
      };
    case 'balancete':
      return {
        title: 'Mapear colunas — razão / balancete',
        confirmLabel: 'Importar lançamentos',
        dataColIds: ['data', 'codigo', 'classificacao', 'descricao', 'debito', 'credito', 'valorDc'],
        headerKeywords: [
          ...COMMON_HEADERS,
          'classifica',
          'debito',
          'credito',
          'historico',
          'lancamento',
          'saldo',
        ],
        campos: [
          { id: 'data', name: 'Data', color: 'bg-violet-500', borderColor: 'border-violet-500' },
          { id: 'codigo', name: 'Código', color: 'bg-blue-500', borderColor: 'border-blue-500' },
          { id: 'classificacao', name: 'Classificação', color: 'bg-cyan-500', borderColor: 'border-cyan-500' },
          { id: 'descricao', name: 'Descrição', color: 'bg-emerald-500', borderColor: 'border-emerald-500' },
          { id: 'debito', name: 'Débito (R$)', color: 'bg-red-500', borderColor: 'border-red-500' },
          { id: 'credito', name: 'Crédito (R$)', color: 'bg-emerald-600', borderColor: 'border-emerald-600' },
          {
            id: 'valorDc',
            name: 'Valor (D/C)',
            color: 'bg-orange-500',
            borderColor: 'border-orange-500',
          },
          ...IGNORAR_CAMPOS,
        ],
      };
    case 'folha':
      return {
        title: 'Mapear colunas — folha / relatório',
        confirmLabel: 'Importar lançamentos',
        dataColIds: ['data', 'descricao', 'debito', 'credito', 'valorDc'],
        headerKeywords: [...COMMON_HEADERS, 'colaborador', 'salario', 'funcionario', 'debito', 'credito'],
        campos: [
          { id: 'data', name: 'Data', color: 'bg-violet-500', borderColor: 'border-violet-500' },
          { id: 'descricao', name: 'Descrição / Histórico', color: 'bg-blue-500', borderColor: 'border-blue-500' },
          { id: 'debito', name: 'Débito (R$)', color: 'bg-red-500', borderColor: 'border-red-500' },
          { id: 'credito', name: 'Crédito (R$)', color: 'bg-emerald-600', borderColor: 'border-emerald-600' },
          { id: 'valorDc', name: 'Valor (D/C)', color: 'bg-orange-500', borderColor: 'border-orange-500' },
          ...IGNORAR_CAMPOS,
        ],
      };
  }
}
