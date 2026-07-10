import { SIMULADOR_ALL_MANAGED_STORAGE_KEYS } from '../../lib/simuladorFullBackup';
import {
  flushLocalDatabaseSave,
  hydrateFromLocalDatabaseFolder,
  shouldAutoLoadLocalFolder,
} from '../../lib/localFolderDatabase';
import {
  isOperationalBrowserStorageBlocked,
  isOperationalStorageKey,
  isQuotaExceededError,
  reclaimLocalStorageSpace,
  safeLocalStorageSetItem,
} from '../../lib/safeLocalStorage';

const CONTABILFACIL_PREFIX = 'contabilfacil_';
const MANAGED_PREFIXES = [
  CONTABILFACIL_PREFIX,
  'extratoVision_',
  'eye_vision_',
  'eye-vision_',
  'manager_',
  'simulador_',
] as const;

/** Meta/handle da pasta — não re-dispara save (evita loop). */
const SKIP_SAVE_KEYS = new Set([
  'eye_vision_local_folder_db_v1',
]);

function isManagedStorageKey(key: string): boolean {
  if (SKIP_SAVE_KEYS.has(key)) return false;
  if ((SIMULADOR_ALL_MANAGED_STORAGE_KEYS as readonly string[]).includes(key)) return true;
  return MANAGED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

let storagePatchInstalled = false;

/**
 * Intercepta localStorage.setItem: dados operacionais vão para memória + Docker + pasta,
 * nunca para o disco do navegador (quando Postgres/Docker está ativo).
 */
function installLocalStorageFolderSync(): void {
  if (storagePatchInstalled || typeof localStorage === 'undefined') return;
  storagePatchInstalled = true;

  const origSet = localStorage.setItem.bind(localStorage);
  const origRemove = localStorage.removeItem.bind(localStorage);

  localStorage.setItem = (key: string, value: string) => {
    if (isOperationalBrowserStorageBlocked() && isOperationalStorageKey(key)) {
      // Redireciona: memória + cloud + pasta — sem gravar no navegador.
      safeLocalStorageSetItem(key, value);
      return;
    }
    try {
      origSet(key, value);
    } catch (err) {
      if (isQuotaExceededError(err)) {
        reclaimLocalStorageSpace([key]);
        try {
          origSet(key, value);
        } catch {
          console.warn(`[storage] cota cheia ao gravar ${key} — espelhando só na pasta/Docker.`);
          safeLocalStorageSetItem(key, value);
          return;
        }
      } else {
        throw err;
      }
    }
    if (isManagedStorageKey(key)) {
      void import('../logic/eyeVisionOperationalSave').then(
        ({ markOperationalStorageDirty, scheduleEyeVisionOperationalSave }) => {
          markOperationalStorageDirty();
          scheduleEyeVisionOperationalSave();
        },
      );
    }
  };

  localStorage.removeItem = (key: string) => {
    origRemove(key);
    if (isManagedStorageKey(key)) {
      void import('../logic/eyeVisionOperationalSave').then(
        ({ markOperationalStorageDirty, scheduleEyeVisionOperationalSave }) => {
          markOperationalStorageDirty();
          scheduleEyeVisionOperationalSave();
        },
      );
    }
  };
}

/**
 * Na abertura: não sobrescreve com a pasta (Postgres/MinIO são a fonte).
 * Durante uso: espelha dados → pasta (debounced) quando a pasta está configurada.
 * NÃO faz purge aqui — só depois do hydrate do Docker (senão apaga dados antes de migrar).
 */
export function registerLocalFolderDatabaseLifecycle(): () => void {
  installLocalStorageFolderSync();

  if (shouldAutoLoadLocalFolder()) {
    void hydrateFromLocalDatabaseFolder();
  }

  const onFlush = () => {
    void flushLocalDatabaseSave({ light: true, force: true });
  };

  window.addEventListener('beforeunload', onFlush);
  window.addEventListener('pagehide', onFlush);

  return () => {
    window.removeEventListener('beforeunload', onFlush);
    window.removeEventListener('pagehide', onFlush);
  };
}
