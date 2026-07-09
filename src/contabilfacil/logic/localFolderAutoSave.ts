import { SIMULADOR_ALL_MANAGED_STORAGE_KEYS } from '../../lib/simuladorFullBackup';
import {
  flushLocalDatabaseSave,
  hydrateFromLocalDatabaseFolder,
  scheduleLocalDatabaseSave,
  shouldAutoLoadLocalFolder,
} from '../../lib/localFolderDatabase';
import { isQuotaExceededError, reclaimLocalStorageSpace } from '../../lib/safeLocalStorage';

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

function installLocalStorageFolderSync(): void {
  if (storagePatchInstalled || typeof localStorage === 'undefined') return;
  storagePatchInstalled = true;

  const origSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key: string, value: string) => {
    try {
      origSet(key, value);
    } catch (err) {
      if (isQuotaExceededError(err)) {
        reclaimLocalStorageSpace([key]);
        try {
          origSet(key, value);
        } catch {
          // Não derruba o app — dados ficam na pasta / memória via safe helpers
          console.warn(`[storage] cota cheia ao gravar ${key} — espelhando só na pasta.`);
          if (isManagedStorageKey(key)) scheduleLocalDatabaseSave(200);
          return;
        }
      } else {
        throw err;
      }
    }
    if (isManagedStorageKey(key)) scheduleLocalDatabaseSave();
  };

  const origRemove = localStorage.removeItem.bind(localStorage);
  localStorage.removeItem = (key: string) => {
    origRemove(key);
    if (isManagedStorageKey(key)) scheduleLocalDatabaseSave();
  };
}

/**
 * Na abertura: carrega JSON da pasta só após o primeiro Salvar.
 * Durante uso: espelha localStorage → pasta (debounced) quando banco local ativo.
 */
export function registerLocalFolderDatabaseLifecycle(): () => void {
  installLocalStorageFolderSync();

  if (shouldAutoLoadLocalFolder()) {
    void hydrateFromLocalDatabaseFolder();
  }

  const onFlush = () => {
    void flushLocalDatabaseSave();
  };

  window.addEventListener('beforeunload', onFlush);
  window.addEventListener('pagehide', onFlush);

  return () => {
    window.removeEventListener('beforeunload', onFlush);
    window.removeEventListener('pagehide', onFlush);
  };
}
