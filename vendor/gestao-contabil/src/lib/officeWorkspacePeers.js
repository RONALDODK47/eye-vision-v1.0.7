import { CLOUD_ADMIN_EMAIL } from "@/lib/cloudAccessConstants";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/**
 * UIDs Firebase dos utilizadores internos com o mesmo `assigned_company_token` (Gestão Contábil),
 * para reunir empresas e tarefas do escritório na interface.
 *
 * Combina emails em `config.clients` com `UserProfile`; o utilizador atual entra sempre se tiver UID.
 */
export function collectOfficePeerFirebaseUids({
  config,
  profiles,
  userUid,
  userEmail,
  assignedCompanyToken,
}) {
  const tk = String(assignedCompanyToken || "").trim();
  const myUid = String(userUid || "").trim();
  const uids = new Set();
  if (myUid) uids.add(myUid);

  if (!tk) {
    return Array.from(uids);
  }

  const clients =
    config?.clients && typeof config.clients === "object"
      ? Object.values(config.clients)
      : [];

  const peerEmails = new Set();
  const selfEm = normalizeEmail(userEmail);
  if (selfEm) peerEmails.add(selfEm);

  const adminEm = normalizeEmail(CLOUD_ADMIN_EMAIL);

  for (const c of clients) {
    if (!c || typeof c !== "object") continue;
    if (String(c.account_type || "user").toLowerCase() === "client") continue;
    if (String(c.assigned_company_token || "").trim() !== tk) continue;
    const em = normalizeEmail(c.email);
    if (!em || em === adminEm) continue;
    peerEmails.add(em);
  }

  for (const p of profiles || []) {
    const em = normalizeEmail(p?.email);
    const id = String(p?.uid || "").trim();
    if (!id || !em || !peerEmails.has(em)) continue;
    uids.add(id);
  }

  return Array.from(uids);
}

/**
 * Empresas visíveis no escritório (token CL-*) ou só do criador; exclui lixeira.
 */
export function filterCompaniesForOfficeScope(companies, { userUid, officeToken } = {}) {
  const userOfficeToken = String(officeToken || "").trim();
  const currentUserUid = String(userUid || "").trim();
  return (Array.isArray(companies) ? companies : []).filter((company) => {
    if (company?.is_deleted === true) return false;
    const companyToken = String(company.assigned_company_token || "").trim();
    if (companyToken) return userOfficeToken === companyToken;
    return String(company.uid || "").trim() === currentUserUid;
  });
}

/** Junta várias chamadas indexadas por `uid` deduplicando por documento (`id`). */
export async function mergeIndexedDocs(listFn, uidList) {
  const uids = Array.from(new Set(uidList.filter(Boolean)));
  if (uids.length === 0) return [];
  if (uids.length === 1) {
    const rows = await listFn(uids[0]);
    return Array.isArray(rows) ? rows : [];
  }
  const buckets = await Promise.all(uids.map((u) => listFn(u)));
  const map = new Map();
  for (const rows of buckets) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const id = String(row?.id || "").trim();
      if (id && !map.has(id)) map.set(id, row);
    }
  }
  return Array.from(map.values());
}
