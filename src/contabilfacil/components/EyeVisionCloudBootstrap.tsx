import { useEffect, useRef } from 'react';
// @ts-expect-error módulo JSX da gestão contábil
import { useAuth } from '../../gestaoContabil/gestaoAuth';
import { readStoredCompanyAccessToken, resolveUserOfficeToken } from '../logic/eyeVisionAdmin';
import { useCloudAccess } from '../../gestaoContabil/useCloudAccessFallback';
import { isLocalFolderDbActivated } from '../../lib/localFolderDatabase';
import {
  configureEyeVisionCloudSync,
  hydrateEyeVisionFromCloud,
} from '../logic/eyeVisionCloudSync';

/**
 * Sincroniza dados Eye Vision com Firestore (mesmo projeto da Gestão Contábil).
 * Hidrata ao login; envia alterações com debounce.
 */
export default function EyeVisionCloudBootstrap() {
  const { user, isAuthenticated } = useAuth();
  const { clientEntry, companyTokenOk } = useCloudAccess();
  const hydratedRef = useRef('');

  const officeToken = resolveUserOfficeToken(clientEntry) || readStoredCompanyAccessToken();
  const uid = String(user?.uid || '');

  useEffect(() => {
    if (!isAuthenticated || !companyTokenOk || !officeToken || !uid) return;
    if (isLocalFolderDbActivated()) return;

    const key = `${officeToken}::${uid}`;
    if (hydratedRef.current === key) return;
    hydratedRef.current = key;

    configureEyeVisionCloudSync(officeToken, uid);
    void hydrateEyeVisionFromCloud(officeToken, uid);
  }, [isAuthenticated, companyTokenOk, officeToken, uid]);

  return null;
}
