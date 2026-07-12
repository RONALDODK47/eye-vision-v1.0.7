/**
 * Restaura tokens/clientes do Gestão Contábil (Firestore cloud_access_control/config)
 * para o localStorage local após migração Firebase → Docker.
 */
import { dbClient } from '../../gestaoContabil/dbClientFallback';
import {
  COMPANY_ACCESS_TOKEN_KEY,
  INOV_OFFICE_TOKEN,
  LEGACY_DEV_OFFICE_TOKEN,
} from '../../gestaoContabil/authContextFallback';
import { getAgentApiBase } from '../../lib/agentApiBase';
import { resolveStorageBackendMode } from '../../lib/storageBackend';
import { collectOfficeTokens, readStoredCompanyAccessToken } from './eyeVisionAdmin';

const RESTORED_KEY = 'gc_firebase_cloud_access_restored_v1';
const TAB_ACCESS_KEY = 'gc_tab_access';

type GenericRecord = Record<string, unknown>;

function configLooksEmpty(config: GenericRecord | null | undefined): boolean {
  if (!config || typeof config !== 'object') return true;
  const tokens = collectOfficeTokens(config);
  const clients = config.clients && typeof config.clients === 'object' ? config.clients : {};
  return tokens.length === 0 && Object.keys(clients).length === 0;
}

function resolvePrimaryOfficeToken(config: GenericRecord): string {
  const tokens = collectOfficeTokens(config);
  if (tokens.includes(LEGACY_DEV_OFFICE_TOKEN)) return LEGACY_DEV_OFFICE_TOKEN;
  const legacy = String(config.company_access_token || '').trim();
  if (legacy) return legacy;
  return tokens[0] || '';
}

function buildConfigPatch(config: GenericRecord): GenericRecord {
  const patch: GenericRecord = {};
  for (const key of [
    'company_access_tokens',
    'company_access_token',
    'eye_vision_offices',
    'clients',
    'company_portals',
    'billing',
    'updated_at',
  ]) {
    if (config[key] !== undefined) patch[key] = config[key];
  }

  const tokenSet = new Set(collectOfficeTokens(patch));
  tokenSet.add(LEGACY_DEV_OFFICE_TOKEN);
  tokenSet.add(INOV_OFFICE_TOKEN);
  patch.company_access_tokens = Array.from(tokenSet);

  const offices =
    patch.eye_vision_offices && typeof patch.eye_vision_offices === 'object'
      ? ({ ...(patch.eye_vision_offices as GenericRecord) } as GenericRecord)
      : ({} as GenericRecord);
  if (!offices[LEGACY_DEV_OFFICE_TOKEN]) {
    offices[LEGACY_DEV_OFFICE_TOKEN] = {
      name: 'INOV / Legado Firebase',
      created_at: new Date().toISOString(),
      module_access: { manager: true, pricing: true, gestao: true },
    };
  }
  if (!offices[INOV_OFFICE_TOKEN]) {
    offices[INOV_OFFICE_TOKEN] = {
      name: 'INOV',
      created_at: new Date().toISOString(),
      module_access: { manager: true, pricing: true, gestao: true },
    };
  }
  patch.eye_vision_offices = offices;

  return patch;
}

function restoreTabAccessForEmail(config: GenericRecord, email: string): void {
  const clients =
    config.clients && typeof config.clients === 'object'
      ? (config.clients as GenericRecord)
      : {};
  const row = clients[String(email || '').trim().toLowerCase()];
  if (!row || typeof row !== 'object') return;
  const tabAccess = (row as GenericRecord).tab_access;
  if (!tabAccess || typeof tabAccess !== 'object') return;
  try {
    localStorage.setItem(TAB_ACCESS_KEY, JSON.stringify(tabAccess));
  } catch {
    /* ignore */
  }
}

export async function restoreGestaoCloudAccessFromFirebase(
  uid: string,
  opts?: { force?: boolean; email?: string },
): Promise<string | null> {
  const adminUid = String(uid || '').trim();
  if (!adminUid) return null;

  /** Migração Firebase → Docker é só dev local; Supabase usa config já persistido. */
  if (resolveStorageBackendMode() === 'supabase' && !opts?.force) {
    const currentSupabase = await dbClient.entities.CloudAccessControl.getConfig();
    const stored = readStoredCompanyAccessToken();
    return stored || resolvePrimaryOfficeToken(currentSupabase as GenericRecord) || null;
  }

  const current = await dbClient.entities.CloudAccessControl.getConfig();
  if (!opts?.force && !configLooksEmpty(current)) {
    const stored = readStoredCompanyAccessToken();
    return stored || resolvePrimaryOfficeToken(current as GenericRecord) || null;
  }

  if (!opts?.force) {
    try {
      if (localStorage.getItem(RESTORED_KEY) === '1') {
        const stored = readStoredCompanyAccessToken();
        if (stored) return stored;
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const res = await fetch(`${getAgentApiBase()}/workspace/firebase-cloud-access`);
    if (!res.ok) return null;
    const json = (await res.json()) as { ok?: boolean; config?: GenericRecord };
    const config = json.config;
    if (!config || typeof config !== 'object') return null;

    const patch = buildConfigPatch(config);
    if (Object.keys(patch).length > 0) {
      await dbClient.entities.CloudAccessControl.updateConfig({
        adminUid,
        patch,
      });
    }

    const primaryToken = resolvePrimaryOfficeToken(config);
    if (primaryToken) {
      try {
        localStorage.setItem(COMPANY_ACCESS_TOKEN_KEY, primaryToken);
        window.dispatchEvent(new CustomEvent('gc-company-token-changed'));
      } catch {
        /* ignore */
      }
    }

    const email = String(opts?.email || '').trim().toLowerCase();
    if (email) restoreTabAccessForEmail(config, email);

    try {
      localStorage.setItem(RESTORED_KEY, '1');
    } catch {
      /* ignore */
    }

    return primaryToken || readStoredCompanyAccessToken() || null;
  } catch {
    return null;
  }
}
