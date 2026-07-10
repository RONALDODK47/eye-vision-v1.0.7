/**
 * Consolidação / merge: 1 regra por entidade + natureza (AJTF D / AJTF C).
 */
import type { AiColigada } from './aiInteligenciaStorage';
import { aliasMatchesHistorico } from './aiInteligenciaStorage';
import {
  canonicalColigadaDescricao,
  extractRegraEntityDescricao,
} from './extratoRegrasCobertura';
import type { ExtratoRegraConta } from './extratoRegrasContasStorage';
import {
  normalizeExtratoMatchText,
  normContaBancoCode,
} from './extratoRegrasContasStorage';

export { canonicalColigadaDescricao, extractRegraEntityDescricao };

/** Chave de dedup: natureza + entidade (não o texto literal do PIX). */
export function regraEntityDedupKey(
  regra: Pick<ExtratoRegraConta, 'descricao' | 'nature' | 'contaBanco' | 'contaContrapartida'>,
  coligadas: AiColigada[] = [],
): string {
  const nature = regra.nature === 'C' ? 'C' : 'D';
  const entity = extractRegraEntityDescricao(regra.descricao, nature, coligadas);
  return `${nature}|${normalizeExtratoMatchText(entity)}|${normContaBancoCode(regra.contaBanco)}|${normContaBancoCode(regra.contaContrapartida)}`;
}

/** Prefere descrição mais curta/canônica (melhor cobertura 1→N). */
function preferDescricao(a: string, b: string): string {
  const na = normalizeExtratoMatchText(a);
  const nb = normalizeExtratoMatchText(b);
  if (!na) return nb;
  if (!nb) return na;
  if (na.length <= 12 && !na.includes(' ') && nb.includes(' ')) return na;
  if (nb.length <= 12 && !nb.includes(' ') && na.includes(' ')) return nb;
  return na.length <= nb.length ? na : nb;
}

/**
 * Consolida regras duplicadas da mesma entidade+natureza+banco.
 * Ex.: "PIX RECEBIDO A J T" + "A J T F LTDA" (mesma nature) → 1 regra "AJTF".
 */
export function consolidateExtratoRegras(
  regras: ExtratoRegraConta[],
  coligadas: AiColigada[] = [],
): ExtratoRegraConta[] {
  if (regras.length <= 1) return regras;

  const groups = new Map<string, ExtratoRegraConta>();
  let changed = false;

  for (const r of regras) {
    const nature = r.nature === 'C' ? 'C' : 'D';
    const entityDesc = extractRegraEntityDescricao(r.descricao, nature, coligadas);
    if (!entityDesc) {
      groups.set(`raw|${r.id}`, r);
      continue;
    }

    const groupKey = `${nature}|${normalizeExtratoMatchText(entityDesc)}|${normContaBancoCode(r.contaBanco)}`;
    const existing = groups.get(groupKey);
    if (!existing) {
      const next = {
        ...r,
        descricao: entityDesc,
        nome: entityDesc.slice(0, 40),
      };
      if (normalizeExtratoMatchText(r.descricao) !== normalizeExtratoMatchText(entityDesc)) {
        changed = true;
      }
      groups.set(groupKey, next);
      continue;
    }

    changed = true;
    const preferredDesc = preferDescricao(existing.descricao, entityDesc);
    groups.set(groupKey, {
      ...existing,
      descricao: preferredDesc,
      nome: preferredDesc.slice(0, 40),
      contaContrapartida: existing.contaContrapartida || r.contaContrapartida,
    });
  }

  const out = Array.from(groups.values());
  if (!changed && out.length === regras.length) return regras;
  return out;
}

export type RegraSugestaoInput = {
  descricao: string;
  nature: string;
  contaContrapartida: string;
};

/**
 * Mescla sugestões: 1 regra por entidade+natureza+banco.
 */
export function mergeSugestoesIntoRegras(input: {
  current: ExtratoRegraConta[];
  sugestoes: RegraSugestaoInput[];
  contaBanco: string;
  resolveContra: (raw: string) => string;
  coligadas?: AiColigada[];
}): { next: ExtratoRegraConta[]; added: number; updated: number } {
  const coligadas = input.coligadas ?? [];
  const banco = input.contaBanco.trim();
  let next = [...input.current];
  let added = 0;
  let updated = 0;
  const seenKeys = new Set(
    next
      .filter((r) => normContaBancoCode(r.contaBanco) === normContaBancoCode(banco))
      .map((r) => {
        const nature = r.nature === 'C' ? 'C' : 'D';
        const entity = extractRegraEntityDescricao(r.descricao, nature, coligadas);
        return `${nature}|${normalizeExtratoMatchText(entity)}|${normContaBancoCode(banco)}`;
      }),
  );

  for (const sug of input.sugestoes) {
    const contra = input.resolveContra(sug.contaContrapartida);
    const nature = sug.nature === 'C' ? ('C' as const) : ('D' as const);
    const entityDesc = extractRegraEntityDescricao(sug.descricao, nature, coligadas);
    if (!contra || !entityDesc) continue;

    const groupKey = `${nature}|${normalizeExtratoMatchText(entityDesc)}|${normContaBancoCode(banco)}`;

    const sameEntity = next.find(
      (r) =>
        normContaBancoCode(r.contaBanco) === normContaBancoCode(banco) &&
        r.nature === nature &&
        normalizeExtratoMatchText(
          extractRegraEntityDescricao(r.descricao, nature, coligadas),
        ) === normalizeExtratoMatchText(entityDesc),
    );

    if (sameEntity) {
      const contraMudou =
        normContaBancoCode(sameEntity.contaContrapartida) !== normContaBancoCode(contra);
      const descMudou =
        normalizeExtratoMatchText(sameEntity.descricao) !==
        normalizeExtratoMatchText(entityDesc);
      if (contraMudou || descMudou) {
        next = next.map((r) =>
          r.id === sameEntity.id
            ? {
                ...r,
                nature,
                contaContrapartida: contra,
                nome: entityDesc.slice(0, 40),
                descricao: preferDescricao(sameEntity.descricao, entityDesc),
              }
            : r,
        );
        updated += 1;
      }
      seenKeys.add(groupKey);
      continue;
    }

    if (seenKeys.has(groupKey)) continue;
    seenKeys.add(groupKey);
    next.push({
      id: crypto.randomUUID(),
      nome: entityDesc.slice(0, 40),
      descricao: entityDesc,
      nature,
      contaBanco: banco,
      contaContrapartida: contra,
    });
    added += 1;
  }

  return { next: consolidateExtratoRegras(next, coligadas), added, updated };
}

export function entityAliasMatchesHistorico(historico: string, regraDescricao: string): boolean {
  return aliasMatchesHistorico(historico, regraDescricao);
}
