/** Grava JSON no localStorage e agenda sync na nuvem (Eye Vision). */
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from './safeLocalStorage';

export function readPersistedLocalStorageJson<T>(key: string, fallback: T): T {
  try {
    const raw = safeLocalStorageGetItem(key);
    if (!raw?.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writePersistedLocalStorageJson(key: string, value: unknown): void {
  const ok = safeLocalStorageSetItem(key, JSON.stringify(value));
  if (!ok) {
    console.warn(`[storage] ${key} não coube no localStorage — mantido em memória / pasta.`);
  }
  void import('../contabilfacil/logic/eyeVisionCloudPush').then(({ scheduleEyeVisionCloudPush }) => {
    scheduleEyeVisionCloudPush();
  });
  // Espelha na pasta (e acende “Salvando” no header).
  void import('./localFolderDatabase').then(({ scheduleLocalDatabaseSave }) => {
    scheduleLocalDatabaseSave(600);
  });
}
