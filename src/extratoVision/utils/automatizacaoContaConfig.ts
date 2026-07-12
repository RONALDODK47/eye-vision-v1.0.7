import type { VisionBalanceteRow, VisionPlanoRow } from '../types/accounting';
import { getClassificacao } from './demonstracoesContabeis';
import { writePersistedLocalStorageJson } from '../../lib/persistentLocalStorage';
import type { PeriodoMensal } from './balanceteComparativoMensal';

export type AutomacaoContaPapel =
  | 'garantida'
  | 'caixa'
  | 'cliente'
  | 'mutuo'
  | 'despesa_ajuste'
  | 'custos';

export type AutomacaoContaVinculo = {
  classificacao: string;
  codigo?: string;
  nome?: string;
};

/** Par débito/crédito por papel (partidas dobradas na automatização). */
export type AutomacaoContaPapelConfig = {
  debito?: AutomacaoContaVinculo;
  credito?: AutomacaoContaVinculo;
  /** Formato legado (conta única) — migrado ao ler. */
  classificacao?: string;
  codigo?: string;
  nome?: string;
  /** % sobre faturamento para lançamento automático de custo (papel custos). */
  porcentagemCusto?: number;
  /** Conta de faturamento/receita usada como base do cálculo (papel custos). */
  contaFaturamento?: AutomacaoContaVinculo;
};

/** Data usada nos lançamentos gerados pela automação. */
export type AutomacaoDataModo = 'ultimo_dia_mes' | 'data_do_dia' | 'data_fixixa';

/** Empréstimo / transferência com empresa coligada já cadastrada no sistema. */
export type AutomacaoEmprestimoColigada = {
  id: string;
  /** Nome da empresa no registry ContábilFácil. */
  empresaColigada: string;
  debito?: AutomacaoContaVinculo;
  credito?: AutomacaoContaVinculo;
};

export type AutomacaoContaConfig = Partial<Record<AutomacaoContaPapel, AutomacaoContaPapelConfig>> & {
  dataModo?: AutomacaoDataModo;
  /** DD/MM/AAAA quando dataModo === 'data_fixixa'. */
  dataFixa?: string;
  emprestimoColigadas?: AutomacaoEmprestimoColigada[];
};

const STORAGE_KEY = 'extratoVision_automacao_conta_config_v1';

type PersistPayload = Record<string, AutomacaoContaConfig>;

/** Lado padrão quando só existe vínculo legado (conta única). */
const LEGACY_LADO: Record<AutomacaoContaPapel, 'debito' | 'credito'> = {
  garantida: 'credito',
  caixa: 'debito',
  cliente: 'credito',
  mutuo: 'credito',
  despesa_ajuste: 'debito',
  custos: 'debito',
};

function normEmpresa(empresa: string): string {
  const v = empresa.trim().toLowerCase();
  return v || '__default__';
}

export function normClsAutomacao(cls: string): string {
  return cls.replace(/\./g, '').replace(/\s/g, '').trim();
}

function isVinculo(v: AutomacaoContaVinculo | undefined): v is AutomacaoContaVinculo {
  return !!v?.classificacao?.trim();
}

function legacyVinculo(p: AutomacaoContaPapelConfig | undefined): AutomacaoContaVinculo | undefined {
  if (!p?.classificacao?.trim()) return undefined;
  return {
    classificacao: p.classificacao.trim(),
    codigo: p.codigo,
    nome: p.nome,
  };
}

function normalizePapelConfig(raw: AutomacaoContaPapelConfig | undefined): AutomacaoContaPapelConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: AutomacaoContaPapelConfig = {};
  if (raw.debito && isVinculo(raw.debito)) out.debito = raw.debito;
  if (raw.credito && isVinculo(raw.credito)) out.credito = raw.credito;
  const leg = legacyVinculo(raw);
  if (leg && !out.debito && !out.credito) {
    out.classificacao = leg.classificacao;
    out.codigo = leg.codigo;
    out.nome = leg.nome;
  }
  if (typeof raw.porcentagemCusto === 'number' && Number.isFinite(raw.porcentagemCusto)) {
    const pct = Math.max(0, Math.min(100, raw.porcentagemCusto));
    if (pct > 0) out.porcentagemCusto = pct;
  }
  if (raw.contaFaturamento && isVinculo(raw.contaFaturamento)) {
    out.contaFaturamento = raw.contaFaturamento;
  }
  if (!out.debito && !out.credito && !out.classificacao && !out.porcentagemCusto && !out.contaFaturamento) {
    return undefined;
  }
  return out;
}

const PAPEIS_AUTOMACAO_IDS: AutomacaoContaPapel[] = [
  'garantida',
  'caixa',
  'cliente',
  'mutuo',
  'despesa_ajuste',
  'custos',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatBrDate(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function isValidBrDate(s: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return false;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(year, month - 1, day);
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
}

function normalizeEmprestimoColigada(raw: unknown): AutomacaoEmprestimoColigada | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<AutomacaoEmprestimoColigada>;
  const empresa = String(r.empresaColigada ?? '').trim();
  if (!empresa) return null;
  const out: AutomacaoEmprestimoColigada = {
    id: String(r.id ?? newEmprestimoColigadaId()),
    empresaColigada: empresa,
  };
  if (r.debito && isVinculo(r.debito)) out.debito = r.debito;
  if (r.credito && isVinculo(r.credito)) out.credito = r.credito;
  return out;
}

function normalizeConfig(cfg: AutomacaoContaConfig): AutomacaoContaConfig {
  const out: AutomacaoContaConfig = {};
  for (const id of PAPEIS_AUTOMACAO_IDS) {
    const n = normalizePapelConfig(cfg[id]);
    if (n) out[id] = n;
  }
  const modo = cfg.dataModo;
  if (modo === 'ultimo_dia_mes' || modo === 'data_do_dia' || modo === 'data_fixixa') {
    out.dataModo = modo;
  }
  if (cfg.dataFixa && isValidBrDate(cfg.dataFixa)) {
    out.dataFixa = cfg.dataFixa.trim();
  }
  if (Array.isArray(cfg.emprestimoColigadas)) {
    const list = cfg.emprestimoColigadas
      .map(normalizeEmprestimoColigada)
      .filter((x): x is AutomacaoEmprestimoColigada => Boolean(x));
    if (list.length) out.emprestimoColigadas = list;
  }
  return out;
}

/**
 * Resolve a data dos lançamentos automáticos conforme a configuração.
 * Padrão: último dia do mês do período (`periodo.ate`).
 */
export function resolverDataAutomacao(
  periodo: PeriodoMensal,
  config?: AutomacaoContaConfig | null,
  hoje: Date = new Date(),
): string {
  const modo = config?.dataModo ?? 'ultimo_dia_mes';
  if (modo === 'data_do_dia') return formatBrDate(hoje);
  if (modo === 'data_fixixa' && config?.dataFixa && isValidBrDate(config.dataFixa)) {
    return config.dataFixa.trim();
  }
  return periodo.ate;
}

function readRaw(): PersistPayload {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as PersistPayload;
  } catch {
    return {};
  }
}

export function readAutomatizacaoContaConfig(empresa: string): AutomacaoContaConfig {
  return normalizeConfig(readRaw()[normEmpresa(empresa)] ?? {});
}

export function saveAutomatizacaoContaConfig(empresa: string, config: AutomacaoContaConfig): void {
  const all = readRaw();
  all[normEmpresa(empresa)] = normalizeConfig(config);
  writePersistedLocalStorageJson(STORAGE_KEY, all);
}

/** Salva um único papel (bloco) da configuração sem alterar os demais. */
export function savePapelAutomatizacaoContaConfig(
  empresa: string,
  papel: AutomacaoContaPapel,
  cfg: AutomacaoContaPapelConfig | undefined,
): AutomacaoContaConfig {
  const current = readAutomatizacaoContaConfig(empresa);
  const next: AutomacaoContaConfig = { ...current };
  if (cfg) next[papel] = cfg;
  else delete next[papel];
  saveAutomatizacaoContaConfig(empresa, next);
  return next;
}

/** Blocos exibidos na modal (caixa e despesa usam detecção automática no plano). */
export const PAPEIS_AUTOMACAO_UI: {
  id: AutomacaoContaPapel;
  titulo: string;
  hint: string;
  debHint: string;
  credHint: string;
  info: string;
}[] = [
  {
    id: 'garantida',
    titulo: 'Conta garantida',
    hint: 'Ciclo banco credor ↔ garantida (utilização e devolução).',
    debHint: 'D na devolução (ex.: conta garantida / caução)',
    credHint: 'C na utilização (ex.: conta garantida / caução)',
    info: [
      'Como a automação usa:',
      '• Usa esta configuração para registrar uso e devolução da conta garantida no ciclo bancário.',
      '',
      'Quando é usada:',
      '• Quando houver movimentação de banco credor/garantida entre os meses do comparativo.',
    ].join('\n'),
  },
  {
    id: 'cliente',
    titulo: 'Clientes a receber',
    hint: 'Reforço do caixa quando não há saldo.',
    debHint: 'D — opcional (reforço customizado)',
    credHint: 'C — clientes a receber (reforço do caixa)',
    info: [
      'Como a automação usa:',
      '• 1º passo: registra recebimento de clientes a receber (se houver saldo devedor na conta).',
      '• Só depois disso verifica se o caixa continua credor.',
      '',
      'Quando é usada:',
      '• Antes de qualquer captação por mútuo/empréstimo.',
    ].join('\n'),
  },
  {
    id: 'mutuo',
    titulo: 'Mútuo / empréstimo',
    hint: 'Captação quando não há cliente a receber.',
    debHint: 'D — opcional',
    credHint: 'C — mútuo / empréstimo a pagar ou captar',
    info: [
      'Como a automação usa:',
      '• 2º passo: captação por mútuo/empréstimo apenas se, após receber dos clientes, o caixa ainda estiver credor.',
      '',
      'Quando é usada:',
      '• Quando não há saldo em clientes a receber ou o recebimento não elimina o saldo credor do caixa.',
    ].join('\n'),
  },
  {
    id: 'custos',
    titulo: 'Custos',
    hint: 'Contas de custo / CMV / CPV. Opcional: % sobre faturamento para lançar custo automaticamente.',
    debHint: 'D — conta de custo (ex.: CMV, custo dos serviços)',
    credHint: 'C — contrapartida do custo (ex.: estoque, fornecedor)',
    info: [
      'Como a automação usa:',
      '• Prefere estas contas ao lançar ajustes de custo/despesa (folha, fiscal e provisões).',
      '• Com porcentagem e conta de faturamento: calcula custo = faturamento × % e lança D/C no mês.',
      '• Faturamento = créditos − débitos da conta de receita escolhida no período.',
      '',
      'Quando é usada:',
      '• Sempre que a automação precisar de uma conta de custo e esta configuração existir.',
      '• Lançamento por %: exige D, C, porcentagem > 0 e conta de faturamento.',
    ].join('\n'),
  },
];

const PAPEL_TITULO: Record<AutomacaoContaPapel, string> = {
  garantida: 'Conta garantida',
  caixa: 'Caixa / fundo fixo',
  cliente: 'Clientes a receber',
  mutuo: 'Mútuo / empréstimo',
  despesa_ajuste: 'Despesa (ajustes)',
  custos: 'Custos',
};

export function papelAutomacaoLabel(id: AutomacaoContaPapel): string {
  return PAPEL_TITULO[id] ?? id;
}

/** Vínculo do papel para o lado D ou C (com migração do formato antigo). */
export function getVinculoPapel(
  config: AutomacaoContaConfig,
  papel: AutomacaoContaPapel,
  lado: 'debito' | 'credito',
): AutomacaoContaVinculo | undefined {
  const p = config[papel];
  if (!p) return undefined;
  const direto = lado === 'debito' ? p.debito : p.credito;
  if (isVinculo(direto)) return direto;
  const leg = legacyVinculo(p);
  if (leg && LEGACY_LADO[papel] === lado) return leg;
  /** Garantida / custos: se só um lado preenchido, usa nos dois sentidos. */
  if (papel === 'garantida' || papel === 'custos') {
    const outro = lado === 'debito' ? p.credito : p.debito;
    if (isVinculo(outro)) return outro;
  }
  return undefined;
}

function planoParaRow(p: VisionPlanoRow): VisionBalanceteRow {
  return {
    codigo: p.codigoReduzido ?? p.codigo,
    classificacao: p.codigo,
    nome: p.nome,
    saldoInicial: 0,
    debito: 0,
    credito: 0,
    saldoFinal: 0,
    tipo: p.tipo ?? 'A',
  };
}

export function buscarContasNoPlano(
  planoRows: VisionPlanoRow[],
  query: string,
  limite = 25,
): VisionPlanoRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return planoRows.filter((p) => p.tipo === 'A').slice(0, limite);

  const out: VisionPlanoRow[] = [];
  for (const p of planoRows) {
    if (p.tipo === 'S') continue;
    const cod = (p.codigo ?? '').toLowerCase();
    const codR = (p.codigoReduzido ?? '').toLowerCase();
    const nome = (p.nome ?? '').toLowerCase();
    const cls = normClsAutomacao(p.codigo);
    const qNorm = normClsAutomacao(q);
    if (
      nome.includes(q) ||
      cod.includes(q) ||
      codR.includes(q) ||
      (qNorm.length >= 3 && cls.includes(qNorm))
    ) {
      out.push(p);
      if (out.length >= limite) break;
    }
  }
  return out;
}

export function vinculoFromPlano(p: VisionPlanoRow): AutomacaoContaVinculo {
  return {
    classificacao: p.codigo,
    codigo: p.codigoReduzido ?? p.codigo,
    nome: p.nome,
  };
}

export function vinculoFromCodigoManual(
  codigo: string,
  planoRows: VisionPlanoRow[],
): AutomacaoContaVinculo {
  const t = codigo.trim();
  const c = normClsAutomacao(t);
  const p = planoRows.find(
    (x) => normClsAutomacao(x.codigo) === c || (x.codigoReduzido ?? '').replace(/\D/g, '') === t.replace(/\D/g, ''),
  );
  if (p) return vinculoFromPlano(p);
  return { classificacao: t, codigo: t.replace(/\D/g, '') || t, nome: t };
}

export function rowFromVinculo(
  v: AutomacaoContaVinculo,
  planoRows: VisionPlanoRow[],
  balancete?: VisionBalanceteRow[],
): VisionBalanceteRow | null {
  const c = normClsAutomacao(v.classificacao);
  if (balancete?.length) {
    const noBal = balancete.find(
      (r) => r.tipo !== 'S' && normClsAutomacao(getClassificacao(r)) === c,
    );
    if (noBal) return noBal;
  }
  const p = planoRows.find((x) => normClsAutomacao(x.codigo) === c);
  if (p) return planoParaRow(p);
  return {
    codigo: v.codigo ?? v.classificacao,
    classificacao: v.classificacao,
    nome: v.nome ?? v.classificacao,
    tipo: 'A',
    saldoInicial: 0,
    debito: 0,
    credito: 0,
    saldoFinal: 0,
  };
}

export function resolverContaAutomacao(
  papel: AutomacaoContaPapel,
  config: AutomacaoContaConfig,
  planoRows: VisionPlanoRow[],
  balancete?: VisionBalanceteRow[],
  lado?: 'debito' | 'credito',
): VisionBalanceteRow | null {
  const ladoEff = lado ?? LEGACY_LADO[papel];
  const v = getVinculoPapel(config, papel, ladoEff);
  if (!v) return null;
  return rowFromVinculo(v, planoRows, balancete);
}

/** Resolve par D/C configurado para o papel (quando ambos existem). */
export function resolverParAutomacao(
  papel: AutomacaoContaPapel,
  config: AutomacaoContaConfig,
  planoRows: VisionPlanoRow[],
  balancete?: VisionBalanceteRow[],
): { debito: VisionBalanceteRow | null; credito: VisionBalanceteRow | null } {
  return {
    debito: resolverContaAutomacao(papel, config, planoRows, balancete, 'debito'),
    credito: resolverContaAutomacao(papel, config, planoRows, balancete, 'credito'),
  };
}

export function papeisConfiguradosCount(config: AutomacaoContaConfig): number {
  const papeis = PAPEIS_AUTOMACAO_UI.filter((p) => {
    const cfg = config[p.id];
    if (!cfg) return false;
    return (
      isVinculo(cfg.debito) ||
      isVinculo(cfg.credito) ||
      !!cfg.classificacao?.trim()
    );
  }).length;
  const colig = (config.emprestimoColigadas ?? []).filter(
    (c) => isVinculo(c.debito) || isVinculo(c.credito),
  ).length;
  return papeis + colig;
}

export function papelConfigurado(config: AutomacaoContaConfig, papel: AutomacaoContaPapel): boolean {
  const cfg = config[papel];
  if (!cfg) return false;
  return isVinculo(cfg.debito) || isVinculo(cfg.credito) || !!cfg.classificacao?.trim();
}

export function newEmprestimoColigadaId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `colig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
