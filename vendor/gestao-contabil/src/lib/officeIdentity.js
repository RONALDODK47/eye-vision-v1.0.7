import { COMPANY_ACCESS_TOKEN_KEY } from "@/lib/AuthContext";

export function readStoredCompanyAccessToken() {
  if (typeof window === "undefined") return "";
  return String(localStorage.getItem(COMPANY_ACCESS_TOKEN_KEY) || "").trim();
}

/**
 * Token do escritório activo na sessão (localStorage > entrada cloud do utilizador).
 */
export function resolveActiveOfficeToken(clientEntry) {
  const stored = readStoredCompanyAccessToken();
  if (stored) return stored;
  return String(clientEntry?.assigned_company_token || clientEntry?.portal_token || "").trim();
}

/**
 * Nome da empresa dona do token (para cabeçalho e identificação visual).
 */
export function resolveOfficeDisplayName(config, token, clientEntry) {
  const tok = String(token || "").trim();
  if (!tok) return "";

  const brandingMap =
    config?.branding_by_token && typeof config.branding_by_token === "object"
      ? config.branding_by_token
      : {};
  const branding = brandingMap[tok];
  if (branding && typeof branding === "object") {
    const fromBranding = String(branding.office_display_name || "").trim();
    if (fromBranding) return fromBranding;
  }

  const offices =
    config?.eye_vision_offices && typeof config.eye_vision_offices === "object"
      ? config.eye_vision_offices
      : {};
  const officeName = String(offices[tok]?.name || "").trim();
  if (officeName) return officeName;

  const clients = config?.clients && typeof config.clients === "object" ? config.clients : {};
  for (const entry of Object.values(clients)) {
    if (!entry || typeof entry !== "object" || entry.is_deleted) continue;
    const assigned = String(entry.assigned_company_token || "").trim();
    const portal = String(entry.portal_token || "").trim();
    if (assigned !== tok && portal !== tok) continue;
    const name = String(
      entry.client_display_name || entry.display_name || entry.gc_login_username || ""
    ).trim();
    if (name && name.toLowerCase() !== "utilizador" && name.toLowerCase() !== "utilizador sem nome") {
      return name;
    }
  }

  const portals =
    config?.company_portals && typeof config.company_portals === "object"
      ? config.company_portals
      : {};
  for (const block of Object.values(portals)) {
    if (!block || typeof block !== "object") continue;
    const pt = String(block.portal_token || "").trim();
    const ot = String(block.office_access_token || "").trim();
    if (pt !== tok && ot !== tok) continue;
    const label = String(block.portal_display_label || "").trim();
    if (label) return label;
  }

  if (clientEntry && typeof clientEntry === "object") {
    const selfTok =
      String(clientEntry.assigned_company_token || "").trim() ||
      String(clientEntry.portal_token || "").trim();
    if (selfTok === tok) {
      const selfName = String(
        clientEntry.client_display_name || clientEntry.display_name || clientEntry.gc_login_username || ""
      ).trim();
      if (selfName) return selfName;
    }
  }

  return tok;
}
