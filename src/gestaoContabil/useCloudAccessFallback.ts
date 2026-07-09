import { useEffect, useMemo, useState } from 'react';
import { COMPANY_ACCESS_TOKEN_KEY, useAuth } from './gestaoAuth';

type GenericRecord = Record<string, unknown>;

const ADMIN_EMAILS = new Set([
  'ronaldojunior.gyn@gmail.com',
  'ronaldojunior.gyn@usuario.local',
  'ronaldojunior.gyn.emergencia@usuario.local',
]);

function readJsonStorage(key: string): GenericRecord {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as GenericRecord) : {};
  } catch {
    return {};
  }
}

function normalizeTokenList(config: GenericRecord): string[] {
  const fromList = Array.isArray(config.company_access_tokens)
    ? config.company_access_tokens
    : [];
  const fromSingle = String(config.company_access_token || '').trim();
  const set = new Set(
    fromList.map((value) => String(value || '').trim()).filter(Boolean),
  );
  if (fromSingle) set.add(fromSingle);
  return Array.from(set);
}

export function useCloudAccess() {
  const { user, isLoadingAuth } = useAuth();
  const [companyToken, setCompanyToken] = useState(() => {
    try {
      return String(localStorage.getItem(COMPANY_ACCESS_TOKEN_KEY) || '').trim();
    } catch {
      return '';
    }
  });
  const [config, setConfig] = useState<GenericRecord>(() =>
    readJsonStorage('gc_cloud_access_config'),
  );

  useEffect(() => {
    const syncFromStorage = () => {
      try {
        setCompanyToken(String(localStorage.getItem(COMPANY_ACCESS_TOKEN_KEY) || '').trim());
      } catch {
        setCompanyToken('');
      }
      setConfig(readJsonStorage('gc_cloud_access_config'));
    };

    window.addEventListener('storage', syncFromStorage);
    window.addEventListener('gc-company-token-changed', syncFromStorage);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener('gc-company-token-changed', syncFromStorage);
    };
  }, []);

  const email = String(user?.email || '').trim().toLowerCase();
  const isAdminEmail = ADMIN_EMAILS.has(email);
  const requiredCompanyTokens = useMemo(() => normalizeTokenList(config), [config]);

  const companyTokenOk =
    isAdminEmail ||
    requiredCompanyTokens.length === 0 ||
    companyToken.startsWith('CL-') ||
    requiredCompanyTokens.includes(companyToken);

  const tabAccess = useMemo(() => {
    const raw = readJsonStorage('gc_tab_access');
    const output: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(raw)) {
      output[key] = Boolean(value);
    }
    return output;
  }, [config]);

  const clientEntry = useMemo(
    () =>
      companyToken
        ? ({
            assigned_company_token: companyToken,
            email,
          } as GenericRecord)
        : null,
    [companyToken, email],
  );

  return {
    isLoading: isLoadingAuth,
    isAdminEmail,
    companyTokenOk,
    requiredCompanyTokens,
    tabAccess,
    clientEntry,
    config,
  };
}
