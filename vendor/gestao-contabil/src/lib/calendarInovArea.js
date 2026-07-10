/** Áreas alinhadas ao calendário INOV (planilha). */
export const INOV_AREA_IDS = ["contabil", "fiscal", "folha", "paralegal", "ti", "outros"];

export const INOV_AREA_LABELS = {
  todas: "Todas as áreas",
  contabil: "Contábil",
  fiscal: "Fiscal",
  folha: "Folha / DP",
  paralegal: "Paralegal",
  ti: "TI / Projetos",
  outros: "Outros",
};

/**
 * Usa o texto da obrigação após o último `]` (rótulos da planilha), para o filtro por área não
 * misturar tudo por causa de cabeçalhos tipo [PRAZOS CONTÁBIL]. Sem `]`, usa o texto completo.
 * @param {string} raw
 * @returns {string[]}
 */
export function inferAreasFromInovRaw(raw) {
  const full = String(raw || "").trim();
  if (!full) return ["outros"];
  const li = full.lastIndexOf("]");
  const afterBracket = li >= 0 ? full.slice(li + 1).trim() : "";
  const segment = afterBracket.length > 0 ? afterBracket : full;
  return inferAreasFromRaw(segment);
}

/**
 * Detecta prefixos CONTABIL / CONTÁBIL, FISCAL, DP, PARALEGAL, TI no texto (como na planilha).
 * @param {string} raw
 * @returns {string[]}
 */
export function inferAreasFromRaw(raw) {
  const s = String(raw || "").trim();
  if (!s) return ["outros"];

  const chunks = s.split(/(?=(?:CONT[AÁ]BIL|FISCAL|DP|PARALEGAL|TI)\s*:)/i).filter((x) => x.trim());

  const found = new Set();
  for (const chunk of chunks) {
    const t = chunk.trim();
    if (/^CONT[AÁ]BIL\s*:/i.test(t)) found.add("contabil");
    else if (/^FISCAL\s*:/i.test(t)) found.add("fiscal");
    else if (/^DP\s*:/i.test(t)) found.add("folha");
    else if (/^PARALEGAL\s*:/i.test(t)) found.add("paralegal");
    else if (/^TI\s*:/i.test(t)) found.add("ti");
  }

  if (found.size === 0) {
    const u = s.toUpperCase();
    if (u.includes("CONTÁBIL") || /\bCONTABIL\b/i.test(s)) found.add("contabil");
    if (/\bFISCAL\b/i.test(s) || u.includes("SPED") || u.includes("EFD")) found.add("fiscal");
    if (u.includes("FOLHA") || u.includes(" DP") || /^DP\b/i.test(s.trim())) found.add("folha");
    if (/\bPARALEGAL\b/i.test(s)) found.add("paralegal");
    if (/\bTI\b/i.test(s) || /^TI\s*:/i.test(s.trim())) found.add("ti");
  }

  if (found.size === 0) found.add("outros");
  return [...found];
}

/**
 * @param {string[]} areas
 * @param {string} userArea contabil | fiscal | … | todas
 */
export function deadlineMatchesUserArea(areas, userArea) {
  if (!userArea || userArea === "todas") return true;
  return areas.includes(userArea);
}
