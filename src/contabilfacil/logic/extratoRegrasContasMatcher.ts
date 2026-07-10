import type { ExtratoRegraConta } from './extratoRegrasContasStorage';
import { normalizeExtratoMatchText } from './extratoRegrasContasStorage';

export type ExtratoRegraContaMatch = ExtratoRegraConta & { score: number };

const STOP_TOKENS = new Set([
  'DE',
  'DA',
  'DO',
  'DOS',
  'DAS',
  'E',
  'OUTRA',
  'PIX',
  'TED',
  'DOC',
  'TEF',
  'LTD',
  'LTDA',
  'ME',
  'EPP',
  'SA',
  'S',
  'RECEBIDO',
  'RECEBIMENTO',
  'PAGAMENTO',
  'TRANSFER',
  'TRANSFERENCIA',
]);

/** Tokens discriminadores — se o histórico tem um e a regra outro, não misturar. */
const DISCRIMINATOR_PAIRS: Array<[string, string]> = [
  ['CLIMATIZACAO', 'REFRIGERACAO'],
  ['CLIMATIZACAO', 'REFRIGER'],
  ['REFRIGERACAO', 'CLIMATIZ'],
];

function tokenizeDescricao(descricao: string): string[] {
  return normalizeExtratoMatchText(descricao)
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
}

/** Compacta "A J T F" / "A.J.T.F" → "AJTF" (local, sem import circular). */
function compactKey(text: string): string {
  const upper = normalizeExtratoMatchText(text);
  if (!upper) return '';
  const collapsed = upper.replace(/\b([A-Z])(?:\s+([A-Z]))+\b/g, (m) => m.replace(/\s+/g, ''));
  return collapsed.replace(/\s+/g, '');
}

/** Regra canônica curta (AJTF) — não nomes longos tipo POLO SUL CLIMATIZACAO. */
function isCompactEntityDescricao(descNorm: string): boolean {
  const key = compactKey(descNorm);
  return key.length >= 3 && key.length <= 12 && /^[A-Z0-9]+$/.test(key) && !/\s/.test(descNorm);
}

/**
 * AJTF casa com "A J T", "A J T F", "A.J.T.F" no histórico.
 * Só para regras compactas (evita falso positivo em nomes longos).
 */
function compactEntityMatchesHistorico(historico: string, entity: string): boolean {
  const entityKey = compactKey(entity);
  if (entityKey.length < 3 || entityKey.length > 12 || !/^[A-Z0-9]+$/.test(entityKey)) {
    return false;
  }
  const histNorm = normalizeExtratoMatchText(historico);
  const histKey = compactKey(histNorm);
  if (histKey.includes(entityKey)) return true;
  if (histNorm.includes(entity)) return true;

  // Sequências de letras soltas: "A J T" / "A J T F"
  const singles = histNorm.match(/\b(?:[A-Z](?:\s+[A-Z]){1,11})\b/g);
  if (singles) {
    for (const s of singles) {
      const key = s.replace(/\s+/g, '');
      if (key.length < 3) continue;
      // AJT ↔ AJTF (prefixo de sigla)
      if (entityKey.startsWith(key) || key.startsWith(entityKey)) return true;
    }
  }

  // Letras espaçadas no meio do texto: A.J.T.F já vira AJTF via compactKey
  if (entityKey.length >= 3 && entityKey.length <= 8) {
    const spaced = entityKey.split('').join('\\s*');
    try {
      if (new RegExp(`(?:^|\\s)${spaced}(?:\\s|$)`).test(histNorm)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

/** Sinônimos bancários para casar regra operacional com histórico. */
const TOKEN_SYNONYMS: Record<string, string[]> = {
  EMIT: ['EMIT', 'ENVIADO', 'ENV', 'PAG', 'SAIDA'],
  ENVIADO: ['ENVIADO', 'EMIT', 'ENV', 'PAG'],
  ENV: ['ENV', 'ENVIADO', 'EMIT'],
  REC: ['REC', 'RECEBIDO', 'RECEBIMENTO'],
  RECEBIDO: ['RECEBIDO', 'REC', 'RECEBIMENTO'],
  RECEBIMENTO: ['RECEBIMENTO', 'RECEBIDO', 'REC'],
};

function expandTokenVariants(token: string): string[] {
  const t = token.toUpperCase();
  return TOKEN_SYNONYMS[t] ?? [t];
}

function tokenMatchesHistorico(historico: string, token: string): boolean {
  if (token.length < 3) return false;
  for (const variant of expandTokenVariants(token)) {
    if (historico.includes(` ${variant} `)) return true;
    if (historico.startsWith(`${variant} `)) return true;
    if (historico.endsWith(` ${variant}`)) return true;
    if (historico === variant) return true;
    if (variant.length >= 6) {
      const stem = variant.slice(0, Math.min(8, variant.length));
      if (historico.includes(stem)) return true;
    }
  }
  return false;
}

function hasDiscriminatorConflict(historico: string, regraTokens: string[]): boolean {
  const histTokens = new Set(tokenizeDescricao(historico));
  for (const [a, b] of DISCRIMINATOR_PAIRS) {
    const histHasA = [...histTokens].some((t) => t.includes(a) || a.includes(t));
    const histHasB = [...histTokens].some((t) => t.includes(b) || b.includes(t));
    const regraHasA = regraTokens.some((t) => t.includes(a) || a.includes(t));
    const regraHasB = regraTokens.some((t) => t.includes(b) || b.includes(t));
    if (histHasA && regraHasB && !regraHasA) return true;
    if (histHasB && regraHasA && !regraHasB) return true;
  }
  return false;
}

const HIST_EXCLUSIVO_CATCHALL =
  /TARIFA|IOF|IMPOSTO|TRIBUTO|DARF|FOLHA|SALARIO|EMPREST|RENDIMENTO|REND\s+PAGO|BB\s+RENDE|RENDE\s+FACIL|APLIC|CDB|RESGATE|OUROCAP|AUT\s+MAIS|TRANSFERENCIA|TRANSF\b/;

function scorePadraoOperacionalAgrupado(historico: string, descNorm: string): number {
  if (descNorm === 'RENDIMENTO APLICACAO') {
    if (
      /RENDIMENTO|REND\s+PAGO|BB\s+RENDE|RENDE\s+FACIL|AUT\s+MAIS|OUROCAP|REND\s+PAGO\s+APLIC/.test(
        historico,
      )
    ) {
      return 420;
    }
    return 0;
  }
  if (descNorm === 'APLICACAO FINANCEIRA') {
    if (/APLIC|CDB|RDB|RESGATE|BB\s+RENDE|RENDE\s+FACIL|OUROCAP|AUT\s+MAIS/.test(historico)) {
      return 410;
    }
    return 0;
  }
  if (descNorm === 'TARIFA BANCARIA') {
    if (/TARIFA|PACOTE\s+SERV|CESTA|ANUIDADE/.test(historico)) return 400;
    return 0;
  }
  if (descNorm === 'PIX REC' || descNorm === 'RECEBIMENTO CLIENTE') {
    if (HIST_EXCLUSIVO_CATCHALL.test(historico)) return 0;
    if (/PIX/.test(historico) && descNorm === 'PIX REC') return 200;
    return 130;
  }
  if (descNorm === 'PIX EMIT' || descNorm === 'PAGAMENTO FORNECEDOR') {
    if (HIST_EXCLUSIVO_CATCHALL.test(historico)) return 0;
    if (/PIX/.test(historico) && descNorm === 'PIX EMIT') return 200;
    return 130;
  }
  return 0;
}

function scoreRegraNoHistorico(historico: string, regra: ExtratoRegraConta): number {
  const descNorm = normalizeExtratoMatchText(regra.descricao);
  if (!descNorm || !historico) return 0;

  const padraoScore = scorePadraoOperacionalAgrupado(historico, descNorm);
  if (padraoScore > 0) return padraoScore;

  const tokens = tokenizeDescricao(descNorm);
  if (hasDiscriminatorConflict(historico, tokens.length ? tokens : [descNorm])) {
    return 0;
  }

  // Só regras curtas (AJTF): 1 regra → N lançamentos via aliases / letras espaçadas
  if (isCompactEntityDescricao(descNorm) && compactEntityMatchesHistorico(historico, descNorm)) {
    return 450 + 80 + Math.min(descNorm.length, 40);
  }

  // Match exato / substring — favorece nome completo
  if (historico === descNorm) return 500 + descNorm.length;
  if (historico.includes(descNorm)) return 400 + descNorm.length * 2;
  // Regra curta cabe no início do histórico (ex.: "TED RECEBIDA" em "TED RECEBIDA CLIENTE X")
  if (descNorm.length >= 4 && historico.startsWith(`${descNorm} `)) {
    return 380 + descNorm.length * 2;
  }

  // Só tokens de stop (PIX/TED/RECEBIDO): ainda casa se a frase da regra aparecer
  if (!tokens.length) {
    const rawTokens = normalizeExtratoMatchText(descNorm)
      .split(/\s+/)
      .filter((t) => t.length >= 2);
    if (rawTokens.length === 0) return 0;
    const allPresent = rawTokens.every(
      (t) =>
        historico === t ||
        historico.startsWith(`${t} `) ||
        historico.includes(` ${t} `) ||
        historico.includes(` ${t}`),
    );
    return allPresent ? 200 + descNorm.length : 0;
  }

  let matched = 0;
  for (const tok of tokens) {
    if (tokenMatchesHistorico(historico, tok)) matched++;
  }

  // Exige a maioria dos tokens da regra (nome completo), não só "POLO"+"SUL"
  const minRequired =
    tokens.length >= 3 ? Math.ceil(tokens.length * 0.67) : tokens.length >= 2 ? 2 : 1;
  if (matched < minRequired) return 0;

  // Bonus por especificidade: mais tokens da regra + cobertura do histórico
  const histTokens = tokenizeDescricao(historico);
  const histCovered = histTokens.filter((ht) =>
    tokens.some((rt) => ht.includes(rt) || rt.includes(ht) || tokenMatchesHistorico(historico, rt)),
  ).length;

  return matched * 40 + descNorm.length + histCovered * 15 + tokens.length * 10;
}

/** Aplica regra personalizada quando a descrição do extrato contém o texto cadastrado. */
export function matchExtratoRegraConta(
  historicoNormalizado: string,
  nature: 'D' | 'C',
  regras: ExtratoRegraConta[] | null | undefined,
): ExtratoRegraContaMatch | null {
  if (!regras?.length) return null;
  const hist = normalizeExtratoMatchText(historicoNormalizado);
  if (!hist) return null;

  let best: ExtratoRegraContaMatch | null = null;
  for (const regra of regras) {
    if (!regra.contaContrapartida.trim()) continue;
    if (regra.nature !== nature) continue;
    const score = scoreRegraNoHistorico(hist, regra);
    if (score <= 0) continue;
    // Empate: prefere descrição canônica curta (1 regra → N lançamentos)
    if (
      !best ||
      score > best.score ||
      (score === best.score && regra.descricao.length < best.descricao.length)
    ) {
      best = { ...regra, score };
    }
  }
  return best;
}
