import { getDeployDataBundle } from '../../lib/deployDataBundle';
import { loadContractsFromBrowserStorage, saveContractsToBrowserStorage } from '../../lib/savedContractStorage';
import { loadAplicacoesFromBrowserStorage } from './aplicacaoStorage';
import { loadParcelamentosFromBrowserStorage } from './parcelamentoStorage';
import { persistCanonicalList } from '../../lib/simuladorBrowserStorage';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
} from '../../lib/safeLocalStorage';
import { repairPortugueseDeep } from '../../lib/repairPortugueseText';
import { scheduleEyeVisionOperationalSave } from './eyeVisionOperationalSave';

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

/** Empresa demo — nunca deve sobrescrever o office no Docker. */
export const DEMO_TECHNOVA_NAME = 'TECHNOVA INDÚSTRIA LTDA';

export function isDemoTechnovaCompany(name: string): boolean {
  const n = normalizeCompanyName(name);
  return n === DEMO_TECHNOVA_NAME || companyStorageSlug(n) === 'TECHNOVA_INDUSTRIA_LTDA';
}

export function mergeCompaniesRegistryLists(...lists: CompanyRecord[][]): CompanyRecord[] {
  const byName = new Map<string, CompanyRecord>();
  for (const list of lists) {
    for (const item of list) {
      const name = normalizeCompanyName(item?.name ?? '');
      if (!name || isDemoTechnovaCompany(name)) continue;
      if (!byName.has(name)) {
        byName.set(name, {
          id: String(item.id || crypto.randomUUID()),
          name,
          createdAt: String(item.createdAt || new Date().toISOString()),
        });
      }
    }
  }
  return Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
  );
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
  fiscalOcr: 'fiscal_ocr_relatorio',
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

/** Nome normalizado da empresa — obrigatório para leitura/gravação isolada por empresa. */
export function requireCompanyScope(companyName: string): string {
  const norm = normalizeCompanyName(companyName);
  if (!norm || norm === 'SEM EMPRESA') {
    throw new Error('Empresa inválida — plano, regras e dados gerenciais são exclusivos por empresa.');
  }
  return norm;
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
    const raw = safeLocalStorageGetItem(COMPANIES_REGISTRY_KEY);
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

export function saveCompaniesRegistry(
  list: CompanyRecord[],
  options?: { replace?: boolean },
): void {
  const incoming = mergeCompaniesRegistryLists(list);
  const existing = mergeCompaniesRegistryLists(loadCompaniesRegistry());

  if (options?.replace) {
    if (incoming.length === 0 && existing.length === 0) return;
    safeLocalStorageSetItem(COMPANIES_REGISTRY_KEY, JSON.stringify(incoming));
    scheduleEyeVisionOperationalSave();
    return;
  }

  // Nunca substitui 2+ empresas reais por lista menor (ex.: só TECHNOVA após hydrate parcial).
  const merged =
    incoming.length >= existing.length
      ? mergeCompaniesRegistryLists(incoming, existing)
      : mergeCompaniesRegistryLists(existing, incoming);
  if (merged.length === 0 && existing.length === 0) return;
  safeLocalStorageSetItem(COMPANIES_REGISTRY_KEY, JSON.stringify(merged));
  scheduleEyeVisionOperationalSave();
}

export function loadSelectedCompanyName(): string {
  const stored = safeLocalStorageGetItem(SELECTED_COMPANY_KEY);
  if (stored?.trim()) return normalizeCompanyName(stored);
  return '';
}

export function saveSelectedCompanyName(name: string): void {
  safeLocalStorageSetItem(SELECTED_COMPANY_KEY, normalizeCompanyName(name));
  scheduleEyeVisionOperationalSave();
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

  for (const slug of listManagerCacheSlugs()) {
    if (slug === 'TECHNOVA_INDUSTRIA_LTDA') continue;
    const fromExisting = loadCompaniesRegistry().find((c) => companyStorageSlug(c.name) === slug);
    const label = fromExisting?.name || slug.replace(/_/g, ' ');
    names.add(normalizeCompanyName(label));
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

  // Não grava/push lista vazia — evita apagar o Docker antes do hydrate.
  if (merged.length > 0 || existing.length > 0) {
    saveCompaniesRegistry(merged);
  }
  return merged;
}

export function resolveSelectedCompany(companies: CompanyRecord[]): string {
  const stored = loadSelectedCompanyName();
  if (stored && companies.some((c) => c.name === stored)) {
    return stored;
  }

  const real = companies.filter((c) => !isDemoTechnovaCompany(c.name));
  const fallback = real[0]?.name ?? companies[0]?.name ?? '';
  if (fallback) saveSelectedCompanyName(fallback);
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
  if (safeLocalStorageGetItem(APLICACAO_MIGRATION_FLAG)) return;

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

  safeLocalStorageSetItem(APLICACAO_MIGRATION_FLAG, '1');
}

export function migrateLegacyManagerData(targetCompany: string): void {
  if (safeLocalStorageGetItem(MANAGER_MIGRATION_FLAG)) return;

  const company = normalizeCompanyName(targetCompany);
  for (const suffix of Object.keys(LEGACY_MANAGER_KEYS) as (keyof typeof LEGACY_MANAGER_KEYS)[]) {
    const legacyKey = LEGACY_MANAGER_KEYS[suffix];
    const raw = safeLocalStorageGetItem(legacyKey);
    if (raw?.trim()) {
      const scopedKey = companyManagerStorageKey(company, suffix);
      if (!safeLocalStorageGetItem(scopedKey)) {
        safeLocalStorageSetItem(scopedKey, raw);
      }
    }
    // Chaves globais legadas (ex.: plano_contas_central) — nunca compartilhar entre empresas.
    safeLocalStorageRemoveItem(legacyKey);
  }

  safeLocalStorageSetItem(MANAGER_MIGRATION_FLAG, '1');
}

export function migrateOrphanParcelamentos(defaultCompany: string): void {
  if (safeLocalStorageGetItem(PARCELAMENTO_MIGRATION_FLAG)) return;

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
    safeLocalStorageSetItem('simulador_parcelamentos', JSON.stringify(migrated));
    scheduleEyeVisionOperationalSave();
  }

  safeLocalStorageSetItem(PARCELAMENTO_MIGRATION_FLAG, '1');
}

const TEXT_REPAIR_SUFFIXES = new Set<keyof typeof LEGACY_MANAGER_KEYS>([
  'plano',
  'extrato',
  'folha',
  'folhaRelatorio',
  'razao',
  'balancete',
]);

function repairManagerRows<T>(suffix: keyof typeof LEGACY_MANAGER_KEYS, list: T[]): T[] {
  if (!TEXT_REPAIR_SUFFIXES.has(suffix) || list.length === 0) return list;
  return repairPortugueseDeep(list);
}

function suffixFromManagerKey(key: string): keyof typeof LEGACY_MANAGER_KEYS | null {
  for (const suffix of TEXT_REPAIR_SUFFIXES) {
    if (key.endsWith(`_${suffix}`)) return suffix;
  }
  return null;
}

const managerMemoryCache = new Map<string, unknown[]>();

/** Slugs com dados em memória (hydrate Docker). */
export function listManagerCacheSlugs(): string[] {
  const slugs = new Set<string>();
  const re =
    /^contabilfacil_(.+)_(plano|extrato|folha|folhaRelatorio|razao|balancete|fiscalSped|fiscalPgdas|fiscalOcr|fiscalContasImposto|folhaContasAutomacao|honorariosLancamentos|honorariosContasAutomacao)$/;
  for (const key of managerMemoryCache.keys()) {
    const m = key.match(re);
    if (m?.[1]) slugs.add(m[1]);
  }
  return Array.from(slugs);
}
const pendingManagerWrites = new Map<string, ReturnType<typeof setTimeout>>();
const MANAGER_WRITE_DEBOUNCE_MS = 450;

export function readManagerData<T>(companyName: string, suffix: keyof typeof LEGACY_MANAGER_KEYS): T[] {
  const norm = normalizeCompanyName(companyName);
  if (!norm || norm === 'SEM EMPRESA') return [];
  const key = companyManagerStorageKey(norm, suffix);
  const cached = managerMemoryCache.get(key);
  if (cached) return cached as T[];
  try {
    const raw = safeLocalStorageGetItem(key);
    if (!raw?.trim()) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? (parsed as T[]) : [];
    const repaired = repairManagerRows(suffix, list);
    managerMemoryCache.set(key, repaired);
    return repaired;
  } catch {
    return [];
  }
}

function persistManagerKey(key: string, payload: string): void {
  // Memória + Docker + pasta — sem localStorage do navegador (quando Postgres ativo).
  safeLocalStorageSetItem(key, payload);
  scheduleEyeVisionOperationalSave();
}

/** Grava na memória e no localStorage (dispara espelho na pasta selecionada). */
export function writeManagerData<T>(
  companyName: string,
  suffix: keyof typeof LEGACY_MANAGER_KEYS,
  list: T[],
): void {
  const company = requireCompanyScope(companyName);
  const key = companyManagerStorageKey(company, suffix);
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
  const company = requireCompanyScope(companyName);
  const key = companyManagerStorageKey(company, suffix);
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
      scheduleEyeVisionOperationalSave();
    }
  }
  pendingManagerWrites.clear();
}

export function invalidateManagerDataCache(companyName?: string, suffix?: keyof typeof LEGACY_MANAGER_KEYS): void {
  flushManagerDataWrites();
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

/** Atualiza cache após hydrate Docker → memória. */
export function setManagerMemoryCacheEntry(key: string, rows: unknown[]): void {
  const list = Array.isArray(rows) ? rows : [];
  const suffix = suffixFromManagerKey(key);
  const repaired = suffix ? repairManagerRows(suffix, list) : list;
  managerMemoryCache.set(key, repaired);
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
    const raw = safeLocalStorageGetItem(oldKey);
    if (!raw?.trim()) continue;
    if (!safeLocalStorageGetItem(newKey)) {
      safeLocalStorageSetItem(newKey, raw);
    }
    safeLocalStorageRemoveItem(oldKey);
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

  scheduleEyeVisionOperationalSave();

  return true;
}

/** Remove regras de extrato, inteligência IA e demais chaves auxiliares da empresa. */
export function purgeCompanyScopedAuxiliaryData(companyName: string): void {
  const norm = normalizeCompanyName(companyName);
  if (!norm || norm === 'SEM EMPRESA') return;

  const slug = companyStorageSlug(norm);
  const extraKeys = [
    `contabilfacil_${slug}_extrato_ocr_layouts_v1`,
    `contabilfacil_${slug}_extrato_regras_contas_v2`,
    `contabilfacil_${slug}_extrato_regras_contas_v1`,
    `contabilfacil_${slug}_extrato_regras_banco_v1`,
    `contabilfacil_${slug}_ai_inteligencia_v1`,
  ];
  for (const key of extraKeys) {
    safeLocalStorageRemoveItem(key);
  }

  void import('./aiInteligenciaStorage').then(({ purgeAiInteligenciaCachesForCompany }) => {
    purgeAiInteligenciaCachesForCompany(norm);
  });
}

export function deleteManagerCompanyInStorage(name: string): boolean {
  const norm = normalizeCompanyName(name);
  if (!norm || norm === 'SEM EMPRESA') return false;

  const registry = loadCompaniesRegistry();
  if (!registry.some((c) => c.name === norm)) return false;

  for (const suffix of MANAGER_DATA_SUFFIXES) {
    const key = companyManagerStorageKey(norm, suffix);
    safeLocalStorageRemoveItem(key);
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
    safeLocalStorageSetItem('simulador_parcelamentos', JSON.stringify([]));
  } else {
    persistCanonicalList('simulador_parcelamentos', parcelamentos);
  }

  const aplicacoes = loadAplicacoesFromBrowserStorage().filter(
    (item) => normalizeCompanyName(item.sindicatoName ?? '') !== norm,
  );
  if (aplicacoes.length === 0) {
    safeLocalStorageSetItem('simulador_aplicacoes', JSON.stringify([]));
  } else {
    persistCanonicalList('simulador_aplicacoes', aplicacoes);
  }

  const nextRegistry = registry.filter((c) => c.name !== norm);
  saveCompaniesRegistry(nextRegistry, { replace: true });

  if (loadSelectedCompanyName() === norm) {
    const fallback = nextRegistry[0]?.name ?? '';
    if (fallback) saveSelectedCompanyName(fallback);
    else safeLocalStorageRemoveItem(SELECTED_COMPANY_KEY);
  }

  purgeCompanyScopedAuxiliaryData(norm);
  invalidateManagerDataCache();
  scheduleEyeVisionOperationalSave();
  void import('./eyeVisionPersistenceFlush').then(({ flushPersistenceAfterCriticalWrite }) => {
    void flushPersistenceAfterCriticalWrite();
  });
  return true;
}

/** Dev (Vite HMR): grava pendências antes do hot reload para não perder dados em memória. */
if (typeof import.meta !== 'undefined' && import.meta.hot) {
  import.meta.hot.dispose(() => {
    flushManagerDataWrites();
  });
}
