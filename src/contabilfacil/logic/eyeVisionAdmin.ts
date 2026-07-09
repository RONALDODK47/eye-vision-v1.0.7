import type { ActiveTab } from '../types';

export type EyeVisionModuleKey = 'manager' | 'pricing';

export interface EyeVisionModuleAccess {
  manager: boolean;
  pricing: boolean;
}

export interface EyeVisionOfficeRecord {
  name: string;
  created_at: string;
  module_access?: EyeVisionModuleAccess;
}

export type EyeVisionOfficesMap = Record<string, EyeVisionOfficeRecord>;

export const EYE_VISION_MODULE_LABELS: Record<EyeVisionModuleKey, string> = {
  manager: 'Gerencial',
  pricing: 'Precificação',
};

export const DEFAULT_EYE_VISION_MODULE_ACCESS: EyeVisionModuleAccess = {
  manager: true,
  pricing: true,
};

export function normalizeEyeVisionModuleAccess(raw: unknown): EyeVisionModuleAccess {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    manager:
      'manager' in src ? Boolean(src.manager) : DEFAULT_EYE_VISION_MODULE_ACCESS.manager,
    pricing:
      'pricing' in src ? Boolean(src.pricing) : DEFAULT_EYE_VISION_MODULE_ACCESS.pricing,
  };
}

/** Permissão efetiva: empresa (obrigatório) ∩ utilizador (opcional, só restringe). */
export function resolveEffectiveModuleAccess(
  officeAccess: EyeVisionModuleAccess,
  userAccess?: EyeVisionModuleAccess | null,
): EyeVisionModuleAccess {
  if (!userAccess) return officeAccess;
  return {
    manager: officeAccess.manager && userAccess.manager,
    pricing: officeAccess.pricing && userAccess.pricing,
  };
}

export function getOfficeModuleAccess(
  offices: EyeVisionOfficesMap,
  token: string,
): EyeVisionModuleAccess {
  const tok = String(token || '').trim();
  if (!tok) return DEFAULT_EYE_VISION_MODULE_ACCESS;
  return normalizeEyeVisionModuleAccess(offices[tok]?.module_access);
}

export function canAccessEyeVisionModule(
  access: EyeVisionModuleAccess,
  tab: ActiveTab,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  if (tab === 'manager') {
    return access.manager;
  }
  if (tab === 'pricing') return access.pricing;
  if (tab === 'admin') return isAdmin;
  return true;
}

export function parseEyeVisionOffices(raw: unknown): EyeVisionOfficesMap {
  if (!raw || typeof raw !== 'object') return {};
  const out: EyeVisionOfficesMap = {};
  for (const [token, row] of Object.entries(raw as Record<string, unknown>)) {
    const tok = String(token || '').trim();
    if (!tok) continue;
    const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
    const name = 'name' in record ? String(record.name || '').trim() : '';
    const created_at = 'created_at' in record ? String(record.created_at || '') : '';
    out[tok] = {
      name: name || tok,
      created_at: created_at || new Date(0).toISOString(),
      module_access: normalizeEyeVisionModuleAccess(record.module_access),
    };
  }
  return out;
}

export function collectOfficeTokens(config: {
  company_access_tokens?: unknown;
  company_access_token?: unknown;
}): string[] {
  const fromArr = Array.isArray(config.company_access_tokens)
    ? config.company_access_tokens.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  const legacy = String(config.company_access_token || '').trim();
  return Array.from(new Set(legacy ? [...fromArr, legacy] : fromArr));
}

export interface EyeVisionOfficeView {
  token: string;
  name: string;
  created_at: string;
  moduleAccess: EyeVisionModuleAccess;
}

export function buildOfficeViews(
  config: {
    company_access_tokens?: unknown;
    company_access_token?: unknown;
    eye_vision_offices?: unknown;
  },
  tokenNameFallback?: Map<string, string>,
): EyeVisionOfficeView[] {
  const offices = parseEyeVisionOffices(config.eye_vision_offices);
  const tokens = collectOfficeTokens(config);
  return tokens
    .map((token) => {
      const meta = offices[token];
      const fallback = tokenNameFallback?.get(token);
      return {
        token,
        name: meta?.name || fallback || token,
        created_at: meta?.created_at || '',
        moduleAccess: getOfficeModuleAccess(offices, token),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

export interface EyeVisionStaffUser {
  email: string;
  displayName: string;
  assignedToken: string;
  isActive: boolean;
  moduleAccess: EyeVisionModuleAccess;
  effectiveModuleAccess: EyeVisionModuleAccess;
}

export function isInternalStaffClient(entry: Record<string, unknown> | null | undefined): boolean {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.is_deleted) return false;
  return String(entry.account_type || 'user').toLowerCase() !== 'client';
}

export function staffDisplayName(entry: Record<string, unknown>): string {
  return (
    String(entry.client_display_name || '').trim() ||
    String(entry.display_name || '').trim() ||
    String(entry.gc_login_username || '').trim() ||
    String(entry.email || '').trim()
  );
}

export function readStoredCompanyAccessToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return String(localStorage.getItem('gc_company_access_token') || '').trim();
  } catch {
    return '';
  }
}

export function resolveUserOfficeToken(
  clientEntry: { assigned_company_token?: unknown } | null | undefined,
): string {
  const fromClient = String(clientEntry?.assigned_company_token || '').trim();
  if (fromClient) return fromClient;
  return readStoredCompanyAccessToken();
}
