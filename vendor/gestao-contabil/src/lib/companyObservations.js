/** Chave canônica mês/ano para observações mensais (Firestore). */
export function observationPeriodKey(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return "";
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * Observação mensal só do mês pedido (não repete em outros meses).
 * Não usa mais o campo legado `notes_monthly` na listagem — só no formulário na primeira migração.
 */
export function getMonthlyNote(company, year, month) {
  if (!company) return "";
  const key = observationPeriodKey(year, month);
  if (!key) return "";
  const map = company.monthly_notes;
  if (map && typeof map === "object" && Object.prototype.hasOwnProperty.call(map, key)) {
    return String(map[key] ?? "");
  }
  return "";
}

/**
 * Observação anual só do ano pedido.
 */
export function getAnnualNote(company, year) {
  if (!company) return "";
  const y = String(year);
  const map = company.annual_notes;
  if (map && typeof map === "object" && Object.prototype.hasOwnProperty.call(map, y)) {
    return String(map[y] ?? "");
  }
  return "";
}

/** Legado: texto único `notes_monthly` (antes do mapa). Só para pré-preencher o mês corrente ao abrir o formulário. */
export function getLegacySingleMonthlyNote(company) {
  if (!company) return "";
  const raw = company.notes_monthly;
  return raw != null ? String(raw) : "";
}

export function hasStructuredMonthlyNotes(company) {
  const map = company?.monthly_notes;
  return map && typeof map === "object" && Object.keys(map).length > 0;
}
