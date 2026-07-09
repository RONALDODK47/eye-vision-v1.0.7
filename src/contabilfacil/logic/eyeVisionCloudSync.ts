import { dbClient } from '../../gestaoContabil/dbClientFallback';
import { collectSimuladorFullBackup, clearEyeVisionOperationalLocalStorage } from '../../lib/simuladorFullBackup';
import {
  COMPANIES_REGISTRY_KEY,
  MANAGER_DATA_SUFFIXES,
  SELECTED_COMPANY_KEY,
  companyManagerStorageKey,
  companyStorageSlug,
  invalidateManagerDataCache,
  loadCompaniesRegistry,
  type CompanyRecord,
} from './companyWorkspace';
import { PRICING_STORAGE_KEY } from './pricingStorage';
import {
  PRICING_COMPANIES_REGISTRY_KEY,
  PRICING_SELECTED_COMPANY_KEY,
  loadPricingCompaniesRegistry,
  loadPricingSelectedCompanyName,
} from './pricingCompanyWorkspace';
import { readStoredCompanyAccessToken } from './eyeVisionAdmin';
import { registerEyeVisionCloudPushHandlers } from './eyeVisionCloudPush';
import { reportAppFailure } from '../agent/browserConsoleBridge';
import { restoreAiSettingsFromCloudStorage } from '../ai/aiCloudPersist';
import { isLocalFolderDbActivated } from '../../lib/localFolderDatabase';

const SYNC_META_KEY = 'eye_vision_cloud_sync_meta_v1';
const PUSH_DEBOUNCE_MS = 20_000;
const QUOTA_PAUSE_MS = 60 * 60 * 1000;

export const EYE_VISION_CLOUD_HYDRATED_EVENT = 'contabilfacil:data-hydrated';

type SyncMeta = {
  officeToken?: string;
  lastPullAt?: string;
  lastPushAt?: string;
  cloudUpdatedAt?: string;
  cloudPushPausedUntil?: string;
  lastOfficePushHash?: string;
  lastManagerPushHashes?: Record<string, string>;
};

type OfficeCloudPayload = {
  companies_registry?: CompanyRecord[];
  selected_company?: string;
  pricing_companies_registry?: CompanyRecord[];
  pricing_selected_company?: string;
  simulador_contracts?: unknown[];
  simulador_parcelamentos?: unknown[];
  simulador_aplicacoes?: unknown[];
  simulador_precificacao?: unknown[];
  extra_storage?: Record<string, unknown>;
};

type ManagerCloudPayload = {
  company_slug?: string;
  company_name?: string;
  data?: Partial<Record<(typeof MANAGER_DATA_SUFFIXES)[number], unknown[]>>;
};

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushInFlight = false;
let pendingPush = false;
let activeOfficeToken = '';
let activeUid = '';
let cloudPushPausedUntil = 0;
let quotaNoticeShown = false;

export function isFirestoreQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /resource-exhausted|quota limit exceeded|quota exceeded for quota metric|free daily (?:read|write) units/i.test(
    msg,
  );
}

function restoreCloudPushPauseFromMeta(): void {
  const until = readSyncMeta().cloudPushPausedUntil;
  if (!until) return;
  const ms = new Date(until).getTime();
  if (Number.isFinite(ms) && ms > Date.now()) {
    cloudPushPausedUntil = ms;
  }
}

function pauseCloudPushAfterQuotaError(): void {
  cloudPushPausedUntil = Date.now() + QUOTA_PAUSE_MS;
  writeSyncMeta({ cloudPushPausedUntil: new Date(cloudPushPausedUntil).toISOString() });
}

export function isEyeVisionCloudPushPaused(): boolean {
  if (cloudPushPausedUntil > Date.now()) return true;
  restoreCloudPushPauseFromMeta();
  return cloudPushPausedUntil > Date.now();
}

function stablePayloadHash(payload: unknown): string {
  try {
    const raw = JSON.stringify(payload);
    let hash = 0;
    for (let i = 0; i < raw.length; i += 1) {
      hash = (hash * 31 + raw.charCodeAt(i)) | 0;
    }
    return String(hash);
  } catch {
    return '';
  }
}

function notifyQuotaPausedOnce(): void {
  if (quotaNoticeShown) return;
  quotaNoticeShown = true;
  reportAppFailure(
    'Sincronização cloud pausada: cota diária do Firestore esgotada. Seus dados continuam salvos no navegador.',
    {
      source: 'eye-vision-cloud-quota',
      kind: 'warn',
      context: { module: 'system', moduleLabel: 'Sincronização cloud' },
    },
  );
}

function readSyncMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (!raw?.trim()) return {};
    return JSON.parse(raw) as SyncMeta;
  } catch {
    return {};
  }
}

function writeSyncMeta(patch: Partial<SyncMeta>): void {
  const next = { ...readSyncMeta(), ...patch };
  localStorage.setItem(SYNC_META_KEY, JSON.stringify(next));
}

function parseStorageJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw?.trim()) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeStorageJson(key: string, value: unknown): void {
  if (value === undefined) return;
  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
}

function listLocalManagerSlugs(): string[] {
  const slugs = new Set<string>();
  const prefix = 'contabilfacil_';
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const match = rest.match(/^(.+)_(plano|extrato|folha|folhaRelatorio|razao|balancete|fiscalSped|fiscalPgdas|fiscalContasImposto|folhaContasAutomacao|honorariosLancamentos|honorariosContasAutomacao)$/);
    if (match?.[1]) slugs.add(match[1]);
  }
  for (const company of loadCompaniesRegistry()) {
    slugs.add(companyStorageSlug(company.name));
  }
  return Array.from(slugs);
}

const OFFICE_EXPLICIT_STORAGE_KEYS = new Set([
  COMPANIES_REGISTRY_KEY,
  SELECTED_COMPANY_KEY,
  PRICING_COMPANIES_REGISTRY_KEY,
  PRICING_SELECTED_COMPANY_KEY,
  'simulador_contracts',
  'simulador_parcelamentos',
  'simulador_aplicacoes',
  PRICING_STORAGE_KEY,
]);

/** Chaves contabilfacil_{slug}_{suffix} vão para eye_vision_manager, não extra_storage. */
export function isContabilfacilManagerDataKey(key: string): boolean {
  if (!key.startsWith('contabilfacil_')) return false;
  const rest = key.slice('contabilfacil_'.length);
  return MANAGER_DATA_SUFFIXES.some((suffix) => rest.endsWith(`_${suffix}`));
}

export function collectLocalOfficePayload(): OfficeCloudPayload {
  const backup = collectSimuladorFullBackup();
  const storage = backup.storage;
  const extra: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(storage)) {
    if (OFFICE_EXPLICIT_STORAGE_KEYS.has(key)) continue;
    if (isContabilfacilManagerDataKey(key)) continue;
    extra[key] = value;
  }

  return {
    companies_registry: loadCompaniesRegistry(),
    selected_company: localStorage.getItem(SELECTED_COMPANY_KEY) || '',
    pricing_companies_registry: loadPricingCompaniesRegistry(),
    pricing_selected_company: loadPricingSelectedCompanyName(),
    simulador_contracts: (storage.simulador_contracts as unknown[]) ?? [],
    simulador_parcelamentos: (storage.simulador_parcelamentos as unknown[]) ?? [],
    simulador_aplicacoes: (storage.simulador_aplicacoes as unknown[]) ?? [],
    simulador_precificacao: (storage[PRICING_STORAGE_KEY] as unknown[]) ?? [],
    extra_storage: extra,
  };
}

export function collectLocalManagerPayload(companySlug: string, companyName?: string): ManagerCloudPayload {
  const slug = companySlug.trim();
  const data: Partial<Record<(typeof MANAGER_DATA_SUFFIXES)[number], unknown[]>> = {};
  let resolvedName = companyName?.trim() || '';

  for (const suffix of MANAGER_DATA_SUFFIXES) {
    const key = `contabilfacil_${slug}_${suffix}`;
    const parsed = parseStorageJson(key);
    if (Array.isArray(parsed) && parsed.length > 0) {
      data[suffix] = parsed;
    }
  }

  if (!resolvedName) {
    const fromRegistry = loadCompaniesRegistry().find((c) => companyStorageSlug(c.name) === slug);
    resolvedName = fromRegistry?.name || slug.replace(/_/g, ' ');
  }

  return {
    company_slug: slug,
    company_name: resolvedName,
    data,
  };
}

function applyOfficePayload(payload: OfficeCloudPayload): void {
  if (Array.isArray(payload.companies_registry)) {
    writeStorageJson(COMPANIES_REGISTRY_KEY, payload.companies_registry);
  }
  if (typeof payload.selected_company === 'string' && payload.selected_company.trim()) {
    localStorage.setItem(SELECTED_COMPANY_KEY, payload.selected_company.trim());
  }
  if (Array.isArray(payload.pricing_companies_registry)) {
    writeStorageJson(PRICING_COMPANIES_REGISTRY_KEY, payload.pricing_companies_registry);
  }
  if (typeof payload.pricing_selected_company === 'string' && payload.pricing_selected_company.trim()) {
    localStorage.setItem(PRICING_SELECTED_COMPANY_KEY, payload.pricing_selected_company.trim());
  }
  if (Array.isArray(payload.simulador_contracts)) {
    writeStorageJson('simulador_contracts', payload.simulador_contracts);
  }
  if (Array.isArray(payload.simulador_parcelamentos)) {
    writeStorageJson('simulador_parcelamentos', payload.simulador_parcelamentos);
  }
  if (Array.isArray(payload.simulador_aplicacoes)) {
    writeStorageJson('simulador_aplicacoes', payload.simulador_aplicacoes);
  }
  if (Array.isArray(payload.simulador_precificacao)) {
    writeStorageJson(PRICING_STORAGE_KEY, payload.simulador_precificacao);
  }
  if (payload.extra_storage && typeof payload.extra_storage === 'object') {
    for (const [key, value] of Object.entries(payload.extra_storage)) {
      writeStorageJson(key, value);
    }
  }
}

function applyManagerPayload(payload: ManagerCloudPayload): void {
  const slug = String(payload.company_slug || '').trim();
  const companyName = String(payload.company_name || '').trim();
  if (!slug || !payload.data || typeof payload.data !== 'object') return;

  for (const suffix of MANAGER_DATA_SUFFIXES) {
    const rows = payload.data[suffix];
    if (!Array.isArray(rows)) continue;
    const key = companyName
      ? companyManagerStorageKey(companyName, suffix)
      : `contabilfacil_${slug}_${suffix}`;
    writeStorageJson(key, rows);
  }
}

function localHasOperationalData(): boolean {
  const office = collectLocalOfficePayload();
  if ((office.companies_registry?.length ?? 0) > 0) return true;
  if ((office.simulador_contracts?.length ?? 0) > 0) return true;
  if ((office.simulador_parcelamentos?.length ?? 0) > 0) return true;
  if ((office.simulador_aplicacoes?.length ?? 0) > 0) return true;
  if ((office.simulador_precificacao?.length ?? 0) > 0) return true;
  return listLocalManagerSlugs().some((slug) => {
    const payload = collectLocalManagerPayload(slug);
    return payload.data && Object.keys(payload.data).length > 0;
  });
}

function dispatchHydrated(): void {
  invalidateManagerDataCache();
  window.dispatchEvent(new CustomEvent(EYE_VISION_CLOUD_HYDRATED_EVENT));
}

export function configureEyeVisionCloudSync(officeToken: string, uid: string): void {
  activeOfficeToken = String(officeToken || '').trim();
  activeUid = String(uid || '').trim();
  restoreCloudPushPauseFromMeta();
  registerEyeVisionCloudPushHandlers({
    schedule: scheduleEyeVisionCloudPushInternal,
    flush: flushEyeVisionCloudPush,
  });
}

function scheduleEyeVisionCloudPushInternal(): void {
  if (!activeOfficeToken || !activeUid) return;
  if (isLocalFolderDbActivated()) return;
  if (isEyeVisionCloudPushPaused()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void flushEyeVisionCloudPush();
  }, PUSH_DEBOUNCE_MS);
}

export function scheduleEyeVisionCloudPush(): void {
  scheduleEyeVisionCloudPushInternal();
}

export async function flushEyeVisionCloudPush(): Promise<void> {
  if (!activeOfficeToken || !activeUid) return;
  if (isLocalFolderDbActivated()) return;
  if (isEyeVisionCloudPushPaused()) return;
  if (pushInFlight) {
    pendingPush = true;
    return;
  }

  pushInFlight = true;
  try {
    const meta = readSyncMeta();
    const officePayload = collectLocalOfficePayload();
    const officeHash = stablePayloadHash(officePayload);
    const managerHashes = { ...(meta.lastManagerPushHashes ?? {}) };
    let pushedAnything = false;

    if (officeHash && officeHash !== meta.lastOfficePushHash) {
      const result = await dbClient.entities.EyeVisionWorkspace.setOffice(
        activeOfficeToken,
        officePayload,
        activeUid,
      );
      writeSyncMeta({
        lastOfficePushHash: officeHash,
        cloudUpdatedAt: result.updated_at,
      });
      pushedAnything = true;
    }

    const slugs = listLocalManagerSlugs();
    for (const slug of slugs) {
      const managerPayload = collectLocalManagerPayload(slug);
      if (!managerPayload.data || Object.keys(managerPayload.data).length === 0) continue;

      const managerHash = stablePayloadHash(managerPayload);
      if (managerHash && managerHash === managerHashes[slug]) continue;

      await dbClient.entities.EyeVisionWorkspace.setManager(
        activeOfficeToken,
        slug,
        managerPayload,
        activeUid,
      );
      managerHashes[slug] = managerHash;
      pushedAnything = true;

      /** Cede a thread entre empresas grandes — evita “página não responde”. */
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }

    if (pushedAnything) {
      writeSyncMeta({
        officeToken: activeOfficeToken,
        lastPushAt: new Date().toISOString(),
        lastManagerPushHashes: managerHashes,
      });
    }
  } catch (err) {
    if (isFirestoreQuotaError(err)) {
      pauseCloudPushAfterQuotaError();
      notifyQuotaPausedOnce();
      pendingPush = false;
      return;
    }
    reportAppFailure('[EyeVisionCloud] falha ao enviar dados', {
      source: 'eye-vision-cloud-push',
      cause: err,
      context: { module: 'system', moduleLabel: 'Sincronização cloud' },
    });
  } finally {
    pushInFlight = false;
    if (pendingPush && !isEyeVisionCloudPushPaused()) {
      pendingPush = false;
      scheduleEyeVisionCloudPush();
    } else {
      pendingPush = false;
    }
  }
}

export async function hydrateEyeVisionFromCloud(officeToken: string, uid: string): Promise<boolean> {
  const token = String(officeToken || readStoredCompanyAccessToken() || '').trim();
  if (!token || !uid) return false;

  configureEyeVisionCloudSync(token, uid);

  if (isLocalFolderDbActivated()) {
    dispatchHydrated();
    return false;
  }

  try {
    const meta = readSyncMeta();
    const tokenChanged = Boolean(meta.officeToken && meta.officeToken !== token);

    if (tokenChanged) {
      clearEyeVisionOperationalLocalStorage();
      invalidateManagerDataCache();
      writeSyncMeta({
        officeToken: token,
        lastPullAt: '',
        lastPushAt: '',
        cloudUpdatedAt: '',
        lastOfficePushHash: '',
        lastManagerPushHashes: {},
        cloudPushPausedUntil: '',
      });
      cloudPushPausedUntil = 0;
      quotaNoticeShown = false;
    }

    const cloudOffice = await dbClient.entities.EyeVisionWorkspace.getOffice(token);
    const cloudManagers = await dbClient.entities.EyeVisionWorkspace.listManagerByOffice(token);
    const cloudUpdatedAt = String(cloudOffice?.updated_at || '');
    const localHasData = localHasOperationalData();
    const cloudHasData =
      cloudOffice != null &&
      (Array.isArray(cloudOffice.companies_registry) ||
        Array.isArray(cloudOffice.simulador_contracts) ||
        Array.isArray(cloudOffice.simulador_precificacao) ||
        cloudManagers.length > 0);

    if (!cloudHasData && localHasData && !tokenChanged) {
      await flushEyeVisionCloudPush();
      await restoreAiSettingsFromCloudStorage();
      dispatchHydrated();
      return true;
    }

    if (!cloudHasData) {
      dispatchHydrated();
      return false;
    }

    const shouldPull =
      tokenChanged ||
      !localHasData ||
      !meta.lastPullAt ||
      (cloudUpdatedAt && cloudUpdatedAt > String(meta.cloudUpdatedAt || ''));

    if (!shouldPull) {
      if (localHasData && meta.officeToken === token && !isEyeVisionCloudPushPaused()) {
        scheduleEyeVisionCloudPush();
      }
      dispatchHydrated();
      return false;
    }

    applyOfficePayload(cloudOffice as OfficeCloudPayload);
    for (const row of cloudManagers) {
      applyManagerPayload(row as ManagerCloudPayload);
    }

    await restoreAiSettingsFromCloudStorage();

    writeSyncMeta({
      officeToken: token,
      lastPullAt: new Date().toISOString(),
      cloudUpdatedAt: cloudUpdatedAt || new Date().toISOString(),
    });

    dispatchHydrated();
    return true;
  } catch (err) {
    if (isFirestoreQuotaError(err)) {
      pauseCloudPushAfterQuotaError();
      notifyQuotaPausedOnce();
      dispatchHydrated();
      return false;
    }
    reportAppFailure('[EyeVisionCloud] falha ao carregar dados', {
      source: 'eye-vision-cloud-hydrate',
      cause: err,
      context: { module: 'system', moduleLabel: 'Sincronização cloud' },
    });
    dispatchHydrated();
    return false;
  }
}
