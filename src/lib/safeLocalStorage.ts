/**
 * Persistência segura: dados operacionais NÃO vão para localStorage do navegador.
 * Fonte de verdade: Docker (Postgres/MinIO) + pasta configurada (espelho).
 * O Map em memória mantém a sessão; pasta/Docker recebem via sync.
 */
import { isPostgresStorageClientEnabled } from '../gestaoContabil/dbClientPostgres';

const memoryFallback = new Map<string, string>();

/** Chaves leves permitidas no navegador (auth / meta de pasta / sync). */
const BROWSER_ALLOWED_EXACT = new Set([
  'gc_company_access_token',
  'gc_last_identifier',
  'gc_auth_session_v1',
  'gc_auth_users_v1',
  'gc_cloud_access_config',
  'gc_cloud_user_profiles',
  'eye_vision_local_folder_db_v1',
  'eye_vision_cloud_sync_meta_v1',
  'eye_vision_pg_migrated_tokens_v1',
]);

const BROWSER_ALLOWED_PREFIXES = ['gc_auth_', 'cf-autobot-'] as const;

/** Prefixo de dados de app — proibidos no localStorage quando Docker está ativo. */
const OPERATIONAL_PREFIXES = [
  'contabilfacil_',
  'simulador_',
  'extratoVision_',
  'gc_cloud_workspace_',
  'pdfLayouts',
  'plano_contas',
  'extrato_lancamentos',
  'folha_',
  'razao_',
  'balancete_',
  'fiscal_',
  'honorarios_',
  'contracts',
  'emprestimos_',
  'parcelamentos',
  'aplicacoes',
] as const;

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

/** Com Postgres/Docker: dados de app não gravam no navegador. */
export function isOperationalBrowserStorageBlocked(): boolean {
  try {
    return isPostgresStorageClientEnabled();
  } catch {
    return true;
  }
}

export function isBrowserAllowedStorageKey(key: string): boolean {
  if (BROWSER_ALLOWED_EXACT.has(key)) return true;
  return BROWSER_ALLOWED_PREFIXES.some((p) => key.startsWith(p));
}

export function isOperationalStorageKey(key: string): boolean {
  if (isBrowserAllowedStorageKey(key)) return false;
  if (key === 'pdfLayouts') return true;
  return OPERATIONAL_PREFIXES.some((p) => key.startsWith(p) || key === p);
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
        const raw = localStorage.getItem(key);
        if (raw && raw.length > HUGE) {
          freed += raw.length;
          localStorage.removeItem(key);
        }
        continue;
      }
      const raw = localStorage.getItem(key);
      if (raw && raw.length > HUGE) {
        freed += raw.length;
        localStorage.removeItem(key);
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
        const raw = localStorage.getItem(k);
        if (raw && raw.length > HUGE) toDrop.push(k);
      }
    }
    for (const k of toDrop) {
      const raw = localStorage.getItem(k);
      if (raw) freed += raw.length;
      localStorage.removeItem(k);
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
        localStorage.removeItem(k);
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

  if (isOperationalBrowserStorageBlocked() && isOperationalStorageKey(key)) {
    // Não grava no navegador — sync cloud + pasta cuidam da persistência.
    try {
      if (localStorage.getItem(key) != null) localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    scheduleOperationalPersistence(key);
    return true;
  }

  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (!isQuotaExceededError(err)) {
      console.warn(`[storage] falha ao gravar ${key}:`, err);
      return false;
    }
    reclaimLocalStorageSpace(key.includes('_ai_inteligencia') ? [] : [key]);
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (err2) {
      console.warn(
        `[storage] cota cheia — ${key} ficou em memória + pasta/Docker (${Math.round(value.length / 1024)} KB).`,
        err2,
      );
      scheduleOperationalPersistence(key);
      return false;
    }
  }
}

export function safeLocalStorageGetItem(key: string): string | null {
  // Memória tem prioridade (pode ser mais nova que LS legado).
  const mem = memoryFallback.get(key);
  if (mem != null) return mem;

  try {
    const raw = localStorage.getItem(key);
    if (raw != null) {
      memoryFallback.set(key, raw);
      // Se for operacional e Docker ativo, remove do browser após carregar na memória.
      if (isOperationalBrowserStorageBlocked() && isOperationalStorageKey(key)) {
        try {
          localStorage.removeItem(key);
        } catch {
          /* ignore */
        }
      }
      return raw;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function safeLocalStorageRemoveItem(key: string): void {
  memoryFallback.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  scheduleOperationalPersistence(key);
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
