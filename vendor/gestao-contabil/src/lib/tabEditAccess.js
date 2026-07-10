/**
 * Só estas abas têm dados/partilha de equipa e precisam de «Pode editar» na Gestão.
 * Chat e restantes (Excel, etc.) são livres para quem tem acesso — sem toggle aqui.
 */
export const TAB_EDIT_PAGE_KEYS = [
  "Dashboard",
  "Companies",
  "CalendarManagement",
  "AppSettings",
  "LoanControl",
];

export function emptyTabEditAccess() {
  return Object.fromEntries(TAB_EDIT_PAGE_KEYS.map((k) => [k, false]));
}

export function normalizeTabEditAccess(raw) {
  const defaults = emptyTabEditAccess();
  const src = raw && typeof raw === "object" ? raw : {};
  return Object.fromEntries(
    Object.entries(defaults).map(([key, def]) => [key, key in src ? Boolean(src[key]) : def])
  );
}

/**
 * Sem `tab_edit_access` gravado no Firestore: todas as abas partilhadas ficam só leitura
 * até o administrador marcar «Pode editar» explicitamente.
 */
export function inferTabEditAccessFromLegacy(_entry) {
  return emptyTabEditAccess();
}

/** Valor efetivo para o utilizador (Firestore explícito ou inferência legada). */
export function resolveTabEditAccessForEntry(entry) {
  if (!entry || typeof entry !== "object") return emptyTabEditAccess();
  const raw = entry.tab_edit_access;
  if (raw && typeof raw === "object" && Object.keys(raw).length > 0) {
    return normalizeTabEditAccess(raw);
  }
  return inferTabEditAccessFromLegacy(entry);
}

/** Mantém allow_* alinhados com as abas que ainda os usam no código legado. */
export function syncLegacyAllowFlagsFromTabEdit(tabEdit) {
  const t = normalizeTabEditAccess(tabEdit);
  const companies = Boolean(t.Companies);
  return {
    allow_settings: Boolean(t.AppSettings),
    allow_calendar_edit: Boolean(t.CalendarManagement),
    allow_company_create: companies,
    allow_task_create: companies,
    allow_task_edit: companies,
  };
}
