/** E-mails autorizados a entrar usando o próprio Gmail (atalho exclusivo gestão/admin). */

export function normalizeLoginEmail(email) {
  return String(email || "").trim().toLowerCase();
}

const ADMIN_IDENTIFIER_EMAIL_SET = new Set([
  normalizeLoginEmail("ronaldojunior.gyn@gmail.com"),
  normalizeLoginEmail("ronaldojunior.gyn@usuario.local"),
  normalizeLoginEmail("ronaldojunior.gyn.emergencia@usuario.local"),
]);

export function isAdminLoginEmailIdentifier(identifier) {
  const raw = String(identifier || "").trim();
  const e = normalizeLoginEmail(raw);
  return ADMIN_IDENTIFIER_EMAIL_SET.has(e);
}

export function usernameGateBypassForEmail(profileEmail) {
  return ADMIN_IDENTIFIER_EMAIL_SET.has(normalizeLoginEmail(profileEmail || ""));
}
