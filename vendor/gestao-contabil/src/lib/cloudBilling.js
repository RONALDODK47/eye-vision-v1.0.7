/**
 * Liga utilizadores internos à conta cliente (mesmo assigned_company_token) para efeitos de pagamento e portal.
 */

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function findBillingClientEntry(config, assignedCompanyToken) {
  const t = String(assignedCompanyToken || "").trim();
  if (!t || !config?.clients || typeof config.clients !== "object") return null;
  const matches = [];
  Object.values(config.clients).forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    if (String(entry.account_type || "").toLowerCase() !== "client") return;
    if (String(entry.assigned_company_token || "").trim() !== t) return;
    matches.push(entry);
  });
  matches.sort((a, b) => normalizeEmail(a.email).localeCompare(normalizeEmail(b.email)));
  return matches[0] || null;
}

export function billingIsPaidActive(entry) {
  return Boolean(entry && entry.is_paid && entry.is_active);
}
