import { emptyTabEditAccess } from "@/lib/tabEditAccess";

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
};

export function normalizeTabAccessForProvisioning(input) {
  const source = input && typeof input === "object" ? input : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_TAB_ACCESS).map(([key, fallback]) => [
      key,
      key in source ? Boolean(source[key]) : fallback,
    ])
  );
}

export function staffAutoProvisionDefaults(assignedCompanyToken) {
  return {
    account_type: "user",
    is_master: false,
    is_active: true,
    is_paid: false,
    assigned_company_token: String(assignedCompanyToken || "").trim(),
    tab_access: { ...DEFAULT_TAB_ACCESS },
    tab_edit_access: emptyTabEditAccess(),
    portal_enabled: false,
    notes: "Conta criada automaticamente no primeiro login com ID da empresa.",
  };
}
