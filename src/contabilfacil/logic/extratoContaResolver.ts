import {
  derivePlanoGroupFromCode,
  isClassificacaoHierarquica,
  normalizeExtratoContaParaGravacao,
  sanitizeCodigoReduzido,
} from './planoContasMapper';
import type { ExtratoFiscalContext } from './extratoFiscalContext';
import type { FiscalContaMap } from '../../extratoVision/utils/fiscalContaMapping';
import type { ReceitaFederalRegrasStore } from '../../extratoVision/utils/receitaFederalRegras';
import type { FiscalContasImpostoConfig } from './fiscalContasImposto';
import {
  cacheKeyExtratoConta,
  isContaProibidaContrapartidaAutomatica,
  escolherContrapartidaContabilSenior,
  pickContaFornecedorExtrato,
  type ExtratoOperacaoLogica,
} from './extratoContabilSenior';
import type { ExtratoSemNotaDecisions } from './extratoSemNotaStorage';
import type { ExtratoRegraConta } from './extratoRegrasContasStorage';
import { filterExtratoRegrasPorBanco, normContaBancoCode } from './extratoRegrasContasStorage';
import { matchExtratoRegraConta } from './extratoRegrasContasMatcher';
import {
  matchColigadaNoHistorico,
  type AiColigada,
} from './aiInteligenciaStorage';
import { yieldToMain } from '../lib/deferIdle';

export type { ExtratoOperacaoLogica };

/** Fallback legado — não tratar como conta manual válida. */
export const EXTRATO_CONTA_FALLBACK = '1.01.02.0002';

export type ExtratoContaMappingEntry = {
  contaDebito: string;
  contaCredito: string;
};

/** Cache por significado normalizado (histórico/operação) → par débito/crédito. */
export type ExtratoContaMappingCache = Record<string, ExtratoContaMappingEntry>;

export type ExtratoContaPlanoLike = {
  code: string;
  name: string;
  codigoReduzido?: string;
  tipo?: 'S' | 'A';
  group?: string;
};

export { cacheKeyExtratoConta } from './extratoContabilSenior';

type RegraLogicaExtrato = {
  logica: ExtratoOperacaoLogica;
  gruposContrapartida: string[];
  hintsNome: RegExp[];
};

const REGRAS_LOGICA: RegraLogicaExtrato[] = [
  {
    logica: 'TARIFA_BANCARIA',
    gruposContrapartida: ['DESPESA'],
    hintsNome: [/TARIFA|DESPESA\s+FINANCEIRA|SERVI[ÇC]O\s+BANC/i],
  },
  {
    logica: 'JUROS_IOF',
    gruposContrapartida: ['DESPESA'],
    hintsNome: [/IOF|JUROS|ENCARGO|MORA|MULTA/i],
  },
  {
    logica: 'IMPOSTO_TRIBUTO',
    gruposContrapartida: ['PASSIVO', 'DESPESA'],
    hintsNome: [/IMPOSTO|TRIBUTO|DARF|GPS|IRPJ|CSLL|PIS|COFINS|ISS/i],
  },
  {
    logica: 'FOLHA_PAGAMENTO',
    gruposContrapartida: ['PASSIVO', 'DESPESA'],
    hintsNome: [/SALARIO|FOLHA|FERIAS|RESCISAO|ORDENADO/i],
  },
  {
    logica: 'LIQUIDACAO_COBRANCA',
    gruposContrapartida: ['ATIVO', 'RECEITA', 'PASSIVO'],
    hintsNome: [/CLIENTE|DUPLICATA|COBRANCA|RECEBIVEL/i],
  },
  {
    // Amortização / pagamento de empréstimo tomado → reduz passivo.
    logica: 'EMPRESTIMO_PAGAMENTO',
    gruposContrapartida: ['PASSIVO'],
    hintsNome: [/EMPRESTIMO|FINANCIAMENTO|MUTUO|M[UÚ]TUO/i],
  },
  {
    // Liberação / entrada de empréstimo tomado → aumenta passivo.
    logica: 'EMPRESTIMO_RECEBIMENTO',
    gruposContrapartida: ['PASSIVO'],
    hintsNome: [/EMPRESTIMO|FINANCIAMENTO|MUTUO|M[UÚ]TUO/i],
  },
  {
    // Saída concedendo empréstimo/mútuo → ativo (a receber), nunca passivo.
    logica: 'EMPRESTIMO_CONCESSAO',
    gruposContrapartida: ['ATIVO'],
    hintsNome: [/EMPRESTIMO|FINANCIAMENTO|MUTUO|M[UÚ]TUO|A\s+RECEBER|COLIGAD|PARTES?\s+RELACIONAD/i],
  },
  {
    logica: 'SAQUE',
    gruposContrapartida: ['ATIVO', 'PATRIMONIO_LIQUIDO'],
    hintsNome: [/CAIXA|SAQUE|RETIRADA/i],
  },
  {
    logica: 'PAGAMENTO_FORNECEDOR',
    gruposContrapartida: ['PASSIVO'],
    hintsNome: [/FORNECEDOR|DUPLICATA|OBRIGAC/i],
  },
  {
    logica: 'RECEBIMENTO_CLIENTE',
    gruposContrapartida: ['RECEITA', 'ATIVO', 'PASSIVO'],
    hintsNome: [/CLIENTE|RECEITA|VENDA|FATURAMENTO|DUPLICATA/i],
  },
  {
    logica: 'APLICACAO_FINANCEIRA',
    gruposContrapartida: ['ATIVO'],
    hintsNome: [/APLIC|CDB|RDB|INVEST|RESGATE/i],
  },
  {
    logica: 'SAIDA_DESPESA',
    gruposContrapartida: ['DESPESA', 'PASSIVO'],
    hintsNome: [/DESPESA|GASTO/i],
  },
  {
    logica: 'ENTRADA_RECEITA',
    gruposContrapartida: ['RECEITA', 'PASSIVO', 'PATRIMONIO_LIQUIDO'],
    hintsNome: [/RECEITA|RENDA|GANHO/i],
  },
];

const RE_RUIDO_SIGNIFICADO =
  /\b(saldo\s+do\s+dia|saldo\s+anterior|doc\.?|nr\.?\s*doc)\b|\d{1,2}\s*[/.-]\s*\d{1,2}/gi;

const TOKEN_STOP = new Set([
  'DE',
  'DA',
  'DO',
  'DOS',
  'DAS',
  'EM',
  'NA',
  'NO',
  'PARA',
  'POR',
  'COM',
  'SEM',
  'VIA',
  'REF',
  'OUTRA',
  'IF',
  'MT',
  'PIX',
  'TED',
  'DOC',
  'TAR',
  'TEF',
]);

/** Normaliza histórico para chave de conciliação (significado da operação). */
export function normalizeSignificadoExtrato(text: string): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(RE_RUIDO_SIGNIFICADO, ' ')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokensSignificadoExtrato(significado: string): string[] {
  return significado
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !TOKEN_STOP.has(t) && !/^\d+$/.test(t));
}

function normCls(code: string): string {
  return code.replace(/[^\d]/g, '').trim();
}

/** Índice de variantes de código → canônico para conciliação (CÓDIGO REDUZIDO quando existir).
 * Classificação hierárquica (2.1.10…) é só chave de busca — nunca o valor canônico se houver reduzido.
 */
export function buildPlanoCodeIndex(plano: ExtratoContaPlanoLike[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const c of plano) {
    const classif = c.code.trim();
    const reduzido = sanitizeCodigoReduzido(c.codigoReduzido);
    // PROIBIDO: usar classificação como canônico quando o plano tem reduzido.
    const canonical = reduzido || classif;
    if (!canonical) continue;
    const keys = new Set<string>([canonical, normCls(canonical)]);
    if (classif) {
      keys.add(classif);
      keys.add(normCls(classif));
    }
    if (reduzido) {
      keys.add(reduzido);
      keys.add(normCls(reduzido));
    }
    for (const key of keys) {
      if (key) index.set(key, canonical);
    }
  }
  return index;
}

export function canonizarContaPlano(
  code: string,
  index: Map<string, string>,
): string {
  const c = code.trim();
  if (!c) return '';
  const hit = index.get(c) ?? index.get(normCls(c)) ?? '';
  // Se ainda veio classificação e o índice não resolveu para reduzido, rejeita.
  if (hit && isClassificacaoHierarquica(hit)) {
    // Mantém só se não houver alternativa (plano sem reduzido).
    return hit;
  }
  return hit;
}

export function isContaManualValida(
  code: string | undefined,
  index: Map<string, string>,
): boolean {
  const c = code?.trim();
  if (!c) return false;
  if (c === EXTRATO_CONTA_FALLBACK || normCls(c) === normCls(EXTRATO_CONTA_FALLBACK)) {
    return false;
  }
  // Código reduzido Domínio (1–7 dígitos) é válido se existir no plano.
  if (/^\d{1,7}$/.test(c)) {
    return Boolean(canonizarContaPlano(c, index));
  }
  if (c.length < 4) return false;
  const canon = canonizarContaPlano(c, index);
  if (!canon) return false;
  // Classificação pura sem reduzido mapeado: ainda aceita só se o plano não tiver reduzido.
  return true;
}

/** Grupo sintético (prefixo) — evita duplicar analíticas do mesmo bloco (ex.: duas «telefone»). */
export function parentGrupoConta(code: string): string {
  const parts = code.replace(/[^\d.]/g, '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  return parts.slice(0, 3).join('.');
}

function scoreContaNome(nome: string, tokens: string[]): number {
  const n = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (!n || tokens.length === 0) return 0;
  let score = 0;
  for (const tok of tokens) {
    if (n.includes(tok)) score += tok.length >= 6 ? 3 : 2;
  }
  return score;
}

function isContaAnalitica(c: ExtratoContaPlanoLike): boolean {
  return c.tipo !== 'S';
}

function isContaBanco(c: ExtratoContaPlanoLike): boolean {
  const g = c.group ?? derivePlanoGroupFromCode(c.code);
  if (g !== 'ATIVO') return false;
  const n = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return /BANCO|CONTA\s+MOV|APLIC|DISPONIVEL|COBRANCA/.test(n) && !/CAIXA/.test(n);
}

/** Caixa/cliente não são contrapartida automática de extrato bancário. */
function isContaCaixaOuCliente(c: ExtratoContaPlanoLike): boolean {
  const n = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return /CAIXA|CLIENTE/.test(n);
}

/** Disponibilidades (caixa/banco/aplicação) nunca são contrapartida do extrato. */
function isContaDisponibilidadeExtrato(c: ExtratoContaPlanoLike): boolean {
  if (isContaBanco(c) || isContaCaixaOuCliente(c)) return true;
  const cls = normCls(c.code);
  if (/^11101|^1101|^11102|^1102|^11103|^1103/.test(cls)) return true;
  const n = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return /APLIC|CDB|RDB|COMPROMISSADA/.test(n) && cls.startsWith('1');
}

function isContaContrapartidaValida(c: ExtratoContaPlanoLike): boolean {
  return isContaAnalitica(c) && !isContaDisponibilidadeExtrato(c);
}

function sanitizeManualConta(
  code: string | undefined,
  index: Map<string, string>,
  side: 'contrapartida' | 'banco',
  bancoCanon: string,
  plano: ExtratoContaPlanoLike[],
): string {
  const raw = code?.trim();
  if (!raw) return '';
  const canon =
    normalizeExtratoContaParaGravacao(raw, plano) ||
    canonizarContaPlano(raw, index);
  if (!canon || !isContaManualValida(canon, index)) return '';
  if (side === 'banco') return canon;
  const normBanco = normCls(bancoCanon);
  if (normBanco && normCls(canon) === normBanco) return '';
  const row = plano.find(
    (p) =>
      normCls(p.code) === normCls(canon) ||
      sanitizeCodigoReduzido(p.codigoReduzido) === canon,
  );
  if (row && isContaDisponibilidadeExtrato(row)) return '';
  return canon;
}

function contrapartidaCacheInvalida(
  nature: 'D' | 'C',
  deb: string,
  cred: string,
  plano: ExtratoContaPlanoLike[],
  bancoCanon: string,
): boolean {
  const contra = nature === 'D' ? deb : cred;
  const normContra = normCls(contra);
  const normBanco = normCls(bancoCanon);
  if (normBanco && normContra === normBanco) return true;
  const row = plano.find((p) => normCls(p.code) === normContra);
  return row ? isContaDisponibilidadeExtrato(row) : false;
}

export function findContaBancoNoPlano(
  plano: ExtratoContaPlanoLike[],
  contaPreferida?: string,
  codeIndex?: Map<string, string>,
): string {
  const pref = contaPreferida?.trim();
  if (!pref) return '';
  // SEMPRE código reduzido quando o plano tiver.
  const red = normalizeExtratoContaParaGravacao(pref, plano);
  if (red) return red;
  const index = codeIndex ?? buildPlanoCodeIndex(plano);
  const canon = canonizarContaPlano(pref, index);
  if (canon && !isClassificacaoHierarquica(canon)) return canon;
  return '';
}

/** Une regras de vários códigos de banco (reduzido + canônico do plano). */
function filterExtratoRegrasPorBancoMulti(
  regras: ExtratoRegraConta[] | null | undefined,
  ...codes: Array<string | undefined>
): ExtratoRegraConta[] {
  if (!regras?.length) return [];
  const norms = new Set(
    codes.map((c) => normContaBancoCode(String(c ?? ''))).filter(Boolean),
  );
  if (norms.size === 0) return regras;
  const matched = regras.filter((r) => norms.has(normContaBancoCode(r.contaBanco)));
  // Se nenhum código bateu, tenta o primeiro código isolado (comportamento antigo)
  if (matched.length > 0) return matched;
  for (const c of codes) {
    if (!c?.trim()) continue;
    const hit = filterExtratoRegrasPorBanco(regras, c);
    if (hit.length > 0) return hit;
  }
  return [];
}

function buildValidManualExtratoPair(
  nature: 'D' | 'C',
  contaDebitoRaw: string | undefined,
  contaCreditoRaw: string | undefined,
  plano: ExtratoContaPlanoLike[],
  contaBancoPreferida?: string,
): { contaDebitoManual?: string; contaCreditoManual?: string } {
  const codeIndex = buildPlanoCodeIndex(plano);
  const bancoCanon = findContaBancoNoPlano(plano, contaBancoPreferida);
  const debRaw = contaDebitoRaw?.trim();
  const credRaw = contaCreditoRaw?.trim();
  if (!debRaw && !credRaw) return {};

  if (nature === 'D') {
    // Contrapartida no débito (lado certo) ou no crédito se o usuário digitou no campo “errado”.
    const contra =
      sanitizeManualConta(debRaw, codeIndex, 'contrapartida', bancoCanon, plano) ||
      sanitizeManualConta(credRaw, codeIndex, 'contrapartida', bancoCanon, plano);
    if (
      contra &&
      bancoCanon &&
      !contrapartidaCacheInvalida('D', contra, bancoCanon, plano, bancoCanon)
    ) {
      return { contaDebitoManual: contra, contaCreditoManual: bancoCanon };
    }
    return {};
  }

  // Natureza C: contrapartida no crédito (lado certo) ou no débito se digitou no outro campo.
  const contra =
    sanitizeManualConta(credRaw, codeIndex, 'contrapartida', bancoCanon, plano) ||
    sanitizeManualConta(debRaw, codeIndex, 'contrapartida', bancoCanon, plano);
  if (
    contra &&
    bancoCanon &&
    !contrapartidaCacheInvalida('C', bancoCanon, contra, plano, bancoCanon)
  ) {
    return { contaDebitoManual: bancoCanon, contaCreditoManual: contra };
  }
  return {};
}

export function purgeInvalidExtratoContaCache(
  cache: ExtratoContaMappingCache,
  plano: ExtratoContaPlanoLike[],
  contaBancoPreferida?: string,
): ExtratoContaMappingCache {
  const bancoCanon = findContaBancoNoPlano(plano, contaBancoPreferida);
  const out: ExtratoContaMappingCache = {};
  for (const [sig, entry] of Object.entries(cache)) {
    if (!sig.includes('|')) continue;
    const deb = entry.contaDebito?.trim();
    const cred = entry.contaCredito?.trim();
    if (!deb || !cred) continue;
    if (contrapartidaCacheInvalida('D', deb, cred, plano, bancoCanon)) continue;
    if (contrapartidaCacheInvalida('C', cred, deb, plano, bancoCanon)) continue;
    const rowDeb = plano.find((p) => normCls(p.code) === normCls(deb));
    const rowCred = plano.find((p) => normCls(p.code) === normCls(cred));
    const nature = sig.endsWith('|C') ? 'C' : 'D';
    const contra = nature === 'D' ? rowDeb : rowCred;
    if (contra && isContaProibidaContrapartidaAutomatica(contra, 'SAIDA_DESPESA', sig)) continue;
    out[sig] = entry;
  }
  return out;
}

/** Garante banco no lado correto (D → crédito; C → débito), preservando contrapartida.
 * Entrada (C): banco DÉBITO · Saída (D): banco CRÉDITO.
 * Nunca devolve Débito = Crédito.
 */
function enforceBancoSide(
  nature: 'D' | 'C',
  banco: string,
  deb: string,
  cred: string,
): { contaDebito: string; contaCredito: string } {
  if (!banco.trim()) {
    if (deb && cred && normCls(deb) === normCls(cred)) {
      return { contaDebito: deb, contaCredito: '' };
    }
    return { contaDebito: deb, contaCredito: cred };
  }
  const normBanco = normCls(banco);
  if (nature === 'D') {
    // Saída: contrapartida no débito, banco no crédito
    const contra =
      deb && normCls(deb) !== normBanco
        ? deb
        : cred && normCls(cred) !== normBanco
          ? cred
          : '';
    return { contaDebito: contra, contaCredito: banco };
  }
  // Entrada: banco no débito, contrapartida no crédito
  const contra =
    cred && normCls(cred) !== normBanco
      ? cred
      : deb && normCls(deb) !== normBanco
        ? deb
        : '';
  return { contaDebito: banco, contaCredito: contra };
}

function findSegundaContaBanco(plano: ExtratoContaPlanoLike[], bancoPrincipal: string): string {
  const normPrincipal = normCls(bancoPrincipal);
  const bancos = plano
    .filter(isContaAnalitica)
    .filter(isContaBanco)
    .map((c) => c.code.trim())
    .filter((code) => normCls(code) !== normPrincipal);
  return bancos[0] ?? bancoPrincipal;
}

/** Classifica a operação pelo histórico + natureza D/C (lógica contábil). */
export function classificarOperacaoExtrato(significado: string, nature: 'D' | 'C'): ExtratoOperacaoLogica {
  const s = significado;

  if (
    /TRANSFERENCIA|TRANSF\b|CRED\.?\s*TR\.?\s*CT|DEB\.?\s*TR\.?\s*CT|DB\.?\s*TR\.?\s*C|ENTRE\s+CONTAS|CTA\s+POUP|POUPANCA/.test(
      s,
    )
  ) {
    return 'TRANSFERENCIA';
  }

  if (nature === 'D') {
    // Só pagamento/amortização explícita de empréstimo tomado → passivo.
    // "DEB EMPREST" genérico NÃO entra aqui: saída de empréstimo = ativo (concessão).
    if (
      /AMORT|PARCELA\s+EMPREST|SEGURO\s+EMPREST|PAGTO?\s+EMPREST|PAGAMENTO\s+EMPREST|LIQUIDAC\w*\s+EMPREST/.test(
        s,
      )
    ) {
      return 'EMPRESTIMO_PAGAMENTO';
    }
    // Saída de empréstimo/mútuo (concessão / mútuo ativo) → ativo.
    if (/EMPREST|MUTUO|M[UÚ]TUO|FINANCIAMENTO\s+CONCED|EMPRESTIMO\s+CONCED/.test(s)) {
      return 'EMPRESTIMO_CONCESSAO';
    }
    if (/SAQ\.?\s*DIG|SAQS\/CARTAO|SAQUE/.test(s)) return 'SAQUE';
    if (/TARIFA|TAR\s|ANUIDADE|MANUTENCAO\s+CONTA|PACOTE\s+SERV|CESTA|COBRANCA\s+DOC/.test(s)) {
      if (!/DEB\.?\s*IOF\s+EMPREST|IOF\s+EMPREST/.test(s)) return 'TARIFA_BANCARIA';
    }
    if (/IOF|JUROS\s+CTA|JUROS\s+EMPREST|ENCARGO|MORA|CTA\s+GARANTIDA/.test(s)) return 'JUROS_IOF';
    if (/DARF|GPS|IMPOSTO|TRIBUTO|IRPJ|CSLL|PIS|COFINS|ISS|INSS\s+EMP|FGTS|CONV\.?\s*ORGAOS|ORGAOS\s+GOV|\bCODE\b|SISPAG\s+(?:FORN|TRIB)/.test(s)) {
      return 'IMPOSTO_TRIBUTO';
    }
    if (/SALARIO|FOLHA|FERIAS|RESCISAO|PLR|ORDENADO/.test(s)) return 'FOLHA_PAGAMENTO';
    if (
      /COMPE|TIT\.|TITULO|TEF\b|COBRANCA|DEB\.?\s*TIT|PGTO\.?\s*BOLETO|DEB\.?\s*PGTO|BOLETO|DIFTIT|MSM\.?TIT/.test(
        s,
      )
    ) {
      return 'PAGAMENTO_FORNECEDOR';
    }
    if (
      /PIX\s*(EMIT|ENV|PAG|SAIDA)|EMIT\.?\s*OUT|PIXEMIT|TED\s+ENV|DOC\s+ENV|PAGAMENTO|DEBITO\s+PIX|DEB\.?\s*CONV/.test(
        s,
      )
    ) {
      return 'PAGAMENTO_FORNECEDOR';
    }
    if (/FORNECEDOR|FORN\b|PAGTO\s+FORN/.test(s)) return 'PAGAMENTO_FORNECEDOR';
    if (/APLIC|CDB|RDB|INVEST|APLICACAO/.test(s)) return 'APLICACAO_FINANCEIRA';
    return 'SAIDA_DESPESA';
  }

  if (/CRED\.?\s*LIQ\.?\s*COBRAN|LIQ\.?\s*COBRAN|CRED\.?\s*TR\.?\s*CT\.?\s*INTERCRE/.test(s)) {
    return 'LIQUIDACAO_COBRANCA';
  }
  if (/EMPREST|LIBERAC\s+CRED|CREDITO\s+EMPREST/.test(s)) return 'EMPRESTIMO_RECEBIMENTO';
  if (
    /PIX\s*REC|PIXRECEB|PIXRECEB|REC\.?\s*OUT|RECEBIMENTO|TED\s+REC|DOC\s+REC|DEPOSITO|CREDITO\s+PIX|CRED\s+PIX|CRED\.?\s*LIQ/.test(
      s,
    )
  ) {
    return 'RECEBIMENTO_CLIENTE';
  }
  if (/RESGATE|APLIC|CDB|RDB/.test(s)) return 'APLICACAO_FINANCEIRA';
  return 'ENTRADA_RECEITA';
}

function regraLogica(logica: ExtratoOperacaoLogica): RegraLogicaExtrato | undefined {
  return REGRAS_LOGICA.find((r) => r.logica === logica);
}

function scoreContaHints(nome: string, hints: RegExp[]): number {
  const n = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let score = 0;
  for (const hint of hints) {
    if (hint.test(n)) score += 5;
  }
  return score;
}

/** Candidatas pelo tipo lógico da operação (independente de tokens do histórico). */
function candidatasPorLogica(
  plano: ExtratoContaPlanoLike[],
  logica: ExtratoOperacaoLogica,
  tokens: string[],
): ContaCandidata[] {
  const regra = regraLogica(logica);
  if (!regra) return [];

  const grupos = new Set(regra.gruposContrapartida);
  const out: ContaCandidata[] = [];

  const tokensUpper = tokens.join(' ');
  const permiteCliente = /CLIENTE|RECEBIVEL/.test(tokensUpper);

  for (const c of plano) {
    if (!isContaAnalitica(c)) continue;
    const g = c.group ?? derivePlanoGroupFromCode(c.code);
    if (!grupos.has(g)) continue;
    if (isContaBanco(c)) continue;
    if (isContaDisponibilidadeExtrato(c)) continue;
    if (isContaCaixaOuCliente(c) && !permiteCliente) continue;
    if (isContaProibidaContrapartidaAutomatica(c, logica, tokens.join(' '))) continue;
    const hintScore = scoreContaHints(c.name, regra.hintsNome);
    const tokenScore = scoreContaNome(c.name, tokens);
    const score = hintScore + tokenScore;
    if (score <= 0) continue;

    out.push({
      code: c.code.trim(),
      name: c.name,
      score: score + (hintScore > 0 ? 8 : 0),
      grupo: parentGrupoConta(c.code),
      group: g,
    });
  }

  out.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  return out;
}

function mergeCandidatas(porLogica: ContaCandidata[], porSignificado: ContaCandidata[]): ContaCandidata[] {
  const map = new Map<string, ContaCandidata>();
  for (const c of porSignificado) map.set(normCls(c.code), c);
  for (const c of porLogica) {
    const key = normCls(c.code);
    const prev = map.get(key);
    if (prev) {
      map.set(key, { ...prev, score: prev.score + c.score });
    } else {
      map.set(key, c);
    }
  }
  return [...map.values()].sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
}

type ContaCandidata = { code: string; name: string; score: number; grupo: string; group: string };

function candidatasPorSignificado(
  plano: ExtratoContaPlanoLike[],
  tokens: string[],
  nature: 'D' | 'C',
  logica: ExtratoOperacaoLogica,
  significado: string,
): ContaCandidata[] {
  const alvo =
    nature === 'D'
      ? new Set(['DESPESA', 'PASSIVO'])
      : new Set(['RECEITA', 'PASSIVO', 'ATIVO']);

  const tokensUpper = tokens.join(' ');
  const permiteCliente = /CLIENTE|RECEBIVEL/.test(tokensUpper);

  const out: ContaCandidata[] = [];
  for (const c of plano) {
    if (!isContaAnalitica(c)) continue;
    const g = c.group ?? derivePlanoGroupFromCode(c.code);
    if (!alvo.has(g)) continue;
    if (isContaBanco(c)) continue;
    if (isContaDisponibilidadeExtrato(c)) continue;
    if (isContaCaixaOuCliente(c) && !permiteCliente) continue;
    if (isContaProibidaContrapartidaAutomatica(c, logica, significado)) continue;
    const score = scoreContaNome(c.name, tokens);
    if (score <= 0) continue;
    out.push({
      code: c.code.trim(),
      name: c.name,
      score,
      grupo: parentGrupoConta(c.code),
      group: g,
    });
  }
  out.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  return out;
}

/** Escolhe uma analítica por grupo sintético; reutiliza cache para não duplicar grupos. */
function escolherContaCanonica(
  candidatas: ContaCandidata[],
  cache: ExtratoContaMappingCache,
  lado: 'debito' | 'credito',
): string {
  if (candidatas.length === 0) return '';

  const usadasNoCache = new Set(
    Object.values(cache)
      .map((e) => (lado === 'debito' ? e.contaDebito : e.contaCredito))
      .filter(Boolean)
      .map(normCls),
  );

  const porGrupo = new Map<string, ContaCandidata[]>();
  for (const c of candidatas) {
    const list = porGrupo.get(c.grupo) ?? [];
    list.push(c);
    porGrupo.set(c.grupo, list);
  }

  let best: ContaCandidata | undefined;
  let bestPri = -1;

  for (const [, grupoList] of porGrupo) {
    const top = grupoList[0]!;
    let pri = top.score;
    if (usadasNoCache.has(normCls(top.code))) pri += 100;
    const cacheHit = grupoList.find((c) => usadasNoCache.has(normCls(c.code)));
    const chosen = cacheHit ?? top;
    const chosenPri = pri + (cacheHit ? 50 : 0);
    if (chosenPri > bestPri) {
      bestPri = chosenPri;
      best = chosen;
    }
  }

  return best?.code ?? candidatas[0]!.code;
}

/** Conta padrão do grupo quando não há match por tokens (só lógica contábil). */
function contaPadraoPorLogica(
  plano: ExtratoContaPlanoLike[],
  logica: ExtratoOperacaoLogica,
  significado = '',
  tokens: string[] = [],
): string {
  if (logica === 'PAGAMENTO_FORNECEDOR') {
    return pickContaFornecedorExtrato(plano, significado, tokens);
  }
  const regra = regraLogica(logica);
  if (!regra) return '';
  const grupos = new Set(regra.gruposContrapartida);
  let fallback = '';

  for (const c of plano) {
    if (!isContaAnalitica(c) || isContaBanco(c)) continue;
    if (isContaDisponibilidadeExtrato(c)) continue;
    const g = c.group ?? derivePlanoGroupFromCode(c.code);
    if (!grupos.has(g)) continue;
    if (isContaProibidaContrapartidaAutomatica(c, logica, '')) continue;
    const nome = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const hint of regra.hintsNome) {
      if (hint.test(nome)) return c.code.trim();
    }
    if (!fallback) fallback = c.code.trim();
  }
  return fallback;
}

/** Contexto pré-computado para aplicar o resolver em lote sem O(n×plano) por linha. */
export type ResolveExtratoContasSharedCtx = {
  codeIndex: Map<string, string>;
  bancoCanon: string;
  regrasDoBanco: ExtratoRegraConta[];
};

export type ResolveExtratoContasInput = {
  description: string;
  operationName?: string;
  nature: 'D' | 'C';
  plano: ExtratoContaPlanoLike[];
  cache: ExtratoContaMappingCache;
  contaDebitoManual?: string;
  contaCreditoManual?: string;
  /** Conta banco do layout OCR / parametrização salva. */
  contaBancoPreferida?: string;
  /** Valor do lançamento (conciliação por acumuladores fiscais). */
  value?: number;
  date?: string;
  fiscalContext?: ExtratoFiscalContext | null;
  rfStore?: ReceitaFederalRegrasStore | null;
  fiscalMap?: FiscalContaMap;
  fiscalContas?: FiscalContasImpostoConfig;
  semNotaDecisions?: ExtratoSemNotaDecisions;
  regrasContas?: ExtratoRegraConta[] | null;
  /** Coligadas cadastradas — NÃO são clientes (AJTF etc.). */
  coligadas?: AiColigada[] | null;
  rowId?: string;
  /** Índices/regras já montados (lote) — evita rebuild por linha. */
  shared?: ResolveExtratoContasSharedCtx;
};

export type ResolveExtratoContasResult = {
  contaDebito: string;
  contaCredito: string;
  significado: string;
  logica: ExtratoOperacaoLogica;
  fromCache: boolean;
  fiscalMatch?: 'com_nf' | 'imposto' | 'sem_nf';
  rfRegraId?: string;
  needsSemNotaConfirm?: boolean;
  semNotaRowKey?: string;
  regraContaId?: string;
};

export type ExtratoSemNotaPendingRow = {
  rowKey: string;
  date: string;
  description: string;
  value: number;
  nature: 'D' | 'C';
  id?: string;
};

function buildExtratoParSoBanco(
  nature: 'D' | 'C',
  bancoCanon: string,
): { contaDebito: string; contaCredito: string } {
  return {
    contaDebito: nature === 'D' ? '' : bancoCanon,
    contaCredito: nature === 'C' ? '' : bancoCanon,
  };
}

export function resolveExtratoContasDebitoCredito(
  input: ResolveExtratoContasInput,
): ResolveExtratoContasResult {
  const significado = normalizeSignificadoExtrato(
    input.operationName?.trim() || input.description?.trim() || '',
  );
  const codeIndex = input.shared?.codeIndex ?? buildPlanoCodeIndex(input.plano);
  const bancoCanon =
    input.shared?.bancoCanon ??
    findContaBancoNoPlano(input.plano, input.contaBancoPreferida, codeIndex);
  const debManualRaw = input.contaDebitoManual?.trim();
  const credManualRaw = input.contaCreditoManual?.trim();

  const logica = classificarOperacaoExtrato(significado, input.nature);

  const coligadasAtivas = input.coligadas ?? [];
  const coligadaHit = matchColigadaNoHistorico(significado, coligadasAtivas);
  const logicaFinal =
    coligadaHit &&
    (logica === 'RECEBIMENTO_CLIENTE' ||
      logica === 'LIQUIDACAO_COBRANCA' ||
      logica === 'PAGAMENTO_FORNECEDOR')
      ? input.nature === 'C'
        ? 'EMPRESTIMO_RECEBIMENTO'
        : 'EMPRESTIMO_CONCESSAO'
      : logica;

  /** Contrapartida só via regra cadastrada; lado D/C das contas vem da natureza do extrato (coluna), não do texto. */
  // Filtra pelo código preferido (reduzido do layout) E pelo canônico do plano —
  // evita perder regras quando um lado está em reduzido e o outro em classificação.
  const regrasDoBanco =
    input.shared?.regrasDoBanco ??
    filterExtratoRegrasPorBancoMulti(
      input.regrasContas,
      input.contaBancoPreferida,
      bancoCanon,
    );
  const regraHit = matchExtratoRegraConta(significado, input.nature, regrasDoBanco);
  if (regraHit) {
    // Conta banco da regra (ou preferida do layout) — lado certo pela natureza:
    // Entrada (C) → banco no DÉBITO · Saída (D) → banco no CRÉDITO.
    const bancoDaRegra =
      findContaBancoNoPlano(input.plano, regraHit.contaBanco, codeIndex) ||
      bancoCanon ||
      findContaBancoNoPlano(input.plano, input.contaBancoPreferida, codeIndex);
    // Contrapartida da regra = exatamente a conta cadastrada (código reduzido).
    let contraCanon =
      normalizeExtratoContaParaGravacao(regraHit.contaContrapartida, input.plano) ||
      canonizarContaPlano(regraHit.contaContrapartida, codeIndex) ||
      sanitizeCodigoReduzido(regraHit.contaContrapartida) ||
      regraHit.contaContrapartida.trim();
    // Coligada no histórico: nunca aceitar conta de FORNECEDOR/CLIENTE da regra
    if (coligadaHit && contraCanon) {
      const contraPlanoHit = input.plano.find((p) => normCls(p.code) === normCls(contraCanon));
      const nome = contraPlanoHit?.name || '';
      if (/\bFORNECEDOR|\bFORN\b|\bCLIENTE\b/i.test(nome)) {
        const better =
          coligadaHit.contaReduzida ||
          input.plano.find((p) =>
            /COLIGAD|PARTES?\s+RELACIONAD|EMPR[EÉ]STIMO\s+ENTRE|M[UÚ]TUO|INTERCOMPANY/i.test(
              p.name,
            ),
          );
        if (typeof better === 'string' && better.trim()) {
          contraCanon = canonizarContaPlano(better, codeIndex) || better.trim();
        } else if (better && typeof better === 'object') {
          const red = sanitizeCodigoReduzido(better.codigoReduzido) || better.code;
          contraCanon = canonizarContaPlano(red, codeIndex) || red;
        }
      }
    }
    if (contraCanon && bancoDaRegra && normCls(contraCanon) !== normCls(bancoDaRegra)) {
      const par = enforceBancoSide(
        input.nature,
        bancoDaRegra,
        input.nature === 'D' ? contraCanon : bancoDaRegra,
        input.nature === 'C' ? contraCanon : bancoDaRegra,
      );
      // Nunca exportar/aplicar Débito = Crédito
      if (normCls(par.contaDebito) !== normCls(par.contaCredito)) {
        return {
          contaDebito:
            normalizeExtratoContaParaGravacao(par.contaDebito, input.plano) || par.contaDebito,
          contaCredito:
            normalizeExtratoContaParaGravacao(par.contaCredito, input.plano) || par.contaCredito,
          significado,
          logica: coligadaHit
            ? input.nature === 'C'
              ? 'EMPRESTIMO_RECEBIMENTO'
              : 'EMPRESTIMO_CONCESSAO'
            : logicaFinal,
          fromCache: false,
          regraContaId: regraHit.id,
        };
      }
    }
  }

  // Coligada com conta reduzida cadastrada — aplica como contrapartida (nunca cliente).
  if (coligadaHit?.contaReduzida) {
    const contraCanon =
      canonizarContaPlano(coligadaHit.contaReduzida, codeIndex) ||
      coligadaHit.contaReduzida.trim();
    if (
      contraCanon &&
      bancoCanon &&
      normCls(contraCanon) !== normCls(bancoCanon) &&
      isContaManualValida(contraCanon, codeIndex)
    ) {
      const par = enforceBancoSide(
        input.nature,
        bancoCanon,
        input.nature === 'D' ? contraCanon : bancoCanon,
        input.nature === 'C' ? contraCanon : bancoCanon,
      );
      if (normCls(par.contaDebito) !== normCls(par.contaCredito)) {
        return {
          contaDebito: normalizeExtratoContaParaGravacao(par.contaDebito, input.plano),
          contaCredito: normalizeExtratoContaParaGravacao(par.contaCredito, input.plano),
          significado,
          logica: input.nature === 'C' ? 'EMPRESTIMO_RECEBIMENTO' : 'EMPRESTIMO_CONCESSAO',
          fromCache: false,
        };
      }
    }
  }

  const manualPair = buildValidManualExtratoPair(
    input.nature,
    debManualRaw,
    credManualRaw,
    input.plano,
    input.contaBancoPreferida,
  );
  if (manualPair.contaDebitoManual && manualPair.contaCreditoManual) {
    const par = enforceBancoSide(
      input.nature,
      bancoCanon || manualPair.contaDebitoManual,
      manualPair.contaDebitoManual,
      manualPair.contaCreditoManual,
    );
    if (normCls(par.contaDebito) !== normCls(par.contaCredito)) {
      return {
        contaDebito: normalizeExtratoContaParaGravacao(par.contaDebito, input.plano),
        contaCredito: normalizeExtratoContaParaGravacao(par.contaCredito, input.plano),
        significado,
        logica: logicaFinal,
        fromCache: false,
      };
    }
  }

  const par = buildExtratoParSoBanco(input.nature, bancoCanon);
  return {
    contaDebito: normalizeExtratoContaParaGravacao(par.contaDebito, input.plano),
    contaCredito: normalizeExtratoContaParaGravacao(par.contaCredito, input.plano),
    significado,
    logica: logicaFinal,
    fromCache: false,
  };
}

export function cacheEntryFromContas(
  contaDebito: string,
  contaCredito: string,
): ExtratoContaMappingEntry | null {
  const deb = contaDebito.trim();
  const cred = contaCredito.trim();
  if (!deb || !cred) return null;
  return { contaDebito: deb, contaCredito: cred };
}

export function mergeExtratoContaCache(
  cache: ExtratoContaMappingCache,
  significado: string,
  entry: ExtratoContaMappingEntry | null,
): ExtratoContaMappingCache {
  if (!significado || !entry) return cache;
  return { ...cache, [significado]: entry };
}

export type ExtratoRowComContas = {
  id?: string;
  description: string;
  operationName?: string;
  nature: 'D' | 'C';
  accountCode?: string;
  accountDebit?: string;
  accountCredit?: string;
  value?: number;
  date?: string;
};

export function applyExtratoContaResolver<T extends ExtratoRowComContas>(
  rows: T[],
  plano: ExtratoContaPlanoLike[],
  cache: ExtratoContaMappingCache,
  options?: {
    contaBancoPreferida?: string;
    fiscalContext?: ExtratoFiscalContext | null;
    rfStore?: ReceitaFederalRegrasStore | null;
    fiscalMap?: FiscalContaMap;
    fiscalContas?: FiscalContasImpostoConfig;
    semNotaDecisions?: ExtratoSemNotaDecisions;
    regrasContas?: ExtratoRegraConta[] | null;
    coligadas?: AiColigada[] | null;
  },
): { rows: T[]; cache: ExtratoContaMappingCache; pendingSemNota: ExtratoSemNotaPendingRow[] } {
  if (plano.length === 0) return { rows, cache, pendingSemNota: [] };
  const pendingSemNota: ExtratoSemNotaPendingRow[] = [];
  const codeIndex = buildPlanoCodeIndex(plano);
  const bancoCanon = findContaBancoNoPlano(plano, options?.contaBancoPreferida, codeIndex);
  const regrasDoBanco = filterExtratoRegrasPorBancoMulti(
    options?.regrasContas,
    options?.contaBancoPreferida,
    bancoCanon,
  );
  const shared: ResolveExtratoContasSharedCtx = {
    codeIndex,
    bancoCanon,
    regrasDoBanco,
  };
  const normBanco = bancoCanon.replace(/\D/g, '');
  const isBanco = (code: string) => {
    const n = code.replace(/\D/g, '');
    return Boolean(normBanco && n && n === normBanco);
  };
  let nextCache = cache;

  const out = rows.map((row) => {
    // Preserva conciliação manual já gravada na linha (não apagar no auto-reapply).
    const resolved = resolveExtratoContasDebitoCredito({
      description: row.description,
      operationName: row.operationName,
      nature: row.nature,
      plano,
      cache: nextCache,
      contaDebitoManual: row.accountDebit,
      contaCreditoManual: row.accountCredit,
      contaBancoPreferida: options?.contaBancoPreferida,
      regrasContas: options?.regrasContas,
      coligadas: options?.coligadas,
      rowId: row.id,
      value: row.value,
      date: row.date,
      shared,
    });

    if (resolved.significado && (resolved.contaDebito || resolved.contaCredito)) {
      nextCache = mergeExtratoContaCache(nextCache, resolved.significado, {
        contaDebito: resolved.contaDebito,
        contaCredito: resolved.contaCredito,
      });
    }

    let deb = resolved.contaDebito;
    let cred = resolved.contaCredito;
    const prevDeb = row.accountDebit?.trim() ?? '';
    const prevCred = row.accountCredit?.trim() ?? '';

    // Regra cadastrada venceu: usa EXATAMENTE as contas da regra (não preserva digitado antigo).
    if (resolved.regraContaId) {
      if (bancoCanon) {
        const fixed = enforceBancoSide(row.nature, bancoCanon, deb, cred);
        deb = fixed.contaDebito;
        cred = fixed.contaCredito;
      }
      deb = normalizeExtratoContaParaGravacao(deb, plano) || deb;
      cred = normalizeExtratoContaParaGravacao(cred, plano) || cred;
      return {
        ...row,
        accountCode: '',
        accountDebit: deb,
        accountCredit: cred,
      };
    }

    // Se o usuário já digitou contrapartida e o resolver só devolveu o banco, mantém o digitado.
    if (row.nature === 'D') {
      const prevContra = (prevDeb && !isBanco(prevDeb) ? prevDeb : '') || (prevCred && !isBanco(prevCred) ? prevCred : '');
      const resolvedContra = deb && !isBanco(deb) ? deb : '';
      if (prevContra && !resolvedContra) {
        deb = prevContra;
        cred = bancoCanon || cred || (isBanco(prevCred) ? prevCred : '') || (isBanco(prevDeb) ? prevDeb : '');
      }
    } else {
      const prevContra = (prevCred && !isBanco(prevCred) ? prevCred : '') || (prevDeb && !isBanco(prevDeb) ? prevDeb : '');
      const resolvedContra = cred && !isBanco(cred) ? cred : '';
      if (prevContra && !resolvedContra) {
        cred = prevContra;
        deb = bancoCanon || deb || (isBanco(prevDeb) ? prevDeb : '') || (isBanco(prevCred) ? prevCred : '');
      }
    }

    // Partida final: banco no lado certo; nunca Débito = Crédito.
    if (bancoCanon) {
      const fixed = enforceBancoSide(row.nature, bancoCanon, deb, cred);
      deb = fixed.contaDebito;
      cred = fixed.contaCredito;
    }
    if (deb && cred && deb.replace(/\D/g, '') === cred.replace(/\D/g, '')) {
      // Quebra o empate: mantém contrapartida e limpa o lado do banco se for a mesma conta.
      if (row.nature === 'D') {
        deb = isBanco(deb) ? '' : deb;
        cred = bancoCanon && normCls(deb) !== normCls(bancoCanon) ? bancoCanon : '';
      } else {
        cred = isBanco(cred) ? '' : cred;
        deb = bancoCanon && normCls(cred) !== normCls(bancoCanon) ? bancoCanon : '';
      }
    }

    // SEMPRE código reduzido na gravação — nunca classificação.
    deb = normalizeExtratoContaParaGravacao(deb, plano);
    cred = normalizeExtratoContaParaGravacao(cred, plano);

    return {
      ...row,
      accountCode: '',
      accountDebit: deb,
      accountCredit: cred,
    };
  });
  return { rows: out, cache: nextCache, pendingSemNota };
}

const RESOLVER_CHUNK_SIZE = 120;

/**
 * Mesma lógica de `applyExtratoContaResolver`, mas cede a main thread a cada lote
 * para o navegador não travar em extratos grandes.
 */
export async function applyExtratoContaResolverAsync<T extends ExtratoRowComContas>(
  rows: T[],
  plano: ExtratoContaPlanoLike[],
  cache: ExtratoContaMappingCache,
  options?: {
    contaBancoPreferida?: string;
    fiscalContext?: ExtratoFiscalContext | null;
    rfStore?: ReceitaFederalRegrasStore | null;
    fiscalMap?: FiscalContaMap;
    fiscalContas?: FiscalContasImpostoConfig;
    semNotaDecisions?: ExtratoSemNotaDecisions;
    regrasContas?: ExtratoRegraConta[] | null;
    coligadas?: AiColigada[] | null;
    chunkSize?: number;
    signal?: AbortSignal;
  },
): Promise<{ rows: T[]; cache: ExtratoContaMappingCache; pendingSemNota: ExtratoSemNotaPendingRow[] }> {
  if (plano.length === 0 || rows.length === 0) {
    return { rows, cache, pendingSemNota: [] };
  }
  if (rows.length <= RESOLVER_CHUNK_SIZE) {
    return applyExtratoContaResolver(rows, plano, cache, options);
  }

  const chunkSize = Math.max(40, options?.chunkSize ?? RESOLVER_CHUNK_SIZE);
  const pendingSemNota: ExtratoSemNotaPendingRow[] = [];
  let nextCache = cache;
  const out: T[] = [];

  for (let i = 0; i < rows.length; i += chunkSize) {
    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const slice = rows.slice(i, i + chunkSize);
    const part = applyExtratoContaResolver(slice, plano, nextCache, options);
    out.push(...part.rows);
    nextCache = part.cache;
    pendingSemNota.push(...part.pendingSemNota);
    if (i + chunkSize < rows.length) {
      await yieldToMain();
    }
  }

  return { rows: out, cache: nextCache, pendingSemNota };
}
