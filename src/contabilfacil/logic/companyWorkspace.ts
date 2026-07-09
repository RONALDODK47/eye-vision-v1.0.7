import { getDeployDataBundle } from '../../lib/deployDataBundle';
import { loadContractsFromBrowserStorage, saveContractsToBrowserStorage } from '../../lib/savedContractStorage';
import { loadAplicacoesFromBrowserStorage } from './aplicacaoStorage';
import { loadParcelamentosFromBrowserStorage } from './parcelamentoStorage';
import { persistCanonicalList } from '../../lib/simuladorBrowserStorage';
import { scheduleEyeVisionCloudPush } from './eyeVisionCloudPush';
import { safeLocalStorageSetItem } from '../../lib/safeLocalStorage';

export const COMPANIES_REGISTRY_KEY = 'contabilfacil_companies_registry_v1';
export const SELECTED_COMPANY_KEY = 'contabilfacil_selected_company_v1';
export const MANAGER_MIGRATION_FLAG = 'contabilfacil_manager_migrated_v1';
export const PARCELAMENTO_MIGRATION_FLAG = 'contabilfacil_parcelamento_company_migrated_v1';
export const APLICACAO_MIGRATION_FLAG = 'contabilfacil_aplicacao_sindicato_migrated_v2';

export interface CompanyRecord {
  id: string;
  name: string;
  createdAt: string;
}

const LEGACY_MANAGER_KEYS = {
  plano: 'plano_contas_central',
  extrato: 'extrato_lancamentos',
  folha: 'folha_payroll_central',
  folhaRelatorio: 'folha_relatorio_lancamentos',
  razao: 'razao_lancamentos',
  balancete: 'balancete_rows',
  fiscalSped: 'fiscal_sped_import',
  fiscalPgdas: 'fiscal_pgdas_import',
  fiscalContasImposto: 'fiscal_contas_imposto',
  folhaContasAutomacao: 'folha_contas_automacao',
  honorariosLancamentos: 'honorarios_lancamentos',
  honorariosContasAutomacao: 'honorarios_contas_automacao',
} as const;

export function normalizeCompanyName(name: string): string {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toUpperCase() || 'SEM EMPRESA';
}

export function companyStorageSlug(companyName: string): string {
  return normalizeCompanyName(companyName)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export function companyManagerStorageKey(companyName: string, suffix: keyof typeof LEGACY_MANAGER_KEYS): string {
  const slug = companyStorageSlug(companyName);
  return `contabilfacil_${slug}_${suffix}`;
}

export const MANAGER_DATA_SUFFIXES = Object.keys(LEGACY_MANAGER_KEYS) as (keyof typeof LEGACY_MANAGER_KEYS)[];

function parseCompaniesRows(rows: unknown[]): CompanyRecord[] {
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const name = normalizeCompanyName(String(r.name ?? ''));
      if (!name) return null;
      return {
        id: String(r.id ?? crypto.randomUUID()),
        name,
        createdAt: String(r.createdAt ?? new Date().toISOString()),
      } satisfies CompanyRecord;
    })
    .filter((row): row is CompanyRecord => row != null);
}

function loadBundledDeployCompanies(): CompanyRecord[] {
  return parseCompaniesRows(getDeployDataBundle().companies as unknown[]);
}

export function loadCompaniesRegistry(): CompanyRecord[] {
  let local: CompanyRecord[] = [];
  try {
    const raw = localStorage.getItem(COMPANIES_REGISTRY_KEY);
    if (raw?.trim()) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) local = parseCompaniesRows(parsed);
    }
  } catch {
    local = [];
  }

  const bundled = loadBundledDeployCompanies();
  const map = new Map<string, CompanyRecord>();
  for (const item of bundled) map.set(item.name, item);
  for (const item of local) map.set(item.name, item);
  return Array.from(map.values());
}

export function saveCompaniesRegistry(list: CompanyRecord[]): void {
  const deduped = new Map<string, CompanyRecord>();
  for (const item of list) {
    const name = normalizeCompanyName(item.name);
    if (!deduped.has(name)) {
      deduped.set(name, { ...item, name });
    }
  }
  localStorage.setItem(COMPANIES_REGISTRY_KEY, JSON.stringify(Array.from(deduped.values())));
  scheduleEyeVisionCloudPush();
}

export function loadSelectedCompanyName(): string {
  const stored = localStorage.getItem(SELECTED_COMPANY_KEY);
  if (stored?.trim()) return normalizeCompanyName(stored);
  return '';
}

export function saveSelectedCompanyName(name: string): void {
  localStorage.setItem(SELECTED_COMPANY_KEY, normalizeCompanyName(name));
  scheduleEyeVisionCloudPush();
}

export function discoverCompanyNamesFromStorage(): string[] {
  const names = new Set<string>();

  for (const contract of loadContractsFromBrowserStorage()) {
    names.add(normalizeCompanyName(contract.companyName));
  }

  for (const app of loadAplicacoesFromBrowserStorage()) {
    if (app.sindicatoName?.trim()) {
      names.add(normalizeCompanyName(app.sindicatoName));
    }
  }

  for (const parcel of loadParcelamentosFromBrowserStorage()) {
    const scoped = (parcel as { companyName?: string }).companyName;
    if (scoped?.trim()) {
      names.add(normalizeCompanyName(scoped));
    }
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
}

export function syncCompanyRegistry(): CompanyRecord[] {
  const existing = loadCompaniesRegistry();
  const byName = new Map(existing.map((c) => [c.name, c]));

  for (const name of discoverCompanyNamesFromStorage()) {
    if (!byName.has(name)) {
      byName.set(name, {
        id: crypto.randomUUID(),
        name,
        createdAt: new Date().toISOString(),
      });
    }
  }

  const merged = Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
  );

  saveCompaniesRegistry(merged);
  return merged;
}

export function resolveSelectedCompany(companies: CompanyRecord[]): string {
  const stored = loadSelectedCompanyName();
  if (stored && companies.some((c) => c.name === stored)) {
    return stored;
  }

  const fallback = companies[0]?.name ?? 'TECHNOVA INDÚSTRIA LTDA';
  saveSelectedCompanyName(fallback);
  return fallback;
}

export function createCompanyRecord(name: string): CompanyRecord {
  return {
    id: crypto.randomUUID(),
    name: normalizeCompanyName(name),
    createdAt: new Date().toISOString(),
  };
}

export function belongsToCompany(
  itemCompany: string | undefined,
  selectedCompany: string,
  legacyFallback = false,
): boolean {
  const selected = normalizeCompanyName(selectedCompany);
  const item = normalizeCompanyName(itemCompany ?? '');
  if (item === selected) return true;
  if (!itemCompany?.trim() && legacyFallback) return true;
  return false;
}

export function belongsToSindicato(
  sindicatoName: string | undefined,
  selectedCompany: string,
  legacyFallback = false,
): boolean {
  return belongsToCompany(sindicatoName, selectedCompany, legacyFallback);
}

export function getAplicacaoFolderName(app: { nomeEmpresa?: string; nomeAplicacao?: string }): string {
  const folder = String(app.nomeEmpresa ?? '').trim();
  if (folder) return folder.toUpperCase();
  const fromName = String(app.nomeAplicacao ?? '').trim();
  if (fromName) return fromName.toUpperCase();
  return 'APLICAÇÕES GERAIS';
}

export function migrateOrphanAplicacoes(defaultSindicato: string): void {
  if (localStorage.getItem(APLICACAO_MIGRATION_FLAG)) return;

  const all = loadAplicacoesFromBrowserStorage();
  const contractCompanies = new Set(
    loadContractsFromBrowserStorage().map((c) => normalizeCompanyName(c.companyName)),
  );
  let changed = false;
  const fallback = normalizeCompanyName(defaultSindicato);

  const migrated = all.map((item) => {
    if (item.sindicatoName?.trim()) return item;
    changed = true;
    const empresa = normalizeCompanyName(item.nomeEmpresa);
    if (empresa && contractCompanies.has(empresa)) {
      return { ...item, sindicatoName: empresa };
    }
    return { ...item, sindicatoName: fallback };
  });

  if (changed) {
    persistCanonicalList('simulador_aplicacoes', migrated);
  }

  localStorage.setItem(APLICACAO_MIGRATION_FLAG, '1');
}

export function migrateLegacyManagerData(targetCompany: string): void {
  if (localStorage.getItem(MANAGER_MIGRATION_FLAG)) return;

  const company = normalizeCompanyName(targetCompany);
  for (const suffix of Object.keys(LEGACY_MANAGER_KEYS) as (keyof typeof LEGACY_MANAGER_KEYS)[]) {
    const legacyKey = LEGACY_MANAGER_KEYS[suffix];
    const raw = localStorage.getItem(legacyKey);
    if (!raw?.trim()) continue;

    const scopedKey = companyManagerStorageKey(company, suffix);
    if (!localStorage.getItem(scopedKey)) {
      localStorage.setItem(scopedKey, raw);
    }
  }

  localStorage.setItem(MANAGER_MIGRATION_FLAG, '1');
}

export function migrateOrphanParcelamentos(defaultCompany: string): void {
  if (localStorage.getItem(PARCELAMENTO_MIGRATION_FLAG)) return;

  const all = loadParcelamentosFromBrowserStorage();
  let changed = false;
  const company = normalizeCompanyName(defaultCompany);

  const migrated = all.map((item) => {
    const scoped = (item as { companyName?: string }).companyName;
    if (scoped?.trim()) return item;
    changed = true;
    return { ...item, companyName: company };
  });

  if (changed) {
    localStorage.setItem('simulador_parcelamentos', JSON.stringify(migrated));
  }

  localStorage.setItem(PARCELAMENTO_MIGRATION_FLAG, '1');
}

const managerMemoryCache = new Map<string, unknown[]>();
const pendingManagerWrites = new Map<string, ReturnType<typeof setTimeout>>();
const MANAGER_WRITE_DEBOUNCE_MS = 450;

export function readManagerData<T>(companyName: string, suffix: keyof typeof LEGACY_MANAGER_KEYS): T[] {
  const key = companyManagerStorageKey(normalizeCompanyName(companyName), suffix);
  const cached = managerMemoryCache.get(key);
  if (cached) return cached as T[];
  try {
    const raw = localStorage.getItem(key);
    if (!raw?.trim()) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? (parsed as T[]) : [];
    managerMemoryCache.set(key, list);
    return list;
  } catch {
    return [];
  }
}

function persistManagerKey(key: string, payload: string): void {
  // Gravação imediata — o auto-save da pasta depende do setItem.
  // Nunca lança QuotaExceeded (mantém em memória se o LS estiver cheio).
  safeLocalStorageSetItem(key, payload);
  scheduleEyeVisionCloudPush();
}

/** Grava na memória e no localStorage (dispara espelho na pasta selecionada). */
export function writeManagerData<T>(
  companyName: string,
  suffix: keyof typeof LEGACY_MANAGER_KEYS,
  list: T[],
): void {
  const key = companyManagerStorageKey(normalizeCompanyName(companyName), suffix);
  managerMemoryCache.set(key, list);
  const payload = JSON.stringify(list);
  const pending = pendingManagerWrites.get(key);
  if (pending) clearTimeout(pending);
  const timer = setTimeout(() => {
    pendingManagerWrites.delete(key);
    persistManagerKey(key, payload);
  }, MANAGER_WRITE_DEBOUNCE_MS);
  pendingManagerWrites.set(key, timer);
}

/** Gravação síncrona (importações críticas: plano, extrato, etc.). */
export function writeManagerDataNow<T>(
  companyName: string,
  suffix: keyof typeof LEGACY_MANAGER_KEYS,
  list: T[],
): void {
  const key = companyManagerStorageKey(normalizeCompanyName(companyName), suffix);
  const pending = pendingManagerWrites.get(key);
  if (pending) {
    clearTimeout(pending);
    pendingManagerWrites.delete(key);
  }
  managerMemoryCache.set(key, list);
  persistManagerKey(key, JSON.stringify(list));
}

export function hasPendingManagerWrites(): boolean {
  return pendingManagerWrites.size > 0;
}

/** Força gravação imediata (ex.: antes de fechar aba). */
export function flushManagerDataWrites(): void {
  for (const [key, timer] of pendingManagerWrites) {
    clearTimeout(timer);
    const data = managerMemoryCache.get(key);
    if (data) {
      safeLocalStorageSetItem(key, JSON.stringify(data));
      scheduleEyeVisionCloudPush();
    }
  }
  pendingManagerWrites.clear();
}

export function invalidateManagerDataCache(companyName?: string, suffix?: keyof typeof LEGACY_MANAGER_KEYS): void {
  if (!companyName) {
    managerMemoryCache.clear();
    return;
  }
  const norm = normalizeCompanyName(companyName);
  if (suffix) {
    managerMemoryCache.delete(companyManagerStorageKey(norm, suffix));
    return;
  }
  for (const s of Object.keys(LEGACY_MANAGER_KEYS) as (keyof typeof LEGACY_MANAGER_KEYS)[]) {
    managerMemoryCache.delete(companyManagerStorageKey(norm, s));
  }
}

export function renameCompanyInStorage(oldName: string, newName: string): boolean {
  const oldNorm = normalizeCompanyName(oldName);
  const newNorm = normalizeCompanyName(newName);

  if (!oldNorm || !newNorm || oldNorm === newNorm || newNorm === 'SEM EMPRESA') {
    return false;
  }

  const registry = loadCompaniesRegistry();
  if (registry.some((c) => c.name === newNorm && c.name !== oldNorm)) {
    return false;
  }

  const contracts = loadContractsFromBrowserStorage();
  saveContractsToBrowserStorage(
    contracts.map((contract) =>
      normalizeCompanyName(contract.companyName) === oldNorm
        ? { ...contract, companyName: newNorm }
        : contract,
    ),
  );

  const aplicacoes = loadAplicacoesFromBrowserStorage();
  persistCanonicalList(
    'simulador_aplicacoes',
    aplicacoes.map((item) => {
      const scopedSindicato = item.sindicatoName;
      const scopedEmpresa = normalizeCompanyName(item.nomeEmpresa) === oldNorm;
      if (normalizeCompanyName(scopedSindicato ?? '') === oldNorm) {
        return { ...item, sindicatoName: newNorm };
      }
      if (scopedEmpresa && !scopedSindicato?.trim()) {
        return { ...item, nomeEmpresa: newNorm };
      }
      return item;
    }),
  );

  const parcelamentos = loadParcelamentosFromBrowserStorage();
  persistCanonicalList(
    'simulador_parcelamentos',
    parcelamentos.map((item) => {
      const scoped = (item as { companyName?: string }).companyName;
      return normalizeCompanyName(scoped ?? '') === oldNorm ? { ...item, companyName: newNorm } : item;
    }),
  );

  for (const suffix of Object.keys(LEGACY_MANAGER_KEYS) as (keyof typeof LEGACY_MANAGER_KEYS)[]) {
    const oldKey = companyManagerStorageKey(oldNorm, suffix);
    const newKey = companyManagerStorageKey(newNorm, suffix);
    const raw = localStorage.getItem(oldKey);
    if (!raw?.trim()) continue;
    if (!localStorage.getItem(newKey)) {
      localStorage.setItem(newKey, raw);
    }
    localStorage.removeItem(oldKey);
  }

  saveCompaniesRegistry(
    registry.map((company) =>
      company.name === oldNorm ? { ...company, name: newNorm } : company,
    ),
  );

  if (loadSelectedCompanyName() === oldNorm) {
    saveSelectedCompanyName(newNorm);
  }

  invalidateManagerDataCache();

  scheduleEyeVisionCloudPush();

  return true;
}

export function deleteManagerCompanyInStorage(name: string): boolean {
  const norm = normalizeCompanyName(name);
  if (!norm || norm === 'SEM EMPRESA') return false;

  const registry = loadCompaniesRegistry();
  if (!registry.some((c) => c.name === norm)) return false;

  for (const suffix of MANAGER_DATA_SUFFIXES) {
    const key = companyManagerStorageKey(norm, suffix);
    localStorage.removeItem(key);
    managerMemoryCache.delete(key);
    const pending = pendingManagerWrites.get(key);
    if (pending) {
      clearTimeout(pending);
      pendingManagerWrites.delete(key);
    }
  }

  saveContractsToBrowserStorage(
    loadContractsFromBrowserStorage().filter(
      (contract) => normalizeCompanyName(contract.companyName) !== norm,
    ),
  );

  const parcelamentos = loadParcelamentosFromBrowserStorage().filter(
    (item) => normalizeCompanyName((item as { companyName?: string }).companyName ?? '') !== norm,
  );
  if (parcelamentos.length === 0) {
    localStorage.setItem('simulador_parcelamentos', JSON.stringify([]));
  } else {
    persistCanonicalList('simulador_parcelamentos', parcelamentos);
  }

  const aplicacoes = loadAplicacoesFromBrowserStorage().filter(
    (item) => normalizeCompanyName(item.sindicatoName ?? '') !== norm,
  );
  if (aplicacoes.length === 0) {
    localStorage.setItem('simulador_aplicacoes', JSON.stringify([]));
  } else {
    persistCanonicalList('simulador_aplicacoes', aplicacoes);
  }

  const nextRegistry = registry.filter((c) => c.name !== norm);
  saveCompaniesRegistry(nextRegistry);

  if (loadSelectedCompanyName() === norm) {
    const fallback = nextRegistry[0]?.name ?? '';
    if (fallback) saveSelectedCompanyName(fallback);
    else localStorage.removeItem(SELECTED_COMPANY_KEY);
  }

  invalidateManagerDataCache();
  scheduleEyeVisionCloudPush();
  return true;
}
