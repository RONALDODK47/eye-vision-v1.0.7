import { useEffect, useRef } from 'react';
import { useAuth } from '../../gestaoContabil/gestaoAuth';
import { readStoredCompanyAccessToken, resolveOfficeTokenForSession } from '../logic/eyeVisionAdmin';
import { useCloudAccess } from '../../gestaoContabil/useCloudAccessFallback';
import {
  configureEyeVisionCloudSync,
  hydrateEyeVisionFromCloud,
} from '../logic/eyeVisionCloudSync';
import { ensureInovOfficeForAdmin } from '../logic/ensureInovOfficeForAdmin';
import { restoreGestaoCloudAccessFromFirebase } from '../logic/restoreGestaoCloudAccessFromFirebase';
import { migrateLocalWorkspaceToPostgresIfNeeded } from '../logic/migrateLocalToPostgres';
import { syncExtratoPastasFromServer } from '../logic/extratoPastasStorage';
import { loadCompaniesRegistry } from '../logic/companyWorkspace';
import { resolveStorageBackendMode } from '../../lib/storageBackend';
import {
  apiSyncFromSupabase,
  resetWorkspaceHealthCache,
  waitForWorkspaceStorageHealth,
} from '../../gestaoContabil/dbClientPostgres';
import { resetStorageBackendProbe } from '../../gestaoContabil/dbClient';
import { migrateFromFirebaseIfNeeded } from '../logic/migrateFromFirebase';
import { setOperationalSavePhase } from '../../lib/operationalSaveStatus';

/**
 * Sincroniza dados Eye Vision com o backend (Docker local ou Supabase na nuvem).
 */
export default function EyeVisionCloudBootstrap() {
  const { user, isAuthenticated } = useAuth();
  const { clientEntry, companyTokenOk, isAdminEmail } = useCloudAccess();
  const hydratedRef = useRef('');

  const uid = String(user?.uid || '');
  const email = String(user?.email || '').trim().toLowerCase();

  useEffect(() => {
    if (!isAuthenticated || !companyTokenOk || !uid) return;

    let cancelled = false;

    void (async () => {
      try {
        await restoreGestaoCloudAccessFromFirebase(uid, { email });
      } catch (err) {
        console.warn('[EyeVisionCloud] restore Firebase Gestão', err);
      }

      if (isAdminEmail) {
        try {
          await ensureInovOfficeForAdmin(uid);
        } catch (err) {
          console.warn('[EyeVisionCloud] ensure INOV', err);
        }
      }

      const officeToken = resolveOfficeTokenForSession(clientEntry);
      if (!officeToken) return;

      const key = `${officeToken}::${uid}`;
      if (hydratedRef.current === key) return;

      configureEyeVisionCloudSync(officeToken, uid);

      if (!readStoredCompanyAccessToken() && officeToken && import.meta.env.DEV) {
        try {
          localStorage.setItem('gc_company_access_token', officeToken);
          window.dispatchEvent(new CustomEvent('gc-company-token-changed'));
        } catch {
          /* ignore */
        }
      }

      const isCloud = resolveStorageBackendMode() === 'supabase';
      const initialWaitMs = isCloud ? 45_000 : 90_000;
      const extraPollMs = isCloud ? 30_000 : 120_000;

      let backendReady = await waitForWorkspaceStorageHealth(initialWaitMs, 1_000);
      if (cancelled) return;

      if (!backendReady) {
        setOperationalSavePhase('offline');
        const pollUntil = Date.now() + extraPollMs;
        while (!cancelled && Date.now() < pollUntil) {
          await new Promise((r) => setTimeout(r, 3_000));
          resetWorkspaceHealthCache();
          if (await waitForWorkspaceStorageHealth(8_000, 500)) {
            backendReady = true;
            break;
          }
        }
      }

      if (!backendReady) {
        console.warn(
          isCloud
            ? '[EyeVisionCloud] API Render não conectou ao Supabase — confira DATABASE_URL no Render.'
            : '[EyeVisionCloud] Backend Postgres/MinIO indisponível — use npm run dev para subir Docker e agent-api.',
        );
        setOperationalSavePhase('offline');
        return;
      }

      resetStorageBackendProbe();
      resetWorkspaceHealthCache();

      let pulled = await hydrateEyeVisionFromCloud(officeToken, uid);

      if (!pulled && resolveStorageBackendMode() === 'docker') {
        try {
          await apiSyncFromSupabase(officeToken, uid);
          resetStorageBackendProbe();
          pulled = await hydrateEyeVisionFromCloud(officeToken, uid);
        } catch (err) {
          console.warn('[EyeVisionCloud] sync Supabase→Docker', err);
        }

        if (!pulled) {
          try {
            await migrateFromFirebaseIfNeeded(officeToken);
            resetStorageBackendProbe();
            pulled = await hydrateEyeVisionFromCloud(officeToken, uid);
          } catch (err) {
            console.warn('[EyeVisionCloud] migrate Firebase→Docker', err);
          }
        }
      }

      if (!pulled) {
        try {
          await migrateLocalWorkspaceToPostgresIfNeeded(officeToken, uid, { force: true });
          resetStorageBackendProbe();
          pulled = await hydrateEyeVisionFromCloud(officeToken, uid);
        } catch (err) {
          console.warn('[EyeVisionCloud] migrate local→backend', err);
        }
      }

      const hasCompanies = loadCompaniesRegistry().length > 0;
      if (pulled || hasCompanies) {
        hydratedRef.current = key;

        for (const company of loadCompaniesRegistry()) {
          try {
            await syncExtratoPastasFromServer(company.name);
          } catch {
            /* ignore */
          }
        }

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
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, companyTokenOk, clientEntry, uid, email, isAdminEmail]);

  return null;
}
