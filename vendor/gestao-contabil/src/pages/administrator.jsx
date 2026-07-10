import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  KeyRound,
  Copy,
  Lock,
  CheckCircle2,
  XCircle,
  LayoutGrid,
  ListChecks,
  Pencil,
  Trash2,
  Building2,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import InfoTooltip from "@/components/InfoTooltip";
import { dbClient } from "@/api/dbClient";
import { useAuth, COMPANY_ACCESS_TOKEN_KEY } from "@/lib/AuthContext";
import { CLOUD_ADMIN_EMAIL, useCloudAccess } from "@/lib/useCloudAccess";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";
import {
  emptyTabEditAccess,
  resolveTabEditAccessForEntry,
  TAB_EDIT_PAGE_KEYS,
} from "@/lib/tabEditAccess";
import { APP_VERSION } from "@/config/appRelease";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function readStoredCompanyAccessToken() {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem(COMPANY_ACCESS_TOKEN_KEY) || "").trim();
}

/** Mesmo vínculo que a equipa (sessão atual ou primeira token configurada). */
function deriveAssignedCompanyTokenForNewPortalClient(clientEntry, requiredCompanyTokensList) {
  const fromStaff = String(clientEntry?.assigned_company_token || "").trim();
  if (fromStaff) return fromStaff;
  const stored = readStoredCompanyAccessToken();
  if (stored) return stored;
  const list = Array.isArray(requiredCompanyTokensList) ? requiredCompanyTokensList : [];
  return String(list[0] || "").trim();
}

function slugifyPortalPlaceholderLocalPart(displayName) {
  return (
    String(displayName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "cliente"
  );
}

/** E‑mail técnico na cloud access; quando tiver o Gmail real use «Editar» para renomear. */
function generatePortalPlaceholderEmail(displayName) {
  const slug = slugifyPortalPlaceholderLocalPart(displayName);
  const uniq =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return normalizeEmail(`${slug}-${uniq}@portal.gc.local`);
}

/** Empresas na coleção `companies` cujo `uid` corresponde a um utilizador interno com o mesmo vínculo (ID da empresa). */
function portalFirestoreCompaniesForOfficeToken(clients, profilesAll, allCompanies, assignedToken) {
  const tkAssign = String(assignedToken || "").trim();
  if (!tkAssign || !Array.isArray(allCompanies)) return [];
  const peerEmails = new Set(
    clients
      .filter(
        (c) =>
          String(c.account_type || "user").toLowerCase() !== "client" &&
          String(c.assigned_company_token || "").trim() === tkAssign &&
          normalizeEmail(c.email) !== CLOUD_ADMIN_EMAIL
      )
      .map((c) => normalizeEmail(c.email))
  );
  const ownerUids = new Set();
  for (const p of profilesAll || []) {
    const em = normalizeEmail(p?.email);
    const uid = String(p?.uid || "").trim();
    if (!uid || !em || !peerEmails.has(em)) continue;
    ownerUids.add(uid);
  }
  return allCompanies
    .filter((co) => ownerUids.has(String(co.uid || "").trim()))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
}

/** Nome amigável na lista Gestão portal (não o Gmail em destaque). */
function portalClientDisplayName(client) {
  const name = String(client?.client_display_name || client?.display_name || client?.gc_login_username || "").trim();
  return name || "Utilizador sem nome";
}

function profileRowForNormalizedEmail(profilesAll, email) {
  const n = normalizeEmail(email);
  if (!n || !Array.isArray(profilesAll)) return null;
  return (
    profilesAll
      .filter((p) => normalizeEmail(p?.email) === n)
      .sort((a, b) => {
        const ta = new Date(a?.last_seen_at || 0).getTime();
        const tb = new Date(b?.last_seen_at || 0).getTime();
        return tb - ta;
      })[0] || null
  );
}

function formatPtLastSeen(iso) {
  const raw = String(iso || "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Presença aproximada (último ping do perfil na app / login). */
const ONLINE_LAST_SEEN_MS = 2 * 60 * 1000;

function isProfileProbablyOnline(lastSeenIso) {
  const raw = String(lastSeenIso || "").trim();
  if (!raw) return false;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return false;
  return Date.now() - d.getTime() < ONLINE_LAST_SEEN_MS;
}

function clientPortalAbsoluteUrl(client, portalTokenOverride = "") {
  if (typeof window === "undefined") return "";
  const tok = String(portalTokenOverride || client?.portal_token || "").trim();
  if (!tok) return "";
  const comp = String(client?.portal_default_company_id || "").trim();
  const q = encodeURIComponent(tok);
  let out = `${window.location.origin}/ClientPortal?token=${q}${comp ? `&company=${encodeURIComponent(comp)}` : ""}`;
  const ids = Array.isArray(client?.portal_staff_uids)
    ? client.portal_staff_uids.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const uidFromObjs = Array.isArray(client?.portal_staff)
    ? String(client.portal_staff[0]?.uid || "").trim()
    : "";
  const preferStaff = ids[0] || uidFromObjs;
  if (preferStaff) out += `&staff=${encodeURIComponent(preferStaff)}`;
  out += `&v=${encodeURIComponent(APP_VERSION)}`;
  return out;
}

async function copyTextToClipboard(text, { emptyMessage } = {}) {
  const t = String(text || "").trim();
  if (!t) {
    if (emptyMessage) window.alert(emptyMessage);
    return false;
  }
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch (err) {
    console.warn("navigator.clipboard failed, attempting fallback...", err);
  }
  try {
    const textArea = document.createElement("textarea");
    textArea.value = t;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    if (successful) return true;
  } catch (err) {
    console.error("Fallback copy failed", err);
  }
  window.alert("Não foi possível copiar automaticamente. Selecione o texto na caixa.");
  return false;
}

/** Visibilidade de abas no menu (inclui Dashboard; sem Usuários — uso em Empresas). */
const TAB_OPTIONS = [
  { key: "Dashboard", label: "Dashboard" },
  { key: "Onboarding", label: "Onboarding" },
  { key: "Companies", label: "Empresas" },
  { key: "CalendarManagement", label: "Calendário" },
  { key: "Exits", label: "Baixa e Saída" },
  { key: "Chat", label: "Chat" },
  { key: "Notices", label: "Recados" },
  { key: "UsefulSites", label: "Links Úteis" },
  { key: "AppSettings", label: "Configurações" },
];

/** Só abas com dados partilhados (resto do app: edição livre para quem tem acesso). */
const TAB_EDIT_MODAL_OPTIONS = TAB_EDIT_PAGE_KEYS.map((key) => {
  const found = TAB_OPTIONS.find((t) => t.key === key);
  return found || { key, label: key };
});

function buildDefaultTabAccess() {
  return Object.fromEntries(TAB_OPTIONS.map((tab) => [tab.key, true]));
}

/** Por defeito todas as caixas «Pode editar» desmarcadas (utilizador e cliente). */
function buildDefaultTabEdit() {
  return emptyTabEditAccess();
}

export default function Administrator() {
  const { theme } = useTheme();
  const location = useLocation();
  const { user } = useAuth();
  const { config, isAdminEmail, isLoading, clientEntry, requiredCompanyTokens } = useCloudAccess();
  const queryClient = useQueryClient();
  const [clientNameInput, setClientNameInput] = useState("");
  const [tabEditDialogEmail, setTabEditDialogEmail] = useState("");
  const [portalBillingEdit, setPortalBillingEdit] = useState(null);
  const [pendingRemove, setPendingRemove] = useState(null);
  /** Edição das empresas Firestore visíveis no portal (IDs + empresa pré-fixada no link). */
  const [portalCompanyDraft, setPortalCompanyDraft] = useState(null);
  /** Assistente vindo da Consola Multiverso (?painel_tokens=1): ADM escritório + criar cliente CL com link isolado por token. */
  const [tokenWizardOpen, setTokenWizardOpen] = useState(false);
  const [wizardNewClientName, setWizardNewClientName] = useState("");
  const [wizardLastAdm, setWizardLastAdm] = useState("");
  const [wizardInvite, setWizardInvite] = useState(null);
  const [activityUserDetail, _setActivityUserDetail] = useState(null);
  const [_empresasDialogOpen, _setEmpresasDialogOpen] = useState(false);
  const [presenceActivityDialogOpen, setPresenceActivityDialogOpen] = useState(false);
  const [internalStaffSearch, setInternalStaffSearch] = useState("");
  const [expandedStaffEmailDialog, setExpandedStaffEmailDialog] = useState("");
  const [expandedClientInternalStaffEmail, setExpandedClientInternalStaffEmail] = useState("");
  const [expandedPortalStatus, setExpandedPortalStatus] = useState("");
  const [presenceActivityCompanyFilter, setPresenceActivityCompanyFilter] = useState(null);
  const [presenceActivityAccountTypeFilter, setPresenceActivityAccountTypeFilter] = useState(null); // "all", "internal", "client"
  const [presenceActivityStatusFilter, setPresenceActivityStatusFilter] = useState("active"); // "active", "blocked", "deleted", "all"

  const clients = useMemo(() => {
    const map = config?.clients && typeof config.clients === "object" ? config.clients : {};
    return Object.values(map).sort((a, b) => {
      const la = portalClientDisplayName(a) || String(a.email || "");
      const lb = portalClientDisplayName(b) || String(b.email || "");
      const c = la.localeCompare(lb, "pt-BR", { sensitivity: "base" });
      return c !== 0 ? c : String(a.email || "").localeCompare(String(b.email || ""));
    });
  }, [config]);

  const portalClients = useMemo(
    () => clients.filter((c) => String(c.account_type || "user") === "client" && !c.gc_chat_only_client && !c.is_deleted),
    [clients]
  );
  const internalStaff = useMemo(() => {
    return clients.filter((c) => String(c.account_type || "user") !== "client" && !c.is_deleted);
  }, [clients]);


  const tokenToClientNameMap = useMemo(() => {
    const map = new Map();
    const companyPortals = config?.company_portals && typeof config.company_portals === "object" ? config.company_portals : {};
    
    Object.values(companyPortals).forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const tok = String(entry.id || entry.token || "").trim();
      if (!tok) return;
      if (map.has(tok)) return;
      const name = String(entry.name || entry.client_display_name || tok).trim();
      map.set(tok, name);
    });

    Object.values(clients).forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const tok = String(entry.assigned_company_token || "").trim();
      if (!tok) return;
      if (map.has(tok)) return;
      const name =
        String(entry.client_display_name || entry.display_name || entry.gc_login_username || "").trim() ||
        tok;
      map.set(tok, name);
    });
    return map;
  }, [clients, config?.company_portals]);

  /** IDs de empresa aceites no login das apps — distintos dos tokens CL‑… / EM‑…. */
  const _officeMultiversoTokenList = useMemo(() => {
    const fromArr = Array.isArray(requiredCompanyTokens)
      ? requiredCompanyTokens.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    const leg = String(config?.company_access_token || "").trim();
    return Array.from(new Set(leg ? [...fromArr, leg] : fromArr));
  }, [requiredCompanyTokens, config?.company_access_token]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["cloudAccessControlConfig"], refetchType: "all" });
    queryClient.refetchQueries({ queryKey: ["cloudAccessControlConfig"] });
  };

  const generateAdministratorOfficeTokenMut = useMutation({
    mutationFn: async (_opts = {}) => {
      const uid = String(user?.uid || "").trim();
      if (!uid) throw new Error("Sessão em falta. Volte a entrar.");

      const cfg = await dbClient.entities.CloudAccessControl.getConfig();
      const prevTokens = Array.isArray(cfg?.company_access_tokens)
        ? cfg.company_access_tokens.map((x) => String(x || "").trim()).filter(Boolean)
        : [];
      const legacy = String(cfg?.company_access_token || "").trim();
      const nextSet = new Set([...prevTokens]);
      if (legacy) nextSet.add(legacy);
      const newTok = dbClient.entities.CloudAccessControl.generateToken("ADM");
      nextSet.add(newTok);

      await dbClient.entities.CloudAccessControl.updateConfig({
        adminUid: uid,
        patch: { company_access_tokens: Array.from(nextSet) },
      });
      return newTok;
    },
    onSuccess: async (newTok, opts = {}) => {
      refresh();
      if (opts && opts.suppressAlert) return;
      const copied = await copyTextToClipboard(newTok, {});
      window.alert(
        copied
          ? `Token da Gestão Contábil gerado e copiado para a área de transferência:\n\n${newTok}\n\nGuarde-o num local seguro. ` +
              "Este é o token que a equipa usa para entrar na app principal (Gestão Contábil). " +
              "Não substitui os tokens do portal do cliente (CL‑…) nem o convite da empresa (EM‑…)."
          : `Token da Gestão Contábil gerado:\n\n${newTok}\n\n(Cópia automática falhou — selecione o texto manualmente.)`
      );
    },
    onError: (e) => window.alert(e?.message || "Não foi possível gerar o token de administrador."),
  });

  const adminDataReady = Boolean(!isLoading && isAdminEmail && user?.uid);

  useEffect(() => {
    if (!adminDataReady || typeof window === "undefined") return;
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("painel_tokens") !== "1" && sp.get("mv_tokens") !== "1") return;
      setTokenWizardOpen(true);
      setWizardInvite(null);
      setWizardLastAdm("");
      setWizardNewClientName("");
      sp.delete("painel_tokens");
      sp.delete("mv_tokens");
      const qs = sp.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
      );
    } catch {
      /* ignore */
    }
  }, [adminDataReady]);

  /** Atalhos Consola Multiverso: #mv-criar-cliente leva ao formulário «Criar cliente». */
  useEffect(() => {
    if (!adminDataReady) return;
    const h = String(location.hash || "").replace(/^#/, "");
    if (h !== "mv-criar-cliente") return;
    requestAnimationFrame(() => {
      document.getElementById("mv-criar-cliente")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [adminDataReady, location.hash]);

  const { data: adminFirestoreCompanies = [] } = useQuery({
    queryKey: ["adminFirestoreCompanies"],
    queryFn: () => dbClient.entities.Company.listAll(),
    enabled: adminDataReady,
    staleTime: 60_000,
  });

  const { data: adminFirestoreProfiles = [] } = useQuery({
    queryKey: ["adminFirestoreProfiles"],
    queryFn: () => dbClient.entities.UserProfile.listAll(),
    enabled: adminDataReady,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const allUserEntries = useMemo(() => {
    const clientsMap = new Map();
    clients.forEach((client) => {
      if (!client.email) return;
      clientsMap.set(normalizeEmail(client.email), client);
    });

    const seenKeys = new Set();
    return adminFirestoreProfiles
      .filter((profile) => profile.email)
      .map((profile) => {
        const key = normalizeEmail(profile.email);
        if (seenKeys.has(key)) return null;
        seenKeys.add(key);
        const client = clientsMap.get(key) || null;
        return {
          profile,
          client,
          email: profile.email,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const nameA = String(a.profile?.display_name || a.profile?.gc_login_username || "");
        const nameB = String(b.profile?.display_name || b.profile?.gc_login_username || "");
        return nameA.localeCompare(nameB, "pt-BR", { sensitivity: "base" });
      });
  }, [clients, adminFirestoreProfiles]);

  const filteredPresenceStaff = useMemo(() => {
    let result = allUserEntries;
    
    if (presenceActivityAccountTypeFilter === "internal") {
      result = result.filter((entry) =>
        entry.client ? String(entry.client.account_type || "user") !== "client" : true
      );
    } else if (presenceActivityAccountTypeFilter === "client") {
      result = result.filter((entry) =>
        entry.client ? String(entry.client.account_type || "user") === "client" : false
      );
    }

    if (presenceActivityStatusFilter === "active") {
      result = result.filter((entry) =>
        entry.client ? entry.client.is_active !== false && !entry.client.is_deleted : true
      );
    } else if (presenceActivityStatusFilter === "blocked") {
      result = result.filter((entry) => entry.client && entry.client.is_active === false && !entry.client.is_deleted);
    } else if (presenceActivityStatusFilter === "deleted") {
      result = result.filter((entry) => entry.client && entry.client.is_deleted === true);
    }

    if (presenceActivityCompanyFilter) {
      result = result.filter((entry) =>
        entry.client
          ? String(entry.client.assigned_company_token || "").trim() === String(presenceActivityCompanyFilter).trim()
          : false
      );
    }

    return result;
  }, [allUserEntries, presenceActivityCompanyFilter, presenceActivityAccountTypeFilter, presenceActivityStatusFilter]);

  const _gestaoAccessActivityRows = useMemo(() => {
    const clientsMap = new Map();
    (clients || []).forEach((c) => {
      if (c.email) clientsMap.set(normalizeEmail(c.email), c);
    });

    return (adminFirestoreProfiles || [])
      .map((p) => {
        const emailStr = normalizeEmail(p.email);
        const c = clientsMap.get(emailStr);
        const isPortal = c ? String(c.account_type || "user").toLowerCase() === "client" : emailStr.endsWith("@portal.gc.local") || emailStr.includes("client");
        const lastSeenRaw = p.last_seen_at;
        const localPart = emailStr.includes("@") ? emailStr.split("@")[0] : emailStr;
        return {
          email: p.email,
          display:
            (c && portalClientDisplayName(c)) ||
            p.display_name ||
            p.gc_login_username ||
            (isPortal ? "Cliente portal" : localPart || emailStr || "Utilizador"),
          role: isPortal ? "Portal (chat)" : "Acesso na app",
          lastSeenRaw,
          lastSeen: formatPtLastSeen(lastSeenRaw),
          online: isProfileProbablyOnline(lastSeenRaw),
        };
      })
      .sort((a, b) => {
        const ta = new Date(a.lastSeenRaw || 0).getTime();
        const tb = new Date(b.lastSeenRaw || 0).getTime();
        return tb - ta;
      });
  }, [clients, adminFirestoreProfiles]);

  const _activityDetailClient = useMemo(() => {
    if (!activityUserDetail) return null;
    return (
      clients.find((c) => normalizeEmail(c.email) === normalizeEmail(activityUserDetail.email)) || null
    );
  }, [clients, activityUserDetail]);

  const tabEditClient = useMemo(() => {
    if (!tabEditDialogEmail) return null;
    return (
      clients.find((c) => normalizeEmail(c.email) === normalizeEmail(tabEditDialogEmail)) || null
    );
  }, [clients, tabEditDialogEmail]);

  const saveClientMut = useMutation({
    mutationFn: async () => {
      const displayName = String(clientNameInput || "").trim();
      if (!displayName) throw new Error("Informe o nome do cliente (como deve aparecer na lista).");
      const tk = deriveAssignedCompanyTokenForNewPortalClient(clientEntry, requiredCompanyTokens);
      if (!tk) {
        throw new Error(
          "Não foi possível obter o token automaticamente. Faça sessão neste mesmo browser já com esse token (como na equipa) ou defina os tokens na configuração de acesso à cloud."
        );
      }
      const email = generatePortalPlaceholderEmail(displayName);
      await dbClient.entities.CloudAccessControl.upsertClient({
        adminUid: user?.uid,
        email,
        patch: {
          account_type: "client",
          is_master: false,
          client_display_name: displayName,
          notes: "",
          is_paid: false,
          is_active: true,
          assigned_company_token: tk,
          tab_access: buildDefaultTabAccess(),
          tab_edit_access: buildDefaultTabEdit(),
          portal_enabled: true,
        },
      });
    },
    onSuccess: () => {
      setClientNameInput("");
      refresh();
    },
    onError: (e) => window.alert(e?.message || "Falha ao salvar cliente."),
  });

  const patchClientMut = useMutation({
    mutationFn: ({ email, patch }) =>
      dbClient.entities.CloudAccessControl.upsertClient({
        adminUid: user?.uid,
        email,
        patch,
      }),
    onSuccess: refresh,
    onError: (e) => window.alert(e?.message || "Falha ao atualizar cliente."),
  });

  const _removeClientMut = useMutation({
    mutationFn: (email) =>
      dbClient.entities.CloudAccessControl.removeClient({
        adminUid: user?.uid,
        email,
      }),
    onSuccess: refresh,
    onError: (e) => window.alert(e?.message || "Falha ao remover cliente."),
  });

  const patchClientPortalMut = useMutation({
    mutationFn: ({ email, patch }) =>
      dbClient.entities.CloudAccessControl.upsertClient({
        adminUid: user?.uid,
        email,
        patch,
      }),
    onSuccess: refresh,
    onError: (e) => window.alert(e?.message || "Falha ao salvar configuração do portal do cliente."),
  });

  /** Devolve o `portal_token` gravado no servidor (sempre um token novo CL-…). */
  const regeneratePortalTokenForClient = async (client, configSnapshot = null) => {
    const tkAssign = String(client.assigned_company_token || "").trim();
    let portal_staff = [];
    let portal_staff_uids = [];
    const portalCoIds = Array.isArray(client.portal_company_ids)
      ? client.portal_company_ids.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    try {
      const profilesRows = await dbClient.entities.UserProfile.listAll();
      const peersSource = configSnapshot || config;
      const rowsFromSnap =
        peersSource?.clients && typeof peersSource.clients === "object"
          ? Object.values(peersSource.clients)
          : [];
      const peerEntries = rowsFromSnap.filter(
        (c) =>
          String(c.account_type || "user").toLowerCase() !== "client" &&
          String(c.assigned_company_token || "").trim() === tkAssign &&
          normalizeEmail(c.email) !== CLOUD_ADMIN_EMAIL
      );
      const want = new Set(peerEntries.map((c) => normalizeEmail(c.email)));
      for (const p of profilesRows) {
        const em = normalizeEmail(p?.email);
        const id = String(p?.uid || "").trim();
        if (!id || !em || !want.has(em)) continue;
        portal_staff.push({ uid: id, sector: "", company_ids: portalCoIds.length > 0 ? portalCoIds : [] });
        portal_staff_uids.push(id);
      }
    } catch {
      /* sem equipa automática */
    }

    const newPortalToken = dbClient.entities.CloudAccessControl.generateToken("CL");
    await patchClientPortalMut.mutateAsync({
      email: client.email,
      patch: {
        portal_enabled: true,
        portal_mode: "chat_only",
        portal_only_chat: true,
        portal_token: newPortalToken,
        portal_staff,
        portal_staff_uids,
      },
    });
    return newPortalToken;
  };

  const savePortalBillingMut = useMutation({
    mutationFn: async ({ fromEmail, draft }) => {
      const from = normalizeEmail(fromEmail);
      const to = normalizeEmail(draft.email);
      if (!to || !to.includes("@")) throw new Error("Informe um e-mail válido para o cliente.");
      const tk = String(draft.assigned_company_token || "").trim();
      if (!tk) throw new Error("Informe o ID da empresa (vínculo do escritório).");
      const notes = String(draft.notes ?? "");
      const displayName = String(draft.client_display_name ?? "").trim();
      if (!displayName) throw new Error('Informe o nome do cliente (campo «Nome para exibir na lista»).');
      if (from !== to) {
        await dbClient.entities.CloudAccessControl.renameClientEmail({
          adminUid: user?.uid,
          fromEmail: from,
          toEmail: to,
          patch: { notes, assigned_company_token: tk, client_display_name: displayName },
        });
      } else {
        await dbClient.entities.CloudAccessControl.upsertClient({
          adminUid: user?.uid,
          email: from,
          patch: { notes, assigned_company_token: tk, client_display_name: displayName },
        });
      }
      return { from, to };
    },
    onSuccess: () => {
      refresh();
      setPortalBillingEdit(null);
    },
    onError: (e) => window.alert(e?.message || "Falha ao guardar edição do cliente."),
  });

  const portalTokenWizardMut = useMutation({
    mutationFn: async ({ displayName }) => {
      const displayNameTrim = String(displayName || "").trim();
      if (!displayNameTrim) {
        throw new Error("Informe o nome pelo qual este cliente será reconhecido na lista.");
      }
      const uidOp = String(user?.uid || "").trim();
      if (!uidOp) throw new Error("Sessão em falta.");

      const tk =
        deriveAssignedCompanyTokenForNewPortalClient(clientEntry, requiredCompanyTokens) ||
        String(wizardLastAdm || "").trim();
      if (!tk) {
        throw new Error(
          "Precisa primeiro de um ID de escritório (ADM‑…) neste browser. Clique acima em «Gerar token escritório», depois aqui novamente.",
        );
      }

      const email = generatePortalPlaceholderEmail(displayNameTrim);
      await dbClient.entities.CloudAccessControl.upsertClient({
        adminUid: uidOp,
        email,
        patch: {
          account_type: "client",
          is_master: false,
          client_display_name: displayNameTrim,
          notes: "",
          is_paid: false,
          is_active: true,
          assigned_company_token: tk,
          tab_access: buildDefaultTabAccess(),
          tab_edit_access: buildDefaultTabEdit(),
          portal_enabled: true,
        },
      });

      refresh();
      await queryClient.invalidateQueries({ queryKey: ["cloudAccessControlConfig"] });
      await queryClient.refetchQueries({ queryKey: ["cloudAccessControlConfig"] });

      const cfgFresh = await dbClient.entities.CloudAccessControl.getConfig();
      const nk = normalizeEmail(email);
      const row = cfgFresh.clients?.[nk];
      if (!row) throw new Error("Cliente criado; não foi possível sincronizar. Atualize a página.");

      const clTok = await regeneratePortalTokenForClient(row, cfgFresh);
      const portalLink = typeof window !== "undefined" ? clientPortalAbsoluteUrl(row, clTok) : "";

      return { officeTokenUsed: tk, portalToken: clTok, portalLink, displayLabel: displayNameTrim };
    },
    onSuccess: async (bundle) => {
      setWizardInvite(bundle);
      if (bundle?.portalLink) await copyTextToClipboard(bundle.portalLink, {});
    },
    onError: (e) => window.alert(e?.message || "Não foi possível criar o cliente nem o token."),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Gestão Contábil</h1>
        <Card className="p-6">Carregando controle de acesso...</Card>
      </div>
    );
  }

  if (!isAdminEmail) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Administrador</h1>
        </div>

        <Card className={`p-8 text-center flex flex-col items-center justify-center min-h-[320px] max-w-2xl mx-auto ${
          theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100 shadow-sm"
        }`}>
          <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-4 mb-4 animate-pulse">
            <Lock className="w-12 h-12 text-red-500" />
          </div>
          <h3 className="font-bold text-xl mb-2 text-foreground">Acesso Restrito</h3>
          <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
            Você não tem permissão para aceder à área de Administração do sistema.
            Esta funcionalidade está reservada para os administradores gerais.
          </p>
          <div className="mt-6 text-xs text-muted-foreground border-t pt-4 w-full max-w-xs border-gray-200 dark:border-gray-700">
            Caso necessite de acesso, por favor contacte o administrador da sua empresa.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-indigo-600" />
          Gestão Contábil (acessos cliente e equipa)
          <InfoTooltip side="right">
            <p className="font-semibold mb-1">Como funciona esta página</p>
            <p><strong>Clientes do portal</strong> — criar convite, token e link para o seu cliente (suporte / conta @portal.gc.local).</p>
            <p className="mt-1">Para convites ao cliente final de uma empresa, utilize <strong>Configurações → Portal cliente da empresa</strong>.</p>
            <p className="mt-1">Os tokens são <strong>CL‑…</strong> por cliente. O convite empresa (<strong>EM‑…</strong>) não vale para estas contas nem para a equipa.</p>
            <p className="mt-1"><strong>Equipa interna</strong> — bloqueios e permissões no quadro «Abrir».</p>
          </InfoTooltip>
        </h1>
      </div>

      <Dialog
        open={tokenWizardOpen}
        onOpenChange={(open) => {
          setTokenWizardOpen(open);
          if (!open) setWizardNewClientName("");
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className={cn(
            "max-w-[min(520px,calc(100vw-2rem))] gap-4",
            theme === "dark" ? "border-gray-800 bg-gray-950" : ""
          )}
        >
          <DialogHeader className="text-left space-y-2">
            <DialogTitle className="text-xl flex flex-wrap items-center gap-2 pr-8">
              <KeyRound className="w-6 h-6 text-indigo-500 shrink-0" />
              Tokens escritório e cliente
            </DialogTitle>
            <p className={cn("text-sm leading-relaxed", theme === "dark" ? "text-gray-400" : "text-muted-foreground")}>
              Este assistente faz duas coisas: criar um <strong className="text-foreground">ID de escritório (ADM‑…)</strong>{" "}
              para a equipa quando necessário — e registar um <strong className="text-foreground">cliente próprio seu</strong>{" "}
              com token <strong className="text-foreground">CL‑…</strong> e{" "}
              <strong className="text-foreground">link exclusivo</strong>. Cada ADM‑… isola dados do escritório; cada cliente fica ligado apenas ao escritório pai e ao seu próprio portal (não vê outros clientes).
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <div
              className={cn(
                "rounded-lg border p-3 space-y-2",
                theme === "dark" ? "border-gray-800 bg-gray-900/50" : "border-muted bg-muted/30"
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Passo 1 — Token escritório (CGE‑…)
              </p>
              <Button
                type="button"
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                disabled={generateAdministratorOfficeTokenMut.isPending || !user?.uid}
                onClick={async () => {
                  try {
                    const t = await generateAdministratorOfficeTokenMut.mutateAsync({ suppressAlert: true });
                    const tok = String(t || "").trim();
                    setWizardLastAdm(tok);
                    await copyTextToClipboard(tok, {});
                  } catch {
                    /* erro tratado pela mutation global */
                  }
                }}
              >
                <KeyRound className="w-4 h-4 mr-2 shrink-0" />
                {generateAdministratorOfficeTokenMut.isPending ? "A gerar…" : "Gerar token escritório (CGE‑…)"}
              </Button>
              {wizardLastAdm ? (
                <p className="text-[11px] font-mono break-all text-muted-foreground">
                  Último token CGE gerado (guarde antes de enviar ao escritório):{" "}
                  <span className="text-foreground">{wizardLastAdm}</span>
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Token CGE para a sua equipa entrar na Gestão Contábil — não serve para clientes do portal.
                </p>
              )}
            </div>

            <div
              className={cn(
                "rounded-lg border p-3 space-y-2",
                theme === "dark" ? "border-gray-800 bg-gray-900/50" : "border-muted bg-muted/30"
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Passo 2 — Novo escritório (portal CL‑… · dados isolados)
              </p>
              <Label htmlFor="mv-wizard-client-name" className="text-xs">
                Nome do escritório na lista / referência interna
              </Label>
              <Input
                id="mv-wizard-client-name"
                value={wizardNewClientName}
                onChange={(e) => setWizardNewClientName(e.target.value)}
                placeholder='Ex.: "Silva Auditores"'
                className={cn(theme === "dark" ? "bg-gray-950 border-gray-800" : "")}
              />
              <Button
                type="button"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={portalTokenWizardMut.isPending || !user?.uid}
                onClick={() =>
                  portalTokenWizardMut.mutate({
                    displayName: wizardNewClientName,
                  })
                }
              >
                <Users className="w-4 h-4 mr-2 shrink-0" />
                {portalTokenWizardMut.isPending ? "A criar escritório e gerar CL‑…" : "Criar escritório e gerar token + link"}
              </Button>
            </div>

            {wizardInvite ? (
              <div
                className={cn(
                  "rounded-lg border p-3 space-y-2",
                  theme === "dark" ? "border-emerald-900/50 bg-emerald-950/20" : "border-emerald-200 bg-emerald-50/50"
                )}
              >
                <p className="text-sm font-semibold text-foreground">{wizardInvite.displayLabel}</p>
                <p className="text-[11px] text-muted-foreground">
                  Este cliente está ligado ao ID de escritório <span className="font-mono text-foreground">{wizardInvite.officeTokenUsed}</span>{" "}
                  (toda a comunicação Portal exige esse ID + este token secreto junto ao link — não há partilha com outros escritórios nem com outros seus clientes).
                </p>
                <Label className="text-xs">Link copiado automaticamente quando possível</Label>
                <Textarea readOnly rows={3} value={wizardInvite.portalLink || ""} className="font-mono text-[11px]" />
                <p className="text-[11px] font-mono break-all">
                  Token CL: <span className="text-foreground">{wizardInvite.portalToken}</span>
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => copyTextToClipboard(wizardInvite.portalLink || wizardInvite.portalToken, {})}
                  >
                    <Copy className="w-3 h-3" /> Copiar link
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => copyTextToClipboard(wizardInvite.portalToken || "", {})}
                  >
                    <Copy className="w-3 h-3" /> Copiar apenas CL‑…
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="sm:justify-between gap-2 flex-col-reverse sm:flex-row">
            <Button type="button" variant="ghost" size="sm" onClick={() => setTokenWizardOpen(false)}>
              Fechar assistente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Clientes do Portal */}
        <div className="lg:col-span-8 space-y-6">
          <Card className={cn("p-6 border", theme === "dark" ? "bg-gray-900/80 border-gray-800" : "bg-white border-gray-100 shadow-sm")}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-4 mb-5 border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-500 shrink-0" />
                <h2 className="font-bold text-lg tracking-tight text-foreground">Meus Clientes (Escritórios Contábeis)</h2>
                <InfoTooltip text="Aqui gerencia os seus clientes diretos — os escritórios contábeis que usam a sua Gestão Contábil. Cada escritório tem: token CGE- (para a sua equipa), token CL- (para o portal do escritório). Os clientes FINAIS dos escritórios (empresas) são gerenciados em Configurações → Portal cliente da empresa (tokens EM-)." />
              </div>
            </div>

            <div
              id="mv-criar-cliente"
              className={cn(
                "rounded-xl border p-4 space-y-3 mb-6",
                theme === "dark" ? "border-gray-700 bg-gray-950/50" : "border-muted bg-muted/25"
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Criar escritório contábil</p>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <Input
                  value={clientNameInput}
                  onChange={(e) => setClientNameInput(e.target.value)}
                  placeholder="Nome do escritório (como aparece na lista)"
                  className={cn("h-10 text-sm flex-1", theme === "dark" ? "bg-gray-950 border-gray-800" : "")}
                />
                <Button
                  type="button"
                  className="bg-indigo-600 hover:bg-indigo-700 justify-center shrink-0 w-full sm:w-auto text-white font-medium"
                  onClick={() => saveClientMut.mutate()}
                  disabled={saveClientMut.isPending}
                >
                  <KeyRound className="w-4 h-4 mr-2 shrink-0" />
                  {saveClientMut.isPending ? "A criar…" : "Criar escritório"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {portalClients.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum escritório contábil registado.</p>
              ) : (
                portalClients.map((client) => {
                  const officeCompanies = portalFirestoreCompaniesForOfficeToken(
                    clients,
                    adminFirestoreProfiles,
                    adminFirestoreCompanies,
                    client.assigned_company_token
                  );
                  const clientInternalStaff = clients.filter(
                    (c) =>
                      String(c.account_type || "user").toLowerCase() !== "client" &&
                      String(c.assigned_company_token || "").trim() === String(client.assigned_company_token || "").trim()
                  );
                  const portalCompaniesCount = Array.isArray(client.portal_company_ids)
                    ? client.portal_company_ids.filter((pid) => String(pid || "").trim()).length
                    : 0;
                  const portalTokenPlain = String(client.portal_token || "").trim();
                  const portalChatUrl = portalTokenPlain ? clientPortalAbsoluteUrl(client, portalTokenPlain) : "";
                  const inputDark =
                    theme === "dark"
                      ? "bg-gray-950 border-gray-800 text-gray-100 font-mono"
                      : "font-mono";
                  const inputLinkDark =
                    theme === "dark" ? "bg-gray-950 border-gray-800 text-gray-100 text-xs break-all" : "text-xs break-all";
                  
                  const prof = profileRowForNormalizedEmail(adminFirestoreProfiles, client.email);
                  const pt = portalTokenPlain;
                  const lastSeen = formatPtLastSeen(prof?.last_seen_at);
                  const onlinePortal = isProfileProbablyOnline(prof?.last_seen_at);

                  const isExpanded = expandedPortalStatus === client.email;

                  return (
                    <div key={client.email} className="rounded-md border overflow-hidden">
                      <div className={cn("flex flex-wrap items-center justify-between gap-2 p-2.5", theme === "dark" ? "bg-gray-950/40" : "bg-muted/5")}>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className={cn("h-2 w-2 shrink-0 rounded-full", onlinePortal ? "bg-emerald-500" : lastSeen ? "bg-slate-400 dark:bg-slate-500" : "border border-muted-foreground/50 bg-transparent")} />
                          <span className="text-sm font-medium truncate" title={client.email}>
                            {portalClientDisplayName(client) || client.email}
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => setExpandedPortalStatus((prev) => (prev === client.email ? "" : client.email))}
                        >
                          {isExpanded ? "Fechar quadro" : "Abrir quadro"}
                        </Button>
                      </div>

                      {isExpanded && (
                        <div className={cn("border-t p-3.5 space-y-3.5 text-left", theme === "dark" ? "border-gray-700 bg-gray-900/50" : "border-border bg-muted/10")}>
                          <div className="flex flex-wrap gap-2">
                            {onlinePortal ? (
                              <Badge className="bg-emerald-600 text-white text-[10px]">Online (aprox.)</Badge>
                            ) : lastSeen ? (
                              <Badge variant="outline" className="text-[10px]">
                                Fora de linha
                              </Badge>
                            ) : null}
                            <Badge className="bg-violet-700 text-white text-[10px]">Portal</Badge>
                            <Badge className={pt ? "bg-sky-600 text-white text-[10px]" : "bg-slate-500 text-white text-[10px]"}>
                              {pt ? "Com link" : "Sem token"}
                            </Badge>
                            <Badge className={client.is_paid ? "bg-emerald-600 text-white text-[10px]" : "bg-amber-500 text-white text-[10px]"}>
                              {client.is_paid ? "Pago" : "Pag. pendente"}
                            </Badge>
                            <Badge className={client.is_active !== false ? "bg-indigo-600 text-white text-[10px]" : "bg-rose-600 text-white text-[10px]"}>
                              {client.is_active !== false ? "Liberado" : "Bloqueado"}
                            </Badge>
                          </div>

                          <div className="space-y-1 text-xs">
                            {lastSeen ? (
                              <p className="text-[11px] text-muted-foreground">
                                Último acesso: <strong className="text-foreground">{lastSeen}</strong>
                              </p>
                            ) : (
                              <p className="text-[11px] text-muted-foreground">Ainda sem registo de último acesso.</p>
                            )}
                            <p className="text-muted-foreground text-xs">
                              Empresas associadas no portal: <strong>{portalCompaniesCount}</strong> · Disponíveis no escritório: <strong>{officeCompanies.length}</strong>
                            </p>
                            
                            <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-800 space-y-2">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <p className="text-muted-foreground font-semibold flex items-center gap-1.5 text-xs">
                                  <Users className="w-4 h-4 text-indigo-500 shrink-0" />
                                  Utilizadores internos vinculados a este token ({clientInternalStaff.length}):
                                </p>
                                {clientInternalStaff.length > 0 && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-7 px-2.5 text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white font-medium gap-1.5 shrink-0"
                                    onClick={() => {
                                      setPresenceActivityCompanyFilter(client.assigned_company_token);
                                      setPresenceActivityDialogOpen(true);
                                      setExpandedStaffEmailDialog("");
                                      setInternalStaffSearch("");
                                    }}
                                  >
                                    <Users className="w-3.5 h-3.5 shrink-0" />
                                    Gerir equipa
                                  </Button>
                                )}
                              </div>
                              {clientInternalStaff.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground italic pl-5">Nenhum utilizador interno ativo com este token.</p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-5">
                                  {clientInternalStaff.map((staff) => {
                                    const profStaff = profileRowForNormalizedEmail(adminFirestoreProfiles, staff.email);
                                    const lastSeenStaff = formatPtLastSeen(profStaff?.last_seen_at);
                                    const onlineStaff = isProfileProbablyOnline(profStaff?.last_seen_at);
                                    return (
                                      <div
                                        key={staff.email}
                                        className={cn(
                                          "flex items-center justify-between p-2 rounded-lg border text-xs",
                                          theme === "dark" ? "bg-gray-950/40 border-gray-800" : "bg-white border-gray-100 shadow-sm"
                                        )}
                                      >
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", onlineStaff ? "bg-emerald-500" : lastSeenStaff ? "bg-slate-400" : "bg-slate-200")} />
                                            <span className="font-medium truncate text-foreground block" title={staff.email}>
                                              {portalClientDisplayName(staff) || staff.email}
                                            </span>
                                          </div>
                                          <span className="text-[10px] text-muted-foreground block truncate pl-3">{staff.email}</span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 ml-2">
                                          {staff.is_active === false ? (
                                            <Badge className="bg-rose-600 text-white text-[8px] h-4 px-1">Bloqueado</Badge>
                                          ) : (
                                            <Badge className="bg-indigo-600 text-white text-[8px] h-4 px-1">Ativo</Badge>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-1.5 max-w-xl">
                            <Label className="text-[11px] text-muted-foreground">Token da Gestão Contábil</Label>
                            <div className="flex flex-col sm:flex-row gap-2 sm:items-stretch">
                              <Input
                                readOnly
                                value={client.assigned_company_token || ""}
                                placeholder="(não vinculado)"
                                className={cn("min-w-0 flex-1 h-9 text-xs", inputDark)}
                                onFocus={(e) => e.target.select()}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="sm:shrink-0 gap-1.5"
                                disabled={!client.assigned_company_token}
                                onClick={() =>
                                  copyTextToClipboard(client.assigned_company_token || "", {
                                    emptyMessage: "Este cliente não tem token da Gestão Contábil vinculado.",
                                  })
                                }
                              >
                                <Copy className="w-3.5 h-3.5" />
                                Copiar token
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-1.5 max-w-xl">
                            <Label className="text-[11px] text-muted-foreground">Token do portal</Label>
                            <div className="flex flex-col sm:flex-row gap-2 sm:items-stretch">
                              <Input
                                readOnly
                                value={portalTokenPlain}
                                placeholder="(ainda não gerado — use «Gerar token»)"
                                className={cn("min-w-0 flex-1 h-9 text-xs", inputDark)}
                                onFocus={(e) => e.target.select()}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="sm:shrink-0 gap-1.5"
                                disabled={!portalTokenPlain}
                                onClick={() =>
                                  copyTextToClipboard(portalTokenPlain, {
                                    emptyMessage: "Gere um token primeiro (botão «Gerar token»).",
                                  })
                                }
                              >
                                <Copy className="w-3.5 h-3.5" />
                                Copiar token
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-1.5 max-w-xl">
                            <Label className="text-[11px] text-muted-foreground">Link do chat (portal)</Label>
                            <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
                              <Textarea
                                readOnly
                                rows={2}
                                value={portalChatUrl}
                                placeholder="(aparece após gerar o token)"
                                className={cn("min-w-0 flex-1 resize-none text-xs leading-snug py-2", inputLinkDark)}
                                onFocus={(e) => e.target.select()}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="sm:shrink-0 gap-1.5"
                                disabled={!portalChatUrl}
                                onClick={() =>
                                  copyTextToClipboard(portalChatUrl, {
                                    emptyMessage: "Gere o token primeiro para obter o link.",
                                  })
                                }
                              >
                                <Copy className="w-3.5 h-3.5" />
                                Copiar link
                              </Button>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 pt-2">
                            <Button
                              type="button"
                              size="sm"
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                              disabled={patchClientPortalMut.isPending}
                              onClick={async () => {
                                try {
                                  await regeneratePortalTokenForClient(client);
                                  window.alert("Token gerado e guardado. Copie-o na caixa «Token do portal» acima, se precisar.");
                                } catch (e) {
                                  window.alert(e?.message || "Não foi possível gerar o token.");
                                }
                              }}
                            >
                              <KeyRound className="w-4 h-4 mr-1 shrink-0" />
                              Gerar token
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={patchClientPortalMut.isPending}
                              onClick={async () => {
                                try {
                                  let tok = String(client.portal_token || "").trim();
                                  if (!tok) {
                                    tok = await regeneratePortalTokenForClient(client);
                                  }
                                  const url = clientPortalAbsoluteUrl(client, tok);
                                  if (!url) {
                                    window.alert("Não foi possível montar o link do chat. Tente de novo.");
                                    return;
                                  }
                                  const ok = await copyTextToClipboard(url);
                                  window.alert(
                                    ok
                                      ? "Link atualizado nas caixas acima e copiado. Cole no navegador ou envie ao cliente (ex.: WhatsApp)."
                                      : "Link gerado nas caixas acima — use «Copiar link» se não tiver sido copiado automaticamente."
                                  );
                                } catch (e) {
                                  window.alert(e?.message || "Não foi possível gerar o link do chat.");
                                }
                              }}
                            >
                              <Copy className="w-4 h-4 mr-1 shrink-0" />
                              Gerar link do chat
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={portalCompanyDraft?.email === client.email ? "secondary" : "outline"}
                              onClick={() => {
                                if (portalCompanyDraft?.email === client.email) {
                                  setPortalCompanyDraft(null);
                                  return;
                                }
                                const raw = Array.isArray(client.portal_company_ids) ? client.portal_company_ids : [];
                                const ids = raw.map((x) => String(x || "").trim()).filter(Boolean);
                                setPortalCompanyDraft({
                                  email: client.email,
                                  companyIds: ids,
                                  defaultCompanyId: String(client.portal_default_company_id || "").trim(),
                                });
                              }}
                            >
                              <Building2 className="w-4 h-4 mr-1 shrink-0" />
                              Empresas no portal
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setPortalBillingEdit({
                                  fromEmail: client.email,
                                  email: client.email,
                                  client_display_name: portalClientDisplayName(client),
                                  notes: String(client.notes ?? ""),
                                  assigned_company_token: String(client.assigned_company_token ?? ""),
                                })
                              }
                            >
                              <Pencil className="w-4 h-4 mr-1 shrink-0" />
                              Editar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                patchClientMut.mutate({
                                  email: client.email,
                                  patch: { is_paid: !client.is_paid },
                                })
                              }
                            >
                              {client.is_paid ? (
                                <>
                                  <XCircle className="w-4 h-4 mr-1" /> Marcar pendente pagamento
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-4 h-4 mr-1" /> Registrar pagamento
                                </>
                              )}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                patchClientMut.mutate({
                                  email: client.email,
                                  patch: { is_active: client.is_active !== false },
                                })
                              }
                            >
                              {client.is_active === false ? "Liberar acesso" : "Bloquear acesso"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                patchClientMut.mutate({
                                  email: client.email,
                                  patch: { is_deleted: true }
                                });
                              }}
                              disabled={client.assigned_company_token === "CL-FN14-AZ4ZV81Y"}
                            >
                              <Trash2 className="w-4 h-4 mr-1 shrink-0" />
                              Excluir cliente
                            </Button>
                          </div>

                          {portalCompanyDraft?.email === client.email && (
                            <div className={cn("rounded-lg border p-3.5 space-y-3 mt-3 text-left", theme === "dark" ? "border-gray-700 bg-gray-950/70" : "border-muted bg-white")}>
                              <p className="text-xs font-semibold flex items-center gap-2">
                                <Building2 className="w-4 h-4 shrink-0 text-indigo-500" /> Empresas visíveis no portal (só chat)
                              </p>
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Marque os registos da coleção Empresas que este cliente pode usar no chat. A lista abaixo vem dos
                                utilizadores internos com o mesmo ID da empresa. Use «Marcar todas do escritório» para repor tudo
                                após limpezas acidentais.
                              </p>
                              {officeCompanies.length === 0 ? (
                                <p className="text-xs text-amber-600 dark:text-amber-500">
                                  Não há empresas detetadas: confirme que existem utilizadores internos nesta Gestão com o mesmo
                                  vínculo e que já criaram empresas na aba Empresas.
                                </p>
                              ) : (
                                <>
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      onClick={() =>
                                        setPortalCompanyDraft((d) =>
                                          d && normalizeEmail(d.email) === normalizeEmail(client.email)
                                            ? {
                                                ...d,
                                                companyIds: officeCompanies.map((c) => String(c.id || "")),
                                              }
                                            : d
                                        )
                                      }
                                    >
                                      Marcar todas
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        setPortalCompanyDraft((d) =>
                                          d && normalizeEmail(d.email) === normalizeEmail(client.email)
                                            ? { ...d, companyIds: [], defaultCompanyId: "" }
                                            : d
                                        )
                                      }
                                    >
                                      Limpar seleção
                                    </Button>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                                    {officeCompanies.map((co) => {
                                      const isChecked = portalCompanyDraft?.companyIds?.includes(String(co.id || ""));
                                      return (
                                        <label
                                          key={co.id}
                                          className={cn(
                                            "flex items-start gap-2 p-2 rounded border cursor-pointer text-xs",
                                            theme === "dark" ? "border-gray-700 hover:bg-gray-800" : "border-gray-200 hover:bg-gray-50"
                                          )}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={(e) => {
                                              const ids = portalCompanyDraft?.companyIds || [];
                                              if (e.target.checked) {
                                                setPortalCompanyDraft((d) =>
                                                  d && normalizeEmail(d.email) === normalizeEmail(client.email)
                                                    ? { ...d, companyIds: [...ids, String(co.id || "")] }
                                                    : d
                                                );
                                              } else {
                                                setPortalCompanyDraft((d) =>
                                                  d && normalizeEmail(d.email) === normalizeEmail(client.email)
                                                    ? { ...d, companyIds: ids.filter((id) => id !== String(co.id || "")) }
                                                    : d
                                                );
                                              }
                                            }}
                                            className="mt-0.5 shrink-0"
                                          />
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{co.name || "Sem nome"}</p>
                                            <p className="text-muted-foreground truncate">{co.cnpj || co.cpf || "Sem doc"}</p>
                                          </div>
                                        </label>
                                      );
                                    })}
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Empresa pré-fixada no link (opcional)</Label>
                                    <select
                                      value={portalCompanyDraft?.defaultCompanyId || ""}
                                      onChange={(e) =>
                                        setPortalCompanyDraft((d) =>
                                          d && normalizeEmail(d.email) === normalizeEmail(client.email)
                                            ? { ...d, defaultCompanyId: e.target.value }
                                            : d
                                        )
                                      }
                                      className={cn(
                                        "h-9 rounded-md border px-3 text-xs w-full",
                                        theme === "dark" ? "bg-gray-950 border-gray-800" : "bg-white border-gray-200"
                                      )}
                                    >
                                      <option value="">Nenhuma (mostra todas)</option>
                                      {officeCompanies.map((co) => (
                                        <option key={co.id} value={String(co.id || "")}>
                                          {co.name || "Sem nome"} ({co.cnpj || co.cpf || "Sem doc"})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                      onClick={async () => {
                                        try {
                                          await patchClientPortalMut.mutateAsync({
                                            email: client.email,
                                            patch: {
                                              portal_company_ids: portalCompanyDraft?.companyIds || [],
                                              portal_default_company_id: portalCompanyDraft?.defaultCompanyId || "",
                                            },
                                          });
                                          setPortalCompanyDraft(null);
                                          window.alert("Empresas do portal actualizadas com sucesso.");
                                        } catch (e) {
                                          window.alert(e?.message || "Não foi possível guardar as empresas.");
                                        }
                                      }}
                                      disabled={patchClientPortalMut.isPending}
                                    >
                                      Guardar
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setPortalCompanyDraft(null)}
                                    >
                                      Fechar sem guardar
                                    </Button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* Right Column: Presença & Atividade */}
        <div className="lg:col-span-4 space-y-6">
          {/* Card 1: Presença e Atividade */}
          <Card className={cn("p-6 border", theme === "dark" ? "bg-gray-900/80 border-gray-800" : "bg-white border-gray-100 shadow-sm")}>
            <div className="flex items-center justify-between gap-2 border-b pb-4 mb-4 border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-500 shrink-0" />
                <h3 className="font-bold text-base tracking-tight text-foreground">Presença e atividade</h3>
              </div>
              <Button
                type="button"
                size="sm"
                className="shrink-0 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                onClick={() => { setPresenceActivityDialogOpen(true); setExpandedStaffEmailDialog(""); setInternalStaffSearch(""); }}
              >
                Gerir ({allUserEntries.length})
              </Button>
            </div>
            
            {allUserEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Sem atividade de utilizadores registada.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Existem <strong>{allUserEntries.length}</strong> utilizadores ativos no sistema. Clique em <strong>Gerir</strong> para ver presença e atividade.
                </p>
              </div>
            )}
          </Card>

          {/* Dialog Presença e Atividade */}
          <Dialog open={presenceActivityDialogOpen} onOpenChange={(o) => { setPresenceActivityDialogOpen(o); if (!o) { setExpandedStaffEmailDialog(""); setPresenceActivityCompanyFilter(null); setPresenceActivityAccountTypeFilter(null); setPresenceActivityStatusFilter("active"); } }}>
            <DialogContent
              aria-describedby={undefined}
              className={cn(
                "max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 sm:rounded-xl overflow-hidden",
                theme === "dark" ? "border-gray-800 bg-gray-900 text-foreground" : "border-gray-200 bg-white"
              )}
            >
              <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/60">
                <DialogTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-500 shrink-0" />
                  Presença e atividade {presenceActivityCompanyFilter ? "da empresa" : ""} ({filteredPresenceStaff.length})
                </DialogTitle>
              </DialogHeader>
              <div className="px-4 pt-3 pb-2 space-y-3">
                <Input
                  placeholder="Pesquisar por e-mail ou nome…"
                  value={internalStaffSearch}
                  onChange={(e) => setInternalStaffSearch(e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <select
                    value={presenceActivityAccountTypeFilter || ""}
                    onChange={(e) => setPresenceActivityAccountTypeFilter(e.target.value || null)}
                    className={cn("h-8 rounded-md border px-2 text-sm", theme === "dark" ? "bg-gray-950 border-gray-800" : "bg-white border-gray-200")}
                  >
                    <option value="">Todos os tipos</option>
                    <option value="internal">Equipa interna</option>
                    <option value="client">Clientes do portal</option>
                  </select>
                  <select
                    value={presenceActivityStatusFilter || "active"}
                    onChange={(e) => setPresenceActivityStatusFilter(e.target.value)}
                    className={cn("h-8 rounded-md border px-2 text-sm", theme === "dark" ? "bg-gray-950 border-gray-800" : "bg-white border-gray-200")}
                  >
                    <option value="all">Todos os estados</option>
                    <option value="active">Ativos</option>
                    <option value="blocked">Bloqueados</option>
                    <option value="deleted">Excluídos</option>
                  </select>
                  <select
                    value={presenceActivityCompanyFilter || ""}
                    onChange={(e) => setPresenceActivityCompanyFilter(e.target.value || null)}
                    className={cn("h-8 rounded-md border px-2 text-sm", theme === "dark" ? "bg-gray-950 border-gray-800" : "bg-white border-gray-200")}
                  >
                    <option value="">Por empresas</option>
                    {requiredCompanyTokens.map((token) => (
                      <option key={token} value={token}>
                        {tokenToClientNameMap.get(token) || token}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-2">
                {filteredPresenceStaff
                  .filter((entry) => {
                    const q = internalStaffSearch.trim().toLowerCase();
                    if (!q) return true;
                    const name = String(entry.profile?.display_name || entry.profile?.gc_login_username || "");
                    return (
                      normalizeEmail(entry.email||"").includes(q)||String(name||"").toLowerCase().includes(q)
                    );
                  })
                  .map((entry) => {
                    const profile = entry.profile;
                    const client = entry.client;
                    const email = entry.email;
                    const profStaff = profile;
                    const lastSeenStaff = formatPtLastSeen(profStaff?.last_seen_at);
                    const onlineStaff = isProfileProbablyOnline(profStaff?.last_seen_at);
                    const displayName = String(profile?.display_name || profile?.gc_login_username || "Utilizador sem nome");

                    const normalizedKey = normalizeEmail(email);
                    return (
                      <div key={normalizedKey} className="rounded-md border overflow-hidden">
                        <div className={cn("flex flex-wrap items-center justify-between gap-3 p-3", theme === "dark" ? "bg-gray-950/40" : "bg-muted/5")}>
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <span className={cn("h-2.5 w-2.5 mt-1 rounded-full shrink-0 border border-background shadow-sm", onlineStaff ? "bg-emerald-500 animate-pulse" : lastSeenStaff ? "bg-slate-400 dark:bg-slate-500" : "border border-muted-foreground/50 bg-transparent")} />
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-foreground truncate" title={displayName}>
                                  {displayName}
                                </span>

                                {onlineStaff ? (
                                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 text-[9px] px-2 py-0.5 shrink-0 rounded-full font-medium">
                                    Online
                                  </Badge>
                                ) : (
                                  <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700 text-[9px] px-2 py-0.5 shrink-0 rounded-full font-medium">
                                    Offline
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground block truncate">{email}</span>
                              <div className="text-[10.5px] text-muted-foreground pt-0.5">
                                Último acesso: <strong className="font-mono text-foreground font-medium">{lastSeenStaff || "Nunca acedeu"}</strong>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button type="button" size="sm" variant="outline" className="shrink-0"
                              onClick={() => setExpandedStaffEmailDialog((prev) => (prev === normalizedKey ? "" : normalizedKey))}>
                              {expandedStaffEmailDialog === normalizedKey ? "Fechar quadro" : "Abrir quadro"}
                            </Button>
                          </div>
                        </div>
                        {expandedStaffEmailDialog === normalizedKey ? (
                          <div className={cn("border-t p-3 space-y-3", theme === "dark" ? "border-gray-700 bg-gray-900/50" : "border-border bg-muted/10")}>
                            <div className="flex flex-wrap gap-2">
                              {onlineStaff ? <Badge className="bg-emerald-600 text-white text-[10px]">Online (aprox.)</Badge>
                                : lastSeenStaff ? <Badge variant="outline" className="text-[10px]">Fora de linha</Badge> : null}

                              <Badge className={(client?.is_active !== false || !client) ? "bg-indigo-600 text-white text-[10px]" : "bg-rose-600 text-white text-[10px]"}>
                                {(client?.is_active !== false || !client) ? "Liberado" : "Bloqueado"}
                              </Badge>
                            </div>
                            <div className="space-y-1 text-xs">
                              <p className="break-all"><span className="text-muted-foreground">E-mail Firebase:</span>{" "}<strong className="font-mono text-[11px]">{email}</strong></p>
                              {client?.token && <p className="text-muted-foreground">Código interno (CGE): <span className="font-mono text-foreground">{client.token}</span></p>}
                              {lastSeenStaff ? <p className="text-[11px] text-muted-foreground">Último acesso: <strong className="text-foreground">{lastSeenStaff}</strong></p> : <p className="text-[11px] text-muted-foreground">Ainda sem registo de último acesso.</p>}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" size="sm" variant="outline"
                                onClick={() => patchClientMut.mutate({ email: email, patch: { is_master: !(client?.is_master || false) } })}>
                                {(client?.is_master || false) ? "Remover Master" : "Tornar Master"}
                              </Button>
                              <Button type="button" size="sm" variant={(client?.is_active === false) ? "default" : "destructive"}
                                onClick={() => patchClientMut.mutate({ email: email, patch: { is_active: (client?.is_active === false) ? true : false } })}>
                                {(client?.is_active === false) ? "Desbloquear conta" : "Bloquear conta"}
                              </Button>

                              {client?.is_deleted && (
                                <Button type="button" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                                  onClick={() => patchClientMut.mutate({ email: email, patch: { is_active: true, is_deleted: false } })}>
                                  Restaurar dos Excluídos
                                </Button>
                              )}
                              <Button type="button" size="sm" variant="destructive"
                                onClick={() => { setPendingRemove({ email: email, label: String(profile?.display_name || profile?.gc_login_username || email), isPortal: false }); setPresenceActivityDialogOpen(false); }}>
                                <Lock className="w-4 h-4 mr-1" />
                                Remover
                              </Button>
                            </div>
                            <Button type="button" variant="outline"
                              className={cn("w-full sm:w-auto justify-start gap-2 h-auto py-2.5 px-3", theme === "dark" ? "border-gray-700 bg-gray-950/80 hover:bg-gray-900" : "")}
                              onClick={() => { setTabEditDialogEmail(email); setPresenceActivityDialogOpen(false); }}>
                              <LayoutGrid className="w-5 h-5 text-violet-500 shrink-0" />
                              <span className="text-left">
                                <span className="block text-sm font-medium">Permissões de edição por aba</span>
                                <span className="block text-[11px] text-muted-foreground font-normal">Dados partilhados na Gestão Contábil / INOV.</span>
                              </span>
                            </Button>
                            {client && (
                              <p className="text-xs text-muted-foreground">
                                Master {(client.is_master || false) ? "SIM" : "NÃO"} · pode editar todas as abas do escritório,
                                exceto <strong className="text-foreground">Configurações</strong> e{" "}
                                <strong className="text-foreground">Administrador</strong> (não é admin global).
                              </p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                {filteredPresenceStaff.filter((entry) => { const q = internalStaffSearch.trim().toLowerCase(); if (!q) return false; const name = String(entry.profile?.display_name || entry.profile?.gc_login_username || ""); return !(normalizeEmail(entry.email||"").includes(q)||String(name||"").toLowerCase().includes(q)); }).length === filteredPresenceStaff.length && internalStaffSearch.trim() ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum utilizador encontrado.</p>
                ) : null}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog
        open={Boolean(tabEditDialogEmail)}
        onOpenChange={(open) => {
          if (!open) setTabEditDialogEmail("");
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className={cn(
            "max-w-3xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 sm:rounded-xl",
            theme === "dark"
              ? "border-gray-800 bg-gray-900 text-foreground"
              : "border-gray-200 bg-white"
          )}
        >
          {tabEditClient ? (
            <>
              <div
                className={cn(
                  "p-5 sm:p-6 space-y-3 shrink-0 border-b",
                  theme === "dark" ? "border-gray-800" : "border-gray-200"
                )}
              >
                <DialogHeader className="space-y-3 text-left">
                  <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight pr-8">
                    <LayoutGrid className="w-7 h-7 text-violet-500 shrink-0" />
                    Edição por aba (permissões)
                  </DialogTitle>
                  <p
                    className={cn(
                      "text-sm leading-relaxed max-w-3xl",
                      theme === "dark" ? "text-gray-400" : "text-gray-600"
                    )}
                  >
                    Apenas abas com <strong className="text-foreground">dados partilhados</strong> aparecem aqui:{" "}
                    <strong className="text-foreground">Dashboard</strong>, <strong className="text-foreground">Empresas</strong>,{" "}
                    <strong className="text-foreground">Calendário</strong> e{" "}
                    <strong className="text-foreground">Configurações</strong> (gestão comum). Marque{" "}
                    <strong className="text-emerald-600 dark:text-emerald-400">Pode editar</strong> onde esta pessoa pode
                    alterar esses dados partilhados. <strong className="text-foreground">Chat, Recados,
                    Baixa e Saída, Onboarding, Links úteis</strong> e similares são <strong className="text-foreground">uso
                    livre</strong> — quem tem acesso ao sistema edita à vontade, sem lista aqui. O{" "}
                    <strong className="text-foreground">administrador</strong> tem sempre edição total.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Identificação na Gestão:{" "}
                    <strong className="text-foreground">
                      {portalClientDisplayName(tabEditClient) || "Nome não configurado"}
                    </strong>
                  </p>
                </DialogHeader>
              </div>

              <div
                className={cn(
                  "p-5 sm:p-6 overflow-y-auto flex-1 min-h-0 space-y-4",
                  theme === "dark" ? "bg-gray-900/90" : "bg-muted/15"
                )}
              >
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                  Marque por aba
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {TAB_EDIT_MODAL_OPTIONS.map((tab) => {
                    const effective = resolveTabEditAccessForEntry(tabEditClient);
                    const canEdit = effective[tab.key] === true;
                    return (
                      <label
                        key={`${tabEditClient.email}-${tab.key}-edit-modal`}
                        className={cn(
                          "flex items-start gap-2 text-xs cursor-pointer rounded-lg border p-3 transition-colors",
                          theme === "dark"
                            ? "border-gray-800 bg-gray-950/60 hover:bg-gray-950"
                            : "border-gray-200 bg-white hover:bg-muted/30"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={canEdit}
                          onChange={(e) => {
                            const nextVal = e.target.checked;
                            const base = resolveTabEditAccessForEntry(tabEditClient);
                            patchClientMut.mutate({
                              email: tabEditClient.email,
                              patch: {
                                tab_edit_access: {
                                  ...base,
                                  [tab.key]: nextVal,
                                },
                              },
                            });
                          }}
                        />
                        <span>
                          <span className="font-medium block text-foreground">{tab.label}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {canEdit ? "Pode editar" : "Só visualizar"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Resumo: as caixas acima atualizam também as permissões legadas (Configurações / Calendário / Empresas) no
                  documento do utilizador.
                </p>
              </div>

              <DialogFooter
                className={cn(
                  "p-4 sm:p-5 shrink-0 border-t sm:justify-end gap-2",
                  theme === "dark" ? "border-gray-800 bg-gray-950/40" : "border-gray-200 bg-muted/20"
                )}
              >
                <Button
                  type="button"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                  onClick={() => setTabEditDialogEmail("")}
                >
                  <ListChecks className="w-4 h-4" />
                  Concluído
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">Utilizador não encontrado ou foi removido.</p>
              <Button type="button" variant="outline" onClick={() => setTabEditDialogEmail("")}>
                Fechar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(portalBillingEdit)}
        onOpenChange={(open) => {
          if (!open) setPortalBillingEdit(null);
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className={cn(
            "max-w-md",
            theme === "dark"
              ? "border-gray-800 bg-gray-900 text-foreground"
              : "border-gray-200 bg-white"
          )}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-indigo-500 shrink-0" />
              Editar cliente (portal / pagamento)
            </DialogTitle>
            <p className="text-xs text-muted-foreground text-left pt-2">
              O nome abaixo é o que aparece na lista Gestão portal; vínculos e conta técnica podem ser ajustados abaixo.
            </p>
          </DialogHeader>
          {portalBillingEdit ? (
            <>
              <div className="space-y-4 py-2">
                <div className="space-y-1">
                  <Label className="text-xs">Nome para exibir na lista</Label>
                  <Input
                    value={portalBillingEdit.client_display_name}
                    onChange={(e) =>
                      setPortalBillingEdit((prev) =>
                        prev ? { ...prev, client_display_name: e.target.value } : prev
                      )
                    }
                    placeholder="Ex.: Escritório Inov Centro"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Login Firebase (uso técnico; não aparece na lista Gestão)</Label>
                  <Input
                    type="email"
                    value={portalBillingEdit.email}
                    onChange={(e) =>
                      setPortalBillingEdit((prev) =>
                        prev ? { ...prev, email: e.target.value } : prev
                      )
                    }
                    placeholder="cliente@sua-org.com.br"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Token escritório cliente (mesmo valor do vínculo ID empresa da equipa)</Label>
                  <Input
                    value={String(portalBillingEdit.assigned_company_token || "")}
                    onChange={(e) =>
                      setPortalBillingEdit((prev) =>
                        prev ? { ...prev, assigned_company_token: e.target.value } : prev
                      )
                    }
                    placeholder="Ex.: EMP-…"
                    className={cn(
                      "h-10 text-sm",
                      theme === "dark" ? "bg-gray-950 border-gray-800" : ""
                    )}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Observações internas</Label>
                  <Textarea
                    rows={4}
                    value={portalBillingEdit.notes}
                    onChange={(e) =>
                      setPortalBillingEdit((prev) =>
                        prev ? { ...prev, notes: e.target.value } : prev
                      )
                    }
                    placeholder="Notas apenas para gestão contábil (opcional)"
                    className={cn(
                      "resize-y min-h-[88px]",
                      theme === "dark" ? "bg-gray-950 border-gray-800" : ""
                    )}
                  />
                </div>

                {/* Utilizadores internos desta empresa */}
                {portalBillingEdit.assigned_company_token ? (
                  <div className="space-y-3 border-t pt-4">
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Utilizadores internos desta empresa
                    </h4>
                    {(() => {
                      const clientToken = String(portalBillingEdit.assigned_company_token || "").trim();
                      const staffOfThisClient = internalStaff.filter((c) => {
                        const ct = String(c.assigned_company_token || "").trim();
                        return ct === clientToken;
                      });
                      if (staffOfThisClient.length === 0) {
                        return (
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Nenhum utilizador interno vinculado a esta empresa ainda.
                          </p>
                        );
                      }
                      return (
                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                          {staffOfThisClient.map((client) => {
                            const profStaff = profileRowForNormalizedEmail(adminFirestoreProfiles, client.email);
                            const lastSeenStaff = formatPtLastSeen(profStaff?.last_seen_at);
                            const onlineStaff = isProfileProbablyOnline(profStaff?.last_seen_at);
                            const isExpanded = expandedClientInternalStaffEmail === client.email;
                            return (
                              <div key={client.email} className="rounded-md border overflow-hidden border-border/60">
                                <div className={cn("flex flex-wrap items-center justify-between gap-2 p-2", theme === "dark" ? "bg-gray-950/30" : "bg-muted/5")}>
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={cn("h-2 w-2 shrink-0 rounded-full", onlineStaff ? "bg-emerald-500" : lastSeenStaff ? "bg-slate-400 dark:bg-slate-500" : "border border-muted-foreground/50 bg-transparent")} />
                                    <span className="text-xs font-medium truncate" title={client.email}>{portalClientDisplayName(client) || client.email}</span>
                                  </div>
                                  <Button type="button" size="sm" variant="outline" className="shrink-0 h-7 text-[11px]"
                                    onClick={() => setExpandedClientInternalStaffEmail((prev) => (prev === client.email ? "" : client.email))}>
                                    {isExpanded ? "Fechar" : "Abrir"}
                                  </Button>
                                </div>
                                {isExpanded ? (
                                  <div className={cn("border-t p-2 space-y-2 text-xs", theme === "dark" ? "border-gray-700 bg-gray-900/30" : "border-border bg-muted/5")}>
                                    <div className="flex flex-wrap gap-1">
                                      {onlineStaff ? <Badge className="bg-emerald-600 text-white text-[9px]">Online</Badge> : lastSeenStaff ? <Badge variant="outline" className="text-[9px]">Fora</Badge> : null}
                                      <Badge className={client.is_active !== false ? "bg-indigo-600 text-white text-[9px]" : "bg-rose-600 text-white text-[9px]"}>{client.is_active !== false ? "Liberado" : "Bloqueado"}</Badge>
                                    </div>
                                    <p className="break-all text-muted-foreground"><strong className="font-mono text-[10px] text-foreground">{client.email}</strong></p>
                                    <div className="flex flex-wrap gap-1">
                                      <Button type="button" size="sm" variant="outline" className="h-6 text-[10px]"
                                        onClick={() => patchClientMut.mutate({ email: client.email, patch: { is_active: client.is_active === false ? true : false } })}>
                                        {client.is_active === false ? "Desbloquear" : "Bloquear"}
                                      </Button>
                                      <Button type="button" size="sm" variant="destructive" className="h-6 text-[10px]"
                                        onClick={() => setPendingRemove({ email: client.email, label: portalClientDisplayName(client) || client.email, isPortal: false })}>
                                        Remover
                                      </Button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
              </div>
              <DialogFooter className="gap-2 flex-col-reverse sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setPortalBillingEdit(null)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  disabled={savePortalBillingMut.isPending}
                  onClick={() => {
                    savePortalBillingMut.mutate({
                      fromEmail: portalBillingEdit.fromEmail,
                      draft: portalBillingEdit,
                    });
                  }}
                >
                  {savePortalBillingMut.isPending ? "A guardar…" : "Guardar alterações"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(pendingRemove)} onOpenChange={(o) => { if (!o) setPendingRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRemove?.isPortal ? "Eliminar cliente" : "Remover utilizador interno"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemove?.isPortal
                ? `Eliminar "${pendingRemove?.label}" da Gestão Contábil? Remove o registo portal/pagamentos. A conta Firebase continua a existir até apagá-la no console.`
                : `Remover definitivamente "${pendingRemove?.label}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (!pendingRemove) return;
                patchClientMut.mutate({
                  email: pendingRemove.email,
                  patch: { is_deleted: true }
                }, {
                  onSuccess() {
                    if (portalBillingEdit && normalizeEmail(portalBillingEdit.fromEmail) === normalizeEmail(pendingRemove.email)) setPortalBillingEdit(null);
                    if (portalCompanyDraft && normalizeEmail(portalCompanyDraft.email) === normalizeEmail(pendingRemove.email)) setPortalCompanyDraft(null);
                  },
                });
                setPendingRemove(null);
              }}
            >
              {pendingRemove?.isPortal ? "Eliminar" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

