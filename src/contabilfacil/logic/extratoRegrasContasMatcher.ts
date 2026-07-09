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

function tokenMatchesHistorico(historico: string, token: string): boolean {
  if (token.length < 3) return false;
  if (historico.includes(` ${token} `)) return true;
  if (historico.startsWith(`${token} `)) return true;
  if (historico.endsWith(` ${token}`)) return true;
  if (historico === token) return true;
  // Prefixo truncado no extrato: "CLIMATIZACAO" vs "CLIMATIZAC" / "CLIMATIZA"
  if (token.length >= 6) {
    const stem = token.slice(0, Math.min(8, token.length));
    if (historico.includes(stem)) return true;
  }
  return false;
}

/** Evita casar POLO SUL REFRIGERACAO quando o extrato fala CLIMATIZACAO. */
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

function scoreRegraNoHistorico(historico: string, regra: ExtratoRegraConta): number {
  const descNorm = normalizeExtratoMatchText(regra.descricao);
  if (!descNorm || !historico) return 0;

  const tokens = tokenizeDescricao(descNorm);
  if (hasDiscriminatorConflict(historico, tokens.length ? tokens : [descNorm])) {
    return 0;
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
    // Empate: prefere a descrição mais longa (mais específica)
    if (
      !best ||
      score > best.score ||
      (score === best.score && regra.descricao.length > best.descricao.length)
    ) {
      best = { ...regra, score };
    }
  }
  return best;
}
