import { writePersistedLocalStorageJson } from '../../lib/persistentLocalStorage';
import { companyStorageSlug } from './companyWorkspace';
import type { FiscalContaPar } from './fiscalContasImposto';
import { fiscalAcumuladorKey } from './fiscalAcumuladorModel';
import type { SpedFiscalItem } from '../../extratoVision/utils/spedFiscalParser';

export type FiscalAcumuladorContasMap = Record<string, FiscalContaPar>;

function storageKey(company: string): string {
  return `contabilfacil_${companyStorageSlug(company)}_fiscal_acumulador_contas_v1`;
}

function sanitizePar(raw: Partial<FiscalContaPar> | undefined): FiscalContaPar {
  return {
    debito: String(raw?.debito ?? '').trim(),
    credito: String(raw?.credito ?? '').trim(),
    debitoRecuperar: String(raw?.debitoRecuperar ?? '').trim(),
    creditoRecuperar: String(raw?.creditoRecuperar ?? '').trim(),
  };
}

export function loadFiscalAcumuladorContas(company: string): FiscalAcumuladorContasMap {
  try {
    const raw = localStorage.getItem(storageKey(company));
    if (!raw?.trim()) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: FiscalAcumuladorContasMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, Partial<FiscalContaPar>>)) {
      const par = sanitizePar(v);
      if (par.debito || par.credito) out[k.toUpperCase()] = par;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveFiscalAcumuladorContas(
  company: string,
  map: FiscalAcumuladorContasMap,
): FiscalAcumuladorContasMap {
  const next: FiscalAcumuladorContasMap = {};
  for (const [k, v] of Object.entries(map)) {
    const par = sanitizePar(v);
    if (par.debito || par.credito) next[k.toUpperCase()] = par;
  }
  writePersistedLocalStorageJson(storageKey(company), next);
  return next;
}

export function patchFiscalAcumuladorConta(
  company: string,
  acumuladorKey: string,
  patch: Partial<FiscalContaPar>,
): FiscalAcumuladorContasMap {
  const current = loadFiscalAcumuladorContas(company);
  const prev = current[acumuladorKey.toUpperCase()] ?? {
    debito: '',
    credito: '',
    debitoRecuperar: '',
    creditoRecuperar: '',
  };
  const merged = sanitizePar({ ...prev, ...patch });
  const next = { ...current };
  const key = acumuladorKey.toUpperCase();
  if (!merged.debito && !merged.credito) {
    delete next[key];
  } else {
    next[key] = merged;
  }
  return saveFiscalAcumuladorContas(company, next);
}

export function contasParaAcumulador(
  map: FiscalAcumuladorContasMap,
  item: Pick<SpedFiscalItem, 'registro' | 'codigo' | 'imposto'>,
): FiscalContaPar | null {
  const key = fiscalAcumuladorKey(item);
  const par = map[key];
  if (!par?.debito?.trim() && !par?.credito?.trim()) return null;
  return par;
}
