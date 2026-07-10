import { eachSectorResponsibleValue } from "@/lib/companySectorResponsibles";

/** Valor interno do filtro «sem responsável em nenhum setor». */
export const FILTER_RESPONSIBLE_NONE = "__sem_responsavel__";

/**
 * @param {string} filterValue
 * @param {Record<string, unknown>} company objeto empresa (Firestore)
 */
export function companyMatchesResponsibleFilter(filterValue, company) {
  const values = eachSectorResponsibleValue(company);
  if (filterValue === "all") return true;
  if (filterValue === FILTER_RESPONSIBLE_NONE) {
    return values.length === 0;
  }
  return values.includes(filterValue);
}
