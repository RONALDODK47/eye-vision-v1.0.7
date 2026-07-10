import { useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  COMPANY_ACCESS_TOKEN_KEY,
  useAuth,
  EMPRESA_PORTAL_GUEST_KEY,
  EMPRESA_PORTAL_COMPANY_ID_KEY,
  EMPRESA_PORTAL_INVITE_TOKEN_KEY,
  EMPRESA_PORTAL_SLUG_KEY,
} from "@/lib/AuthContext";
import { dbClient } from "@/api/dbClient";
import { resolveTabEditAccessForEntry, TAB_EDIT_PAGE_KEYS } from "@/lib/tabEditAccess";
import { billingIsPaidActive, findBillingClientEntry } from "@/lib/cloudBilling";
import { staffAutoProvisionDefaults } from "@/lib/defaultStaffAccess";
import { CLOUD_ADMIN_EMAIL } from "@/lib/cloudAccessConstants";
import {
  readStoredCompanyAccessToken,
  resolveActiveOfficeToken,
  resolveOfficeDisplayName,
} from "@/lib/officeIdentity";
import {
  buildInovOfficeUpsertPatch,
  INOV_COMPANY_ID,
  INOV_OFFICE_EMAIL,
  INOV_OFFICE_TOKEN,
  isInovOfficeClient,
  mergeInovOfficeSeed,
} from "@/lib/inovOfficeSeed";

export { CLOUD_ADMIN_EMAIL };
const CLOUD_OWNER_UID = String(import.meta.env.VITE_INOV_CALENDAR_OWNER_UID || "").trim();
const CLOUD_ADMIN_FALLBACK_IDENTIFIERS = new Set([
  CLOUD_ADMIN_EMAIL,
  "ronaldojunior.gyn@usuario.local",
  "ronaldojunior.gyn.emergencia@usuario.local",
]);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function readEmpresaPortalInviteFromBrowser() {
  if (typeof window === "undefined")
    return { guest: false, companyId: "", inviteToken: "", publicSlug: "" };
  try {
    return {
      guest: localStorage.getItem(EMPRESA_PORTAL_GUEST_KEY) === "1",
      companyId: String(localStorage.getItem(EMPRESA_PORTAL_COMPANY_ID_KEY) || "").trim(),
      inviteToken: String(localStorage.getItem(EMPRESA_PORTAL_INVITE_TOKEN_KEY) || "").trim(),
      publicSlug: String(localStorage.getItem(EMPRESA_PORTAL_SLUG_KEY) || "").trim(),
    };
  } catch (_err) {
    return { guest: false, companyId: "", inviteToken: "", publicSlug: "" };
  }
}

function getStoredCompanyAccessToken() {
  return readStoredCompanyAccessToken();
}

const EMPTY_CONFIG = { id: "config", clients: {}, updated_at: "" };
const CONFIG_CACHE_KEY = "gc_cloud_access_config_v1";

function readCachedCloudConfig() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_err) {
    return null;
  }
}

function writeCachedCloudConfig(data) {
  if (typeof window === "undefined" || !data || typeof data !== "object") return;
  try {
    window.localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(data));
  } catch (_err) {
    /* quota localStorage — ignorar */
  }
}
const DEFAULT_TAB_ACCESS = {
  Dashboard: true,
  Onboarding: false,
  Companies: true,
  LoanControl: true,
  CalendarManagement: false,
  Exits: true,
  Chat: true,
  Excel: true,
  Notices: true,
  UsefulSites: true,
  AppSettings: true,
  Trash: false,
};

function normalizeTabAccess(input) {
  const source = input && typeof input === "object" ? input : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_TAB_ACCESS).map(([key, fallback]) => [
      key,
      key in source ? Boolean(source[key]) : fallback,
    ])
  );
}

async function withTimeout(promise, timeoutMs) {
  return await Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("cloud-access-timeout")), timeoutMs);
    }),
  ]);
}

/**
 * Portal (`account_type === 'client'`): só trata conta como suspensa se `is_active === false`; omitido = ativo.
 * Funcionário: mantém `Boolean(is_active)` para linhas antigas sem campo gravado como `false` explícito.
 */
function resolvePaidTierAndSelfActive(config, clientEntry, isAdminEmail) {
  if (isAdminEmail) return { isPaidTier: true, selfActive: true };
  if (!clientEntry) return { isPaidTier: false, selfActive: false };
  const isPortalAcct = String(clientEntry?.account_type || "").toLowerCase() === "client";
  const selfActive = isPortalAcct ? clientEntry.is_active !== false : Boolean(clientEntry.is_active);
  if (isPortalAcct) {
    return { isPaidTier: Boolean(clientEntry?.is_paid), selfActive };
  }
  const billing = findBillingClientEntry(config, clientEntry?.assigned_company_token);
  const isPaidTier = billing ? billingIsPaidActive(billing) : Boolean(clientEntry?.is_paid);
  return { isPaidTier, selfActive };
}

export function useCloudAccess() {
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const userEmail = normalizeEmail(user?.email);
  const userUid = String(user?.uid || "").trim();
  const isAdminByReservedEmail = CLOUD_ADMIN_FALLBACK_IDENTIFIERS.has(userEmail);
  /** Dono da planilha INOV (env) — não é administrador global da Gestão. */
  const isCalendarOwnerUid = Boolean(CLOUD_OWNER_UID && userUid && userUid === CLOUD_OWNER_UID);
  const hasAuthenticatedUser = Boolean(user?.uid);
  const storedCompanyToken = getStoredCompanyAccessToken();
  /** Evita repetir provisionamento até o servidor responder (ou erro, então permite nova tentativa). */
  const provisionCooldownRef = useRef(false);
  const inovBootstrapRef = useRef(false);

  const { data: rawConfig = EMPTY_CONFIG, isLoading } = useQuery({
    queryKey: ["cloudAccessControlConfig"],
    queryFn: async () => {
      try {
        const data = await withTimeout(dbClient.entities.CloudAccessControl.getConfig(), 8000);
        const resolved = data || EMPTY_CONFIG;
        if (resolved?.clients && Object.keys(resolved.clients).length > 0) {
          writeCachedCloudConfig(resolved);
        }
        return resolved;
      } catch (_e) {
        return readCachedCloudConfig() || EMPTY_CONFIG;
      }
    },
    staleTime: 0,
    retry: false,
    enabled: hasAuthenticatedUser,
  });

  const config = useMemo(
    () => mergeInovOfficeSeed(rawConfig, { forAdmin: isAdminByReservedEmail }),
    [rawConfig, isAdminByReservedEmail]
  );

  /** `gc_portal_client: false` no perfil = não forçar só o chat (ex.: excepção após alinhar com o escritório). */
  const { data: portalGateProfile } = useQuery({
    queryKey: ["userProfilePortalShellGate", userUid],
    queryFn: async () => {
      if (!userUid) return null;
      const data = await dbClient.entities.UserProfile.getByUid(userUid);
      return data && typeof data === "object" ? data : {};
    },
    enabled: hasAuthenticatedUser && Boolean(userUid),
    staleTime: 15_000,
    refetchInterval: 45_000,
  });

  const clientEntry = useMemo(() => {
    const map = config?.clients && typeof config.clients === "object" ? config.clients : {};
    const byEmail = userEmail ? map[userEmail] || null : null;
    const byToken =
      !byEmail && storedCompanyToken
        ? Object.values(map).find((entry) => {
            if (!entry || typeof entry !== "object") return false;
            if (entry.is_deleted) return false;
            if (String(entry.portal_token || "").trim() === storedCompanyToken) return true;
            if (String(entry.assigned_company_token || "").trim() === storedCompanyToken) return true;
            return false;
          }) || null
        : null;
    const resolved = byEmail || byToken;
    if (resolved?.is_deleted) return null;
    return resolved;
  }, [config, userEmail, storedCompanyToken]);

  const billingClientEntry = useMemo(() => {
    if (!clientEntry || String(clientEntry?.account_type || "").toLowerCase() === "client") return null;
    return findBillingClientEntry(config, clientEntry?.assigned_company_token);
  }, [clientEntry, config]);

  const empresaPortalSession = useMemo(() => {
    if (!hasAuthenticatedUser) return null;
    const em = readEmpresaPortalInviteFromBrowser();
    if (!em.guest || !em.companyId || !em.inviteToken) return null;
    const blockRaw =
      config?.company_portals && typeof config.company_portals === "object"
        ? config.company_portals[em.companyId]
        : null;
    if (!blockRaw || typeof blockRaw !== "object") return null;
    if (String(blockRaw.portal_token || "").trim() !== em.inviteToken) return null;
    if (blockRaw.portal_enabled === false) return null;
    return {
      companyId: em.companyId,
      inviteToken: em.inviteToken,
      publicSlug: em.publicSlug,
      block: blockRaw,
    };
  }, [hasAuthenticatedUser, config, userUid]);

  const isMasterUser = Boolean(clientEntry?.is_master && userEmail === normalizeEmail(clientEntry?.email));
  /** Apenas e-mails bootstrap da cloud — nunca Master nem owner_uid do calendário. */
  const isAdminEmail = Boolean(isAdminByReservedEmail);
  const isPortalClientAccount = Boolean(
    clientEntry && String(clientEntry?.account_type || "").toLowerCase() === "client"
  );

  const requiredCompanyTokens = Array.isArray(config?.company_access_tokens)
    ? config.company_access_tokens.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const requiredCompanyTokenLegacy = String(config?.company_access_token || "").trim();
  const requiredCompanyTokenList = Array.from(
    new Set([...requiredCompanyTokens, requiredCompanyTokenLegacy].filter(Boolean))
  );
  // storedCompanyToken resolved at the top of the hook
  const inferredCompanyTok = clientEntry?.assigned_company_token
    ? String(clientEntry.assigned_company_token || "").trim()
    : "";
  const isPortalTokenMatch = Boolean(
    storedCompanyToken.startsWith("CL-") &&
      clientEntry &&
      String(clientEntry.portal_token || "").trim() === storedCompanyToken
  );

  const isPortalClientUser = Boolean(
    (clientEntry && String(clientEntry?.account_type || "").toLowerCase() === "client") ||
    (portalGateProfile && portalGateProfile.gc_portal_client === true) ||
    (portalGateProfile && portalGateProfile.gc_empresa_portal_guest === true)
  );

  const companyTokenOk = Boolean(
    requiredCompanyTokenList.length === 0 ||
      requiredCompanyTokenList.includes(storedCompanyToken) ||
      (inferredCompanyTok && requiredCompanyTokenList.includes(inferredCompanyTok)) ||
      isAdminEmail ||
      isPortalTokenMatch ||
      isPortalClientUser ||
      storedCompanyToken.startsWith("CL-") ||
      storedCompanyToken.startsWith("EM-") ||
      storedCompanyToken.startsWith("CGE-") ||
      storedCompanyToken.startsWith("ADM-")
  );

  const { isPaidTier, selfActive } = useMemo(() => {
    if (isAdminEmail) return { isPaidTier: true, selfActive: true };
    if (empresaPortalSession?.block && typeof empresaPortalSession.block === "object") {
      const b = empresaPortalSession.block;
      return { isPaidTier: Boolean(b.is_paid), selfActive: b.is_active !== false };
    }
    return resolvePaidTierAndSelfActive(config, clientEntry, false);
  }, [isAdminEmail, empresaPortalSession, config, clientEntry]);
  const isPaidAndActive = Boolean(isPaidTier && selfActive);
  const internalStaffFullAccess = Boolean(isPaidAndActive && clientEntry && !isPortalClientAccount);

  useEffect(() => {
    if (!hasAuthenticatedUser || isLoading || isAdminEmail) return;

    const clientsMap = config?.clients && typeof config.clients === "object" ? config.clients : {};
    const userInClients = userEmail ? clientsMap[userEmail] || null : null;
    const storedToken = getStoredCompanyAccessToken();
    const tokenAllowedForProvision = Boolean(
      storedToken &&
      (requiredCompanyTokenList.length === 0 ||
        requiredCompanyTokenList.includes(storedToken) ||
        storedToken.startsWith("CL-") ||
        storedToken.startsWith("EM-") ||
        storedToken.startsWith("CGE-") ||
        storedToken.startsWith("ADM-"))
    );

    if (!userInClients) {
      if (tokenAllowedForProvision) {
        return;
      }
      logout().catch(() => {});
      return;
    }

    const isActive = (String(userInClients.account_type || "") !== "client") ? Boolean(userInClients.is_active) : userInClients.is_active !== false;
    if (!isActive) {
      logout().catch(() => {});
      return;
    }
  }, [config, userEmail, hasAuthenticatedUser, isLoading, isAdminEmail, logout, requiredCompanyTokenList.join("|")]);

  /**
   * Só força o ecrã do portal de **chat** (CL/empresa) quando o perfil não desactivou explicitamente (`gc_portal_client !== false`).
   * Quem entra só com **ID da empresa** na app principal e está na cloud como **utilizador** (equipa) nunca entra aqui — usa a app completa.
   */
  const portalShellEligible = Boolean(
    (clientEntry &&
      String(clientEntry?.account_type || "").toLowerCase() === "client" &&
      clientEntry.portal_enabled &&
      portalGateProfile?.gc_portal_client !== false) ||
      empresaPortalSession
  );

  const canUseSystem = Boolean(
    isAdminEmail || internalStaffFullAccess || (isPaidAndActive && companyTokenOk)
  );

  const allowClientPortalRoutesUnpaid = Boolean(
    portalShellEligible &&
      companyTokenOk &&
      !isPaidTier &&
      selfActive &&
      !isAdminEmail
  );

  // Obter company_id baseado no token da empresa
  const currentCompanyId = useMemo(() => {
    if (empresaPortalSession?.companyId) {
      return empresaPortalSession.companyId;
    }
    // Buscar company_id a partir do token na configuração
    if (!storedCompanyToken) return null;
    const companyPortals = config?.company_portals && typeof config.company_portals === "object" ? config.company_portals : {};
    for (const [companyId, portalData] of Object.entries(companyPortals)) {
      if (portalData && typeof portalData === "object" && String(portalData.portal_token || portalData.token || "") === storedCompanyToken) {
        return companyId;
      }
    }
    return null;
  }, [empresaPortalSession?.companyId, storedCompanyToken, config?.company_portals]);

  const tabAccess = useMemo(() => {
    let base = normalizeTabAccess(clientEntry?.tab_access);
    const officeToken = String(clientEntry?.assigned_company_token || "").trim();
    // Equipa do escritório (token CL/EMP/CGE): Recados, Links e Calendário visíveis por defeito
    if (isAdminEmail || currentCompanyId || officeToken) {
      base = {
        ...base,
        CalendarManagement: true,
        Notices: true,
        UsefulSites: true,
        Novidades: true,
        Trash: true,
      };
    }
    // Master edita o escritório, mas não acede a Configurações nem ao painel Administrador
    if (isMasterUser && !isAdminEmail) {
      base = { ...base, AppSettings: false };
    }
    return base;
  }, [clientEntry?.tab_access, clientEntry?.assigned_company_token, isAdminEmail, isMasterUser, currentCompanyId]);
  const tabEditAccess = useMemo(() => resolveTabEditAccessForEntry(clientEntry), [clientEntry]);

  const officeToken = String(clientEntry?.assigned_company_token || "").trim();
  const activeOfficeToken = resolveActiveOfficeToken(clientEntry);
  const officeDisplayName = useMemo(
    () => resolveOfficeDisplayName(config, activeOfficeToken, clientEntry),
    [config, activeOfficeToken, clientEntry]
  );
  const hasOfficeCalendarAccess = Boolean(
    isAdminEmail || currentCompanyId || isMasterUser || officeToken
  );

  const canAccessPage = (_pageKey) => Boolean(canUseSystem || allowClientPortalRoutesUnpaid);
  const canEditTab = useCallback(
    (pageKey) => {
      if (isAdminEmail) return true;
      const key = String(pageKey || "");
      if (key === "administrator") return false;
      if (isMasterUser) {
        if (key === "AppSettings") return false;
        return Boolean(isPaidAndActive && canUseSystem);
      }
      if (!isPaidAndActive || !canUseSystem) return false;
      if (!TAB_EDIT_PAGE_KEYS.includes(key)) return true;
      return Boolean(tabEditAccess[key]);
    },
    [isAdminEmail, isMasterUser, isPaidAndActive, canUseSystem, tabEditAccess]
  );
  const canSeeAppSettings = Boolean(
    isAdminEmail ||
      (!isMasterUser &&
        isPaidAndActive &&
        clientEntry?.allow_settings &&
        userEmail &&
        clientEntry?.email &&
        normalizeEmail(clientEntry.email) === userEmail)
  );
  /** Equipa do escritório pode alterar logo/nome visual do próprio token (sem resto das configs). */
  const canEditOfficeBranding = Boolean(
    isAdminEmail ||
      (isPaidAndActive &&
        companyTokenOk &&
        activeOfficeToken &&
        !isMasterUser &&
        !isPortalClientAccount)
  );
  const canEditCalendar = Boolean(canEditTab("CalendarManagement"));
  const canEditCompanyTasks = Boolean(canEditTab("Companies"));
  const canCreateCompanies = Boolean(canEditTab("Companies"));
  const canCreateCompanyTasks = Boolean(canEditTab("Companies"));

  /** Cliente pago + portal só encaminha para `/ClientPortal` */
  const isPortalClient = Boolean(
    !isAdminEmail && !internalStaffFullAccess && isPaidAndActive && portalShellEligible
  );

  const provisionStaffMut = useMutation({
    mutationFn: ({ uid, email, token }) =>
      dbClient.entities.CloudAccessControl.upsertClient({
        adminUid: uid,
        email,
        patch: staffAutoProvisionDefaults(token),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cloudAccessControlConfig"] });
    },
  });

  useEffect(() => {
    if (!userUid) provisionCooldownRef.current = false;
  }, [userUid]);

  /** Repõe INOV no Firestore quando o admin abre a app e o escritório sumiu do mapa `clients`. */
  useEffect(() => {
    if (!isAdminByReservedEmail || isLoading || !userUid || inovBootstrapRef.current) return;
    const clientsMap =
      rawConfig?.clients && typeof rawConfig.clients === "object" ? rawConfig.clients : {};
    if (Object.values(clientsMap).some(isInovOfficeClient)) return;

    inovBootstrapRef.current = true;
    (async () => {
      try {
        await dbClient.entities.CloudAccessControl.upsertClient({
          adminUid: userUid,
          email: INOV_OFFICE_EMAIL,
          patch: buildInovOfficeUpsertPatch(),
        });
        const tokens = new Set(
          [
            ...(Array.isArray(rawConfig?.company_access_tokens) ? rawConfig.company_access_tokens : []),
            String(rawConfig?.company_access_token || "").trim(),
            INOV_OFFICE_TOKEN,
          ].filter(Boolean)
        );
        await dbClient.entities.CloudAccessControl.updateConfig({
          adminUid: userUid,
          patch: { company_access_tokens: Array.from(tokens) },
        });
        await dbClient.entities.CloudAccessControl.upsertCompanyPortal({
          adminUid: userUid,
          companyFirestoreId: INOV_COMPANY_ID,
          patch: {
            portal_token: INOV_OFFICE_TOKEN,
            portal_enabled: true,
            name: "INOV",
          },
        });
        queryClient.invalidateQueries({ queryKey: ["cloudAccessControlConfig"] });
      } catch (_err) {
        inovBootstrapRef.current = false;
      }
    })();
  }, [isAdminByReservedEmail, isLoading, userUid, rawConfig, queryClient]);

  useEffect(() => {
    if (!hasAuthenticatedUser || isLoading) return;
    if (isAdminEmail || provisionStaffMut.isPending || provisionCooldownRef.current) return;
    if (clientEntry) return;
    try {
      if (typeof window !== "undefined" && window.localStorage.getItem(EMPRESA_PORTAL_GUEST_KEY) === "1") {
        return;
      }
    } catch (_e) {
      /* ignore */
    }
    if (!userEmail || !userUid) return;

    const token = getStoredCompanyAccessToken();
    if (!token.trim()) return;
    const tokenAllowedForProvision =
      (requiredCompanyTokenList.length === 0 ||
        requiredCompanyTokenList.includes(token) ||
        token.startsWith("CGE-") ||
        token.startsWith("ADM-")) &&
      !token.startsWith("CL-") &&
      !token.startsWith("EM-");
    if (!tokenAllowedForProvision) return;

    provisionCooldownRef.current = true;
    provisionStaffMut.mutate(
      { uid: userUid, email: userEmail, token },
      {
        onError: () => {
          provisionCooldownRef.current = false;
        },
      }
    );
  }, [
    hasAuthenticatedUser,
    isLoading,
    isAdminEmail,
    clientEntry,
    userEmail,
    userUid,
    requiredCompanyTokenList.join("|"),
    provisionStaffMut.mutate,
    provisionStaffMut.isPending,
  ]);

  return {
    isLoading: hasAuthenticatedUser ? isLoading : false,
    config,
    userEmail,
    isAdminEmail,
    isCalendarOwnerUid,
    isMasterUser,
    hasOfficeCalendarAccess,
    internalStaffFullAccess,
    companyTokenOk,
    billingClientEntry,
    requiredCompanyToken: requiredCompanyTokenList[0] || "",
    requiredCompanyTokens: requiredCompanyTokenList,
    clientEntry,
    empresaPortalSession,
    currentCompanyId,
    canUseSystem,
    allowClientPortalRoutesUnpaid,
    canSeeAppSettings,
    canEditOfficeBranding,
    activeOfficeToken,
    officeDisplayName,
    canEditCalendar,
    canEditCompanyTasks,
    canCreateCompanies,
    canCreateCompanyTasks,
    tabAccess,
    tabEditAccess,
    canEditTab,
    canAccessPage,
    isPortalClient,
  };
}
