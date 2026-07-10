/**
 * Chave MinIO isolada por token: {token}/{companySlug}/{extratoId}.pdf
 * (puro — sem SDK; usado no servidor e em testes)
 */
function sanitizeSegment(value) {
  return String(value || '')
    .trim()
    .replace(/\.\./g, '_')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^\.+|\.+$/g, '_')
    .slice(0, 120);
}

export function buildExtratoPdfKey(officeToken, companySlug, extratoId) {
  const tok = sanitizeSegment(officeToken) || 'token';
  const slug = sanitizeSegment(companySlug) || 'company';
  const id = sanitizeSegment(extratoId) || 'id';
  return `${tok}/${slug}/${id}.pdf`;
}
