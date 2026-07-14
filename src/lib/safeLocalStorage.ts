/**
 * Persistência segura: dados operacionais NÃO vão para localStorage do navegador.
 * Fonte de verdade: Docker (Postgres/MinIO) + pasta configurada (espelho).
 * O Map em memória mantém a sessão; pasta/Docker recebem via sync.
 *
 * No navegador ficam só chaves leves (auth, token, meta da pasta/sync).
 */

const memoryFallback = new Map<string, string>();

/** Chaves leves permitidas no navegador (auth / meta de pasta / sync). */
const BROWSER_ALLOWED_EXACT = new Set([
  'gc_company_access_token',
  'gc_last_identifier',
  'gc_auth_session_v1',
  'gc_auth_users_v1',
  'gc_cloud_access_config',
  'gc_cloud_user_profiles',
  'eye_vision_cloud_sync_meta_v1',
  'eye_vision_pg_migrated_tokens_v1',
]);

const BROWSER_ALLOWED_PREFIXES = ['gc_auth_', 'cf-autobot-', 'contabilfacil_'] as const;

type RawBrowserStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

let rawBrowserStorage: RawBrowserStorage | null = null;

/** Liga o storage nativo (antes do patch) para auth/meta — evita recursão no patch. */
export function attachRawBrowserStorage(storage: RawBrowserStorage): void {
  rawBrowserStorage = storage;
}

function rawGetItem(key: string): string | null {
  if (rawBrowserStorage) return rawBrowserStorage.getItem(key);
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function rawSetItem(key: string, value: string): void {
  if (rawBrowserStorage) {
    rawBrowserStorage.setItem(key, value);
    return;
  }
  localStorage.setItem(key, value);
}

function rawRemoveItem(key: string): void {
  if (rawBrowserStorage) {
    rawBrowserStorage.removeItem(key);
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014 ||
    /quota/i.test(String(e.message ?? ''))
  );
}

/** Dados de app nunca gravam no disco do navegador — só memória + pasta + Docker. */
export function isOperationalBrowserStorageBlocked(): boolean {
  return true;
}

export function isBrowserAllowedStorageKey(key: string): boolean {
  if (BROWSER_ALLOWED_EXACT.has(key)) return true;
  return BROWSER_ALLOWED_PREFIXES.some((p) => key.startsWith(p));
}

/** Tudo que não é auth/meta leve é operacional (não vai para o navegador). */
export function isOperationalStorageKey(key: string): boolean {
  return !isBrowserAllowedStorageKey(key);
}

/**
 * Libera espaço removendo só payloads GIGANTES (legado).
 * Com Docker ativo, preferir purgeOperationalLocalStorage().
 */
export function reclaimLocalStorageSpace(preferKeys: string[] = []): number {
  let freed = 0;
  const HUGE = 80_000;
  try {
    for (const key of preferKeys) {
      if (key.includes('_ai_inteligencia_v1')) {
        const raw = rawGetItem(key);
        if (raw && raw.length > HUGE) {
          freed += raw.length;
          rawRemoveItem(key);
        }
        continue;
      }
      const raw = rawGetItem(key);
      if (raw && raw.length > HUGE) {
        freed += raw.length;
        rawRemoveItem(key);
      }
    }
    const toDrop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.includes('_ai_inteligencia_docs_')) {
        toDrop.push(k);
        continue;
      }
      if (k.includes('_ai_inteligencia_v1')) {
        const raw = rawGetItem(k);
        if (raw && raw.length > HUGE) toDrop.push(k);
      }
    }
    for (const k of toDrop) {
      const raw = rawGetItem(k);
      if (raw) freed += raw.length;
      rawRemoveItem(k);
    }
  } catch {
    /* ignore */
  }
  return freed;
}

/**
 * Remove do localStorage do navegador todas as chaves operacionais
 * (mantém memória + auth/meta). Chamar após hydrate do Docker.
 */
export function purgeOperationalLocalStorage(): number {
  let removed = 0;
  try {
    const toDrop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && isOperationalStorageKey(k)) toDrop.push(k);
    }
    for (const k of toDrop) {
      try {
        rawRemoveItem(k);
        removed += 1;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return removed;
}

function scheduleOperationalPersistence(key: string): void {
  if (!isOperationalStorageKey(key)) return;
  void import('../contabilfacil/logic/eyeVisionOperationalSave').then(
    ({ markOperationalStorageDirty, scheduleEyeVisionOperationalSave }) => {
      markOperationalStorageDirty();
      scheduleEyeVisionOperationalSave();
    },
  );
}

/**
 * setItem: dados operacionais → só memória (Docker + pasta).
 * Auth/meta leves → localStorage do navegador.
 */
export function safeLocalStorageSetItem(key: string, value: string): boolean {
  memoryFallback.set(key, value);

  if (isOperationalStorageKey(key)) {
    if (rawGetItem(key) != null) rawRemoveItem(key);
    scheduleOperationalPersistence(key);
    return true;
  }

  try {
    rawSetItem(key, value);
    return true;
  } catch (err) {
    console.warn(`[storage] falha ao gravar ${key}:`, err);
    return false;
  }
}

export function safeLocalStorageGetItem(key: string): string | null {
  const mem = memoryFallback.get(key);
  if (mem != null) return mem;

  if (isOperationalStorageKey(key)) {
    const raw = rawGetItem(key);
    if (raw != null) {
      memoryFallback.set(key, raw);
      rawRemoveItem(key);
      scheduleOperationalPersistence(key);
      return raw;
    }
    return null;
  }

  try {
    return rawGetItem(key);
  } catch {
    return null;
  }
}

export function safeLocalStorageRemoveItem(key: string): void {
  memoryFallback.delete(key);
  if (isOperationalStorageKey(key)) {
    if (rawGetItem(key) != null) rawRemoveItem(key);
    scheduleOperationalPersistence(key);
    return;
  }
  rawRemoveItem(key);
}

/** Todas as chaves em memória (para backup na pasta). */
export function listMemoryFallbackEntries(): Array<[string, string]> {
  return Array.from(memoryFallback.entries());
}

export function getMemoryFallbackValue(key: string): string | undefined {
  return memoryFallback.get(key);
}

/** Injeta valor só em memória (hydrate Docker → sessão, sem LS). */
export function setMemoryStorageValue(key: string, value: string): void {
  memoryFallback.set(key, value);
}
