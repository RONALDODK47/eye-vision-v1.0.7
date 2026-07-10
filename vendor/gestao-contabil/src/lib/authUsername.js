export function normalizeUsername(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".");
  const sanitized = raw.replace(/[^a-z0-9._-]/g, "");
  return sanitized.replace(/\.{2,}/g, ".");
}

export function identifierToAuthEmail(identifier) {
  const raw = String(identifier || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("@")) return raw;
  const username = normalizeUsername(raw);
  if (!username) return "";
  return `${username}@usuario.local`;
}

export function authEmailToUsername(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!value) return "";
  if (value.endsWith("@usuario.local")) {
    return value.slice(0, -"@usuario.local".length);
  }
  const local = value.split("@")[0] || "";
  return normalizeUsername(local);
}
