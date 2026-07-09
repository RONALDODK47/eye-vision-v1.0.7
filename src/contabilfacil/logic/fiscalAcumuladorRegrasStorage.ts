import { writePersistedLocalStorageJson } from '../../lib/persistentLocalStorage';
import { normalizeExtratoMatchText } from './extratoRegrasContasStorage';
import { companyStorageSlug } from './companyWorkspace';

export type FiscalAcumuladorRegraNature = 'D' | 'C';

export type FiscalAcumuladorRegra = {
  id: string;
  nome: string;
  /** Texto para casar com descrição do extrato ou dados da NF (fornecedor, número). */
  descricao: string;
  nature: FiscalAcumuladorRegraNature;
  contaContrapartida: string;
  /** Se vazio, vale para todos os acumuladores. */
  acumuladorKey?: string;
};

function storageKey(company: string): string {
  return `contabilfacil_${companyStorageSlug(company)}_fiscal_acumulador_regras_v1`;
}

function sanitizeRegra(raw: Partial<FiscalAcumuladorRegra>): FiscalAcumuladorRegra | null {
  const descricao = normalizeExtratoMatchText(raw.descricao ?? '');
  const contaContrapartida = (raw.contaContrapartida ?? '').trim();
  if (!descricao || !contaContrapartida) return null;
  const nome = normalizeExtratoMatchText(raw.nome ?? '') || descricao.slice(0, 40);
  const nature: FiscalAcumuladorRegraNature = raw.nature === 'C' ? 'C' : 'D';
  const acumuladorKey = (raw.acumuladorKey ?? '').trim().toUpperCase() || undefined;
  return {
    id: raw.id?.trim() || crypto.randomUUID(),
    nome,
    descricao,
    nature,
    contaContrapartida,
    acumuladorKey,
  };
}

export function loadFiscalAcumuladorRegras(company: string): FiscalAcumuladorRegra[] {
  try {
    const raw = localStorage.getItem(storageKey(company));
    if (!raw?.trim()) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: FiscalAcumuladorRegra[] = [];
    for (const item of parsed) {
      const r = sanitizeRegra(item as Partial<FiscalAcumuladorRegra>);
      if (r) out.push(r);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveFiscalAcumuladorRegras(
  company: string,
  regras: FiscalAcumuladorRegra[],
): FiscalAcumuladorRegra[] {
  const next = regras
    .map((r) => sanitizeRegra(r))
    .filter((r): r is FiscalAcumuladorRegra => Boolean(r));
  writePersistedLocalStorageJson(storageKey(company), next);
  return next;
}

export function addFiscalAcumuladorRegra(
  company: string,
  draft: Omit<FiscalAcumuladorRegra, 'id'> & { id?: string },
): FiscalAcumuladorRegra[] {
  const regra = sanitizeRegra({ ...draft, id: draft.id ?? crypto.randomUUID() });
  if (!regra) return loadFiscalAcumuladorRegras(company);
  return saveFiscalAcumuladorRegras(company, [...loadFiscalAcumuladorRegras(company), regra]);
}

export function removeFiscalAcumuladorRegra(company: string, id: string): FiscalAcumuladorRegra[] {
  return saveFiscalAcumuladorRegras(
    company,
    loadFiscalAcumuladorRegras(company).filter((r) => r.id !== id),
  );
}

export function filterRegrasPorAcumulador(
  regras: FiscalAcumuladorRegra[],
  acumuladorKey?: string,
): FiscalAcumuladorRegra[] {
  const key = (acumuladorKey ?? '').trim().toUpperCase();
  if (!key) return regras;
  return regras.filter((r) => !r.acumuladorKey || r.acumuladorKey === key);
}

export function matchFiscalAcumuladorRegra(
  regras: FiscalAcumuladorRegra[],
  texto: string,
  acumuladorKey?: string,
): FiscalAcumuladorRegra | null {
  const norm = normalizeExtratoMatchText(texto);
  if (!norm) return null;
  const pool = filterRegrasPorAcumulador(regras, acumuladorKey);
  let best: FiscalAcumuladorRegra | null = null;
  let bestLen = 0;
  for (const r of pool) {
    if (!r.descricao) continue;
    if (!norm.includes(r.descricao)) continue;
    if (r.descricao.length > bestLen) {
      bestLen = r.descricao.length;
      best = r;
    }
  }
  return best;
}
