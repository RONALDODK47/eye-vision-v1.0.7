import { flushManagerDataWrites } from './companyWorkspace';
import { flushEyeVisionCloudPushSafe, scheduleEyeVisionCloudPush } from './eyeVisionCloudPush';
import { isEyeVisionCloudPushPaused } from './eyeVisionCloudSync';
import { scheduleEyeVisionOperationalSave } from './eyeVisionOperationalSave';
import {
  flushLocalDatabaseSave,
  isLocalFolderDbConfigured,
} from '../../lib/localFolderDatabase';

function runWhenIdle(fn: () => void, timeoutMs = 4000): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout: timeoutMs });
  } else {
    setTimeout(fn, 0);
  }
}

/** Grava localStorage pendente + pasta selecionada. Nuvem só se não estiver pausada. */
export async function flushAllEyeVisionPersistence(): Promise<void> {
  flushManagerDataWrites();
  if (isLocalFolderDbConfigured()) {
    await flushLocalDatabaseSave({ light: true, force: true });
  }
  if (!isEyeVisionCloudPushPaused()) {
    await flushEyeVisionCloudPushSafe({ force: true });
  }
}

/**
 * Após salvar layout/importar — grava memória imediata e agenda sync pesado em idle.
 */
export async function flushPersistenceAfterCriticalWrite(): Promise<void> {
  flushManagerDataWrites();
  scheduleEyeVisionOperationalSave();
  return new Promise((resolve) => {
    runWhenIdle(() => resolve(), 1200);
  });
}

const PERIODIC_FLUSH_MS = 180_000;

function schedulePersistenceFlush(): void {
  scheduleEyeVisionOperationalSave();
}

/**
 * Garante que digitações/exclusões não se perdem ao trocar aba, minimizar ou fechar o browser.
 * - beforeunload / pagehide / visibility hidden → flush imediato
 * - intervalo periódico enquanto a aba está visível (em idle — não bloqueia UI)
 */
export function registerEyeVisionAutoSaveLifecycle(): () => void {
  const onFlush = () => {
    schedulePersistenceFlush();
  };

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') onFlush();
  };

  window.addEventListener('beforeunload', onFlush);
  window.addEventListener('pagehide', onFlush);
  document.addEventListener('visibilitychange', onVisibility);

  const interval = window.setInterval(() => {
    if (document.visibilityState === 'visible') onFlush();
  }, PERIODIC_FLUSH_MS);

  return () => {
    window.removeEventListener('beforeunload', onFlush);
    window.removeEventListener('pagehide', onFlush);
    document.removeEventListener('visibilitychange', onVisibility);
    window.clearInterval(interval);
  };
}
