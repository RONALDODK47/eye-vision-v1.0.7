/** Escritório INOV — registo canónico na Gestão Contábil (aba Administrador). */
export const INOV_OFFICE_EMAIL = "inov-b561bde9fd08@portal.gc.local";
export const INOV_OFFICE_TOKEN = "CL-FN14-AZ4ZV81Y";
export const INOV_PORTAL_TOKEN = "CL-ZU39-4EW1BZQ7";
export const INOV_COMPANY_ID = "R1nrCcMtOoxwdBZ5LJvg";

export function isInovOfficeClient(entry) {
  if (!entry || typeof entry !== "object" || entry.is_deleted) return false;
  const em = String(entry.email || "").trim().toLowerCase();
  if (em === INOV_OFFICE_EMAIL) return true;
  if (String(entry.assigned_company_token || "").trim() === INOV_OFFICE_TOKEN) return true;
  return String(entry.client_display_name || "").trim().toUpperCase() === "INOV";
}

export function buildInovOfficeClientSeed() {
  return {
    portal_enabled: true,
    account_type: "client",
    client_display_name: "INOV",
    email: INOV_OFFICE_EMAIL,
    assigned_company_token: INOV_OFFICE_TOKEN,
    portal_token: INOV_PORTAL_TOKEN,
    is_deleted: false,
    gc_chat_only_client: false,
    is_master: false,
    is_paid: true,
    is_active: true,
    notes: "",
    portal_mode: "chat_only",
    portal_only_chat: true,
    portal_staff: [],
    portal_staff_uids: [],
    allow_settings: false,
    allow_pricing_edit: false,
    allow_company_create: false,
    allow_task_create: false,
    allow_task_edit: false,
    allow_calendar_edit: false,
    branding: {
      primary_color: "#ff0000",
      secondary_color: "#ff0000",
      logo_bg_color: "#f8f7f7",
      theme: "light",
      logo_url: "",
      background_image: "",
      card_color: "",
      sidebar_color: "",
    },
    tab_access: {
      Dashboard: true,
      Onboarding: true,
      Companies: true,
      LoanControl: true,
      CalendarManagement: true,
      Exits: true,
      Chat: true,
      Excel: true,
      Notices: true,
      UsefulSites: true,
      AppSettings: true,
      EcdEcfValidator: true,
    },
    tab_edit_access: {
      Dashboard: false,
      Companies: false,
      CalendarManagement: false,
      AppSettings: false,
    },
  };
}

/** Patch para `upsertClient` — repõe INOV no Firestore quando sumiu do mapa `clients`. */
export function buildInovOfficeUpsertPatch() {
  const seed = buildInovOfficeClientSeed();
  const { email: _email, ...patch } = seed;
  return patch;
}

export function mergeInovOfficeSeed(config, { forAdmin = false } = {}) {
  if (!forAdmin) return config;
  const base = config && typeof config === "object" ? config : { id: "config", clients: {} };
  const clients = base.clients && typeof base.clients === "object" ? { ...base.clients } : {};
  if (Object.values(clients).some(isInovOfficeClient)) return base;

  clients[INOV_OFFICE_EMAIL] = buildInovOfficeClientSeed();
  const companyPortals =
    base.company_portals && typeof base.company_portals === "object"
      ? { ...base.company_portals }
      : {};
  if (!companyPortals[INOV_COMPANY_ID]) {
    companyPortals[INOV_COMPANY_ID] = {
      portal_token: INOV_OFFICE_TOKEN,
      portal_enabled: true,
      name: "INOV",
    };
  }

  const tokenSet = new Set(
    [
      ...(Array.isArray(base.company_access_tokens) ? base.company_access_tokens : []),
      String(base.company_access_token || "").trim(),
      INOV_OFFICE_TOKEN,
    ].filter(Boolean)
  );

  return {
    ...base,
    clients,
    company_portals: companyPortals,
    company_access_tokens: Array.from(tokenSet),
  };
}
