/**
 * Descobre lançamentos do extrato sem regra e gera fallbacks de cobertura.
 */
import type { ExtratoRegraConta } from './extratoRegrasContasStorage';
import { normalizeExtratoMatchText } from './extratoRegrasContasStorage';
import { matchExtratoRegraConta } from './extratoRegrasContasMatcher';
import {
  resolveCodigoReduzidoDoPlano,
  sanitizeCodigoReduzido,
} from './planoContasMapper';

export type ExtratoLinhaParaRegra = {
  description: string;
  nature: string;
  value: number;
};

export type PlanoOptionLike = {
  code: string;
  name: string;
  codigoReduzido?: string;
};

const STOP = new Set([
  'DE',
  'DA',
  'DO',
  'DOS',
  'DAS',
  'E',
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
  'FORNECEDORES',
  'FORNECEDOR',
  'CLIENTE',
  'CLIENTES',
  'SISPAG',
  'OUTRA',
]);

export function findUncoveredExtratoRows(
  extrato: ExtratoLinhaParaRegra[],
  regrasDoBanco: ExtratoRegraConta[],
): ExtratoLinhaParaRegra[] {
  if (!extrato.length) return [];
  const uncovered: ExtratoLinhaParaRegra[] = [];
  const seen = new Set<string>();

  for (const row of extrato) {
    const nature = row.nature === 'C' ? 'C' : 'D';
    const hist = normalizeExtratoMatchText(row.description);
    if (!hist) continue;
    const key = `${nature}|${hist}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const hit = matchExtratoRegraConta(hist, nature, regrasDoBanco);
    if (!hit) {
      uncovered.push({
        description: row.description,
        nature,
        value: row.value,
      });
    }
  }
  return uncovered;
}

/** Agrupa padrões únicos para a IA (até N). */
export function summarizeUncoveredForAi(
  uncovered: ExtratoLinhaParaRegra[],
  limit = 200,
): ExtratoLinhaParaRegra[] {
  return uncovered.slice(0, limit);
}

/** Parte a lista em lotes (ex.: 40) para a IA responder mais rápido. */
export function chunkUncoveredForAiBatches<T>(items: T[], batchSize = 40): T[][] {
  const size = Math.max(1, Math.floor(batchSize));
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Filtra lançamentos sem regra cujo histórico casa com palavras do pedido do usuário
 * (ex.: "POLO SUL CLIMATIZAÇÃO"). Se não achar overlap, devolve a lista original.
 */
export function filterUncoveredByUserHint(
  uncovered: ExtratoLinhaParaRegra[],
  userMessage: string,
): ExtratoLinhaParaRegra[] {
  const tokens = tokensUteis(userMessage).filter((t) => t.length >= 4);
  if (tokens.length === 0 || uncovered.length === 0) return uncovered;

  const scored = uncovered
    .map((row) => {
      const hist = normalizeExtratoMatchText(row.description);
      let hits = 0;
      for (const t of tokens) {
        if (hist.includes(t)) hits += 1;
      }
      return { row, hits };
    })
    .filter((x) => x.hits >= Math.min(2, tokens.length));

  if (scored.length === 0) return uncovered;
  scored.sort((a, b) => b.hits - a.hits);
  return scored.map((x) => x.row);
}

/**
 * Tenta achar no plano a conta citada no pedido do chat
 * (ex.: "fundo fixo de caixa", "conta 1234").
 */
export function resolveContaFromUserMessage(
  userMessage: string,
  plano: PlanoOptionLike[],
): string {
  const msg = normalizeExtratoMatchText(userMessage);
  if (!msg || plano.length === 0) return '';

  const codeHit = msg.match(/\b(\d{1,7})\b/);
  if (codeHit) {
    const red = sanitizeCodigoReduzido(codeHit[1]);
    if (red) {
      const exists = plano.some(
        (p) =>
          sanitizeCodigoReduzido(p.codigoReduzido) === red ||
          sanitizeCodigoReduzido(p.code) === red,
      );
      if (exists) return red;
    }
  }

  // Frases típicas após "no/na/para/em/jogad*"
  const afterPrep =
    msg.match(
      /(?:JOGAD[AO]|JOGAR|USAR|USANDO|PARA|NO|NA|EM|CONTA)\s+(.+)$/,
    )?.[1] || msg;

  let best = '';
  let bestScore = 0;
  const hintTokens = new Set(tokensUteis(afterPrep));
  if (hintTokens.size === 0) return '';

  for (const p of plano) {
    const red = sanitizeCodigoReduzido(p.codigoReduzido) || sanitizeCodigoReduzido(p.code);
    if (!red) continue;
    const nameTokens = tokensUteis(p.name);
    if (nameTokens.length === 0) continue;
    let matched = 0;
    for (const nt of nameTokens) {
      if (hintTokens.has(nt) || [...hintTokens].some((h) => h.includes(nt) || nt.includes(h))) {
        matched += 1;
      }
    }
    if (matched === 0) continue;
    const score =
      matched * 25 +
      (matched === nameTokens.length ? 40 : 0) +
      (/\bFUNDO\b/.test(normalizeExtratoMatchText(p.name)) && hintTokens.has('FUNDO')
        ? 30
        : 0) +
      (/\bCAIXA\b/.test(normalizeExtratoMatchText(p.name)) && hintTokens.has('CAIXA')
        ? 20
        : 0);
    if (score > bestScore) {
      bestScore = score;
      best = red;
    }
  }
  return bestScore >= 40 ? best : '';
}

/**
 * Aplica o pedido do chat localmente: cria regras para históricos que casam
 * com o texto do usuário, apontando para a conta resolvida no plano.
 */
export function buildRegrasFromUserChatIntent(input: {
  userMessage: string;
  uncovered: ExtratoLinhaParaRegra[];
  contaBanco: string;
  plano: PlanoOptionLike[];
  contaContrapartida?: string;
}): ExtratoRegraConta[] {
  const banco = input.contaBanco.trim();
  const contra =
    sanitizeCodigoReduzido(input.contaContrapartida || '') ||
    resolveContaFromUserMessage(input.userMessage, input.plano);
  if (!banco || !contra) return [];

  const filtered = filterUncoveredByUserHint(input.uncovered, input.userMessage);
  // Se o filtro devolveu tudo (sem hint forte), ainda assim exige overlap mínimo
  // com tokens do pedido — senão não inventa regra em massa.
  const tokens = tokensUteis(input.userMessage).filter((t) => t.length >= 4);
  const rows =
    filtered.length < input.uncovered.length
      ? filtered
      : input.uncovered.filter((row) => {
          const hist = normalizeExtratoMatchText(row.description);
          return tokens.some((t) => hist.includes(t));
        });

  const out: ExtratoRegraConta[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const nature = row.nature === 'C' ? 'C' : 'D';
    const desc = extractRegraDescricaoFromHistorico(row.description);
    if (!desc) continue;
    const key = `${nature}|${normalizeExtratoMatchText(desc)}|${contra}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: crypto.randomUUID(),
      nome: desc.slice(0, 40),
      descricao: desc,
      nature,
      contaBanco: banco,
      contaContrapartida: contra,
    });
  }
  return out;
}

function tokensUteis(text: string): string[] {
  return normalizeExtratoMatchText(text)
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

/** Trecho estável da descrição para virar regra (nome completo quando possível). */
export function extractRegraDescricaoFromHistorico(description: string): string {
  const norm = normalizeExtratoMatchText(description);
  const tokens = tokensUteis(norm);
  if (tokens.length === 0) return norm.slice(0, 60);
  // Prefere 2–5 tokens discriminadores (ex.: POLO SUL CLIMATIZACAO)
  return tokens.slice(0, Math.min(5, Math.max(2, tokens.length))).join(' ');
}

/**
 * Escolhe no plano a conta cujo nome mais casa com o histórico.
 * Evita prefixos genéricos: exige overlap de tokens discriminadores.
 */
export function bestPlanoContaForHistorico(
  description: string,
  plano: PlanoOptionLike[],
): string {
  const histTokens = new Set(tokensUteis(description));
  if (histTokens.size === 0 || plano.length === 0) return '';

  let bestCode = '';
  let bestScore = 0;

  for (const p of plano) {
    const red = sanitizeCodigoReduzido(p.codigoReduzido) || sanitizeCodigoReduzido(p.code);
    if (!red) continue;
    const nameTokens = tokensUteis(p.name);
    if (nameTokens.length === 0) continue;

    let matched = 0;
    for (const nt of nameTokens) {
      for (const ht of histTokens) {
        if (ht === nt || ht.includes(nt) || nt.includes(ht)) {
          matched += 1;
          break;
        }
      }
    }
    if (matched === 0) continue;

    // Penaliza match só em 1 token genérico curto
    const score = matched * 20 + (matched === nameTokens.length ? 30 : 0) + nameTokens.length;
    if (score > bestScore) {
      bestScore = score;
      bestCode = red;
    }
  }

  // Exige pelo menos um token forte (score mínimo)
  return bestScore >= 20 ? bestCode : '';
}

/**
 * Gera regras locais para cada padrão ainda descoberto (cobertura 100%).
 * Usa melhor conta do plano pelo nome; se não achar, usa fallbackConta.
 */
export function buildFallbackRegrasParaCobertura(input: {
  uncovered: ExtratoLinhaParaRegra[];
  contaBanco: string;
  plano: PlanoOptionLike[];
  fallbackConta?: string;
}): ExtratoRegraConta[] {
  const out: ExtratoRegraConta[] = [];
  const seen = new Set<string>();
  const banco = input.contaBanco.trim();
  if (!banco) return out;

  for (const row of input.uncovered) {
    const nature = row.nature === 'C' ? 'C' : 'D';
    const desc = extractRegraDescricaoFromHistorico(row.description);
    if (!desc) continue;
    const contra =
      bestPlanoContaForHistorico(row.description, input.plano) ||
      resolveCodigoReduzidoDoPlano(input.fallbackConta || '', input.plano) ||
      sanitizeCodigoReduzido(input.fallbackConta || '') ||
      '';
    if (!contra) continue;
    const key = `${nature}|${desc}|${contra}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: crypto.randomUUID(),
      nome: desc.slice(0, 40),
      descricao: desc,
      nature,
      contaBanco: banco,
      contaContrapartida: contra,
    });
  }
  return out;
}
