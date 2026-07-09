import { flushManagerDataWrites } from './companyWorkspace';
import { flushEyeVisionCloudPushSafe } from './eyeVisionCloudPush';
import { isEyeVisionCloudPushPaused } from './eyeVisionCloudSync';
import {
  flushLocalDatabaseSave,
  isLocalFolderDbConfigured,
} from '../../lib/localFolderDatabase';

/** Grava localStorage pendente + pasta selecionada. Nuvem só se não estiver pausada. */
export async function flushAllEyeVisionPersistence(): Promise<void> {
  flushManagerDataWrites();
  if (isLocalFolderDbConfigured()) {
    await flushLocalDatabaseSave();
  }
  if (!isEyeVisionCloudPushPaused()) {
    await flushEyeVisionCloudPushSafe();
  }
}

/** Após importações (plano, extrato, regras): força disco na pasta agora. */
export async function flushPersistenceAfterCriticalWrite(): Promise<void> {
  flushManagerDataWrites();
  if (isLocalFolderDbConfigured()) {
    await flushLocalDatabaseSave();
  }
}

const PERIODIC_FLUSH_MS = 120_000;

function schedulePersistenceFlush(): void {
  const run = () => {
    void flushAllEyeVisionPersistence();
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 5000 });
  } else {
    setTimeout(run, 0);
  }
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
