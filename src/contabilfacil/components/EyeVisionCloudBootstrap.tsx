import { useEffect, useRef } from 'react';
// @ts-expect-error módulo JSX da gestão contábil
import { useAuth } from '../../gestaoContabil/gestaoAuth';
import { readStoredCompanyAccessToken, resolveUserOfficeToken } from '../logic/eyeVisionAdmin';
import { useCloudAccess } from '../../gestaoContabil/useCloudAccessFallback';
import {
  configureEyeVisionCloudSync,
  hydrateEyeVisionFromCloud,
} from '../logic/eyeVisionCloudSync';
import { migrateLocalWorkspaceToPostgresIfNeeded } from '../logic/migrateLocalToPostgres';
import { syncExtratoPastasFromServer } from '../logic/extratoPastasStorage';
import { loadCompaniesRegistry } from '../logic/companyWorkspace';
import { hydrateFromLocalDatabaseFolder } from '../../lib/localFolderDatabase';

/**
 * Sincroniza dados Eye Vision com o backend (PostgreSQL/MinIO por office_token).
 * Hidrata ao login; envia alterações com debounce.
 * A pasta local (CONFIGURAR/SALVAR) é espelho paralelo — não pausa este sync.
 */
export default function EyeVisionCloudBootstrap() {
  const { user, isAuthenticated } = useAuth();
  const { clientEntry, companyTokenOk } = useCloudAccess();
  const hydratedRef = useRef('');

  const officeToken = resolveUserOfficeToken(clientEntry) || readStoredCompanyAccessToken();
  const uid = String(user?.uid || '');

  useEffect(() => {
    if (!isAuthenticated || !companyTokenOk || !officeToken || !uid) return;

    const key = `${officeToken}::${uid}`;
    if (hydratedRef.current === key) return;
    hydratedRef.current = key;

    configureEyeVisionCloudSync(officeToken, uid);
    void (async () => {
      // 1) Puxa Docker → memória (fonte de verdade).
      let pulled = await hydrateEyeVisionFromCloud(officeToken, uid);

      // 2) Se Docker ainda vazio, tenta pasta local → migrate → pull de novo.
      if (!pulled) {
        try {
          await hydrateFromLocalDatabaseFolder();
        } catch {
          /* ignore */
        }
        try {
          await migrateLocalWorkspaceToPostgresIfNeeded(officeToken, uid, { force: true });
          pulled = await hydrateEyeVisionFromCloud(officeToken, uid);
        } catch (err) {
          console.warn('[EyeVisionCloud] migrate local→postgres', err);
        }
      }

      for (const company of loadCompaniesRegistry()) {
        try {
          await syncExtratoPastasFromServer(company.name);
        } catch {
          /* ignore */
        }
      }

      // 3) Só limpa o navegador DEPOIS de hydrate ok (dados já em memória + Docker).
      if (pulled) {
        try {
          const { purgeOperationalLocalStorage } = await import('../../lib/safeLocalStorage');
          purgeOperationalLocalStorage();
        } catch {
          /* ignore */
        }
        try {
          const { markOperationalStorageDirty, scheduleEyeVisionOperationalSave } = await import(
            '../logic/eyeVisionOperationalSave'
          );
          markOperationalStorageDirty();
          scheduleEyeVisionOperationalSave();
        } catch {
          /* ignore */
        }
      }
    })();
  }, [isAuthenticated, companyTokenOk, officeToken, uid]);

  return null;
}
