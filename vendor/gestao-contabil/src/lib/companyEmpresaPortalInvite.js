import { APP_VERSION } from "@/config/appRelease";
import { COMPANY_ACCESS_TOKEN_KEY } from "@/lib/AuthContext";
import { CLOUD_ADMIN_EMAIL } from "@/lib/cloudAccessConstants";

/** Nome amigável no link/UI: grupo se existir, senão nome da empresa. */
export function portalEmpresaDisplayLabelFromCompanyDoc(companyDoc) {
  const co = companyDoc && typeof companyDoc === "object" ? companyDoc : {};
  const group = String(co.group_name || "").trim();
  if (group) return group;
  return String(co.name || "").trim() || "Empresa";
}

const SLUG_MAX = 48;

/**
 * Base para o segmento de URL (minúsculas, hífens). Não garante unicidade.
 */
export function portalEmpresaSlugBaseFromLabel(displayLabel) {
  const raw = String(displayLabel || "")
    .trim()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const folded = raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  const base = folded.slice(0, SLUG_MAX) || "empresa";
  return base;
}

export function normalizeEmailPortalInvite(email) {
  return String(email || "").trim().toLowerCase();
}

/** Mesmo vínculo que a equipa (sessão actual ou primeira token configurada). */
export function deriveAssignedOfficeTokenForInvite(clientEntry, requiredCompanyTokensList) {
  const fromStaff = String(clientEntry?.assigned_company_token || "").trim();
  if (fromStaff) return fromStaff;
  const stored =
    typeof window !== "undefined" ? String(localStorage.getItem(COMPANY_ACCESS_TOKEN_KEY) || "").trim() : "";
  if (stored) return stored;
  const list = Array.isArray(requiredCompanyTokensList) ? requiredCompanyTokensList : [];
  return String(list[0] || "").trim();
}

/**
 * Link do convite empresa: prefere `/ClienteEmpresa/{slug}` quando existir slug na config;
 * mantém legado `/ClientPortal?tipo=empresa&company=…` como fallback.
 */
export function companyEmpresaPortalAbsoluteUrl(companyFirestoreId, inviteTokenRaw, staffUid, portalPublicSlug = "") {
  if (typeof window === "undefined") return "";
  const tok = String(inviteTokenRaw || "").trim();
  const cid = String(companyFirestoreId || "").trim();
  if (!tok || !cid) return "";
  const slug = String(portalPublicSlug || "").trim();
  const suid = String(staffUid || "").trim();
  if (slug) {
    const q = new URLSearchParams({ token: tok, v: APP_VERSION });
    if (suid) q.set("staff", suid);
    return `${window.location.origin}/ClienteEmpresa/${encodeURIComponent(slug)}?${q.toString()}`;
  }
  const q = new URLSearchParams({
    token: tok,
    company: cid,
    tipo: "empresa",
    v: APP_VERSION,
  });
  if (suid) q.set("staff", suid);
  return `${window.location.origin}/ClientPortal?${q.toString()}`;
}

export function collectPortalPeersForOfficeToken(coreClients, assignedToken) {
  const tkAssign = String(assignedToken || "").trim();
  return coreClients.filter(
    (c) =>
      String(c.account_type || "user").toLowerCase() !== "client" &&
      String(c.assigned_company_token || "").trim() === tkAssign &&
      normalizeEmailPortalInvite(c.email) !== CLOUD_ADMIN_EMAIL
  );
}

/** Equipa no chat para o convite empresa (sector assignees ou pares do escritório). */
export function portalStaffRowsForEmpresaDocument(companyDoc, coreClients, profilesAll, officeToken, companyFirestoreId) {
  const cid = String(companyFirestoreId || "").trim();
  const assigneeRows = Array.isArray(companyDoc?.portal_sector_assignees) ? companyDoc.portal_sector_assignees : [];
  const portal_staff = [];
  if (assigneeRows.length > 0) {
    for (const row of assigneeRows) {
      const id = String(row?.uid || "").trim();
      if (!id) continue;
      const sector = String(row?.sector || "").trim();
      portal_staff.push({ uid: id, sector, company_ids: [cid] });
    }
    return portal_staff;
  }
  const peerEntries = collectPortalPeersForOfficeToken(coreClients, officeToken);
  const want = new Set(peerEntries.map((c) => normalizeEmailPortalInvite(c.email)));
  for (const p of profilesAll || []) {
    const em = normalizeEmailPortalInvite(p?.email);
    const id = String(p?.uid || "").trim();
    if (!id || !em || !want.has(em)) continue;
    portal_staff.push({ uid: id, sector: "", company_ids: [cid] });
  }
  return portal_staff;
}
