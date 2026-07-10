/** Campos gravados na empresa para responsáveis internos por setor (aba Empresas). */
export const COMPANY_SECTOR_RESPONSIBLE_DEFS = [
  {
    field: "fiscal_responsible",
    short: "Fisc.",
    label: "Responsável fiscal",
  },
  {
    field: "payroll_responsible",
    short: "DP",
    label: "Departamento pessoal",
  },
  {
    field: "accounting_responsible",
    short: "Cont.",
    label: "Responsável contábil",
  },
  {
    field: "other_responsible",
    short: "Out.",
    label: "Outros",
  },
];

export function trimSectorResponsible(company, field) {
  return String(company?.[field] ?? "").trim();
}

/** Valores não vazios (apenas texto, por ordem dos setores). */
export function eachSectorResponsibleValue(company) {
  const out = [];
  for (const { field } of COMPANY_SECTOR_RESPONSIBLE_DEFS) {
    const v = trimSectorResponsible(company, field);
    if (v) out.push(v);
  }
  return out;
}

export function companyHasAnySectorResponsible(company) {
  return eachSectorResponsibleValue(company).length > 0;
}

export function uniqueResponsibleLabelsFromCompanies(companies) {
  const s = new Set();
  if (!Array.isArray(companies)) return [];
  for (const c of companies) {
    for (const v of eachSectorResponsibleValue(c)) {
      if (v) s.add(v);
    }
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

/** Linha compacta para tabela: «Cont.: Ana · Fisc.: Bruno» */
export function formatCompanySectorResponsiblesCompact(company) {
  const parts = [];
  for (const d of COMPANY_SECTOR_RESPONSIBLE_DEFS) {
    const v = trimSectorResponsible(company, d.field);
    if (v) parts.push(`${d.short} ${v}`);
  }
  return parts.join(" · ");
}

/** Texto para title / tooltip multilinha */
export function formatCompanySectorResponsiblesLong(company) {
  const lines = [];
  for (const d of COMPANY_SECTOR_RESPONSIBLE_DEFS) {
    const v = trimSectorResponsible(company, d.field);
    if (v) lines.push(`${d.label}: ${v}`);
  }
  return lines.join("\n");
}

/** Pesquisa na lista Empresas / Onboarding pelo nome em qualquer setor. */
export function companyResponsibleFieldsMatchSearch(company, searchTermLowerTrimmed) {
  const t = String(searchTermLowerTrimmed ?? "").trim().toLowerCase();
  if (!t) return false;
  for (const { field } of COMPANY_SECTOR_RESPONSIBLE_DEFS) {
    if (String(company?.[field] ?? "").toLowerCase().includes(t)) return true;
  }
  return false;
}
