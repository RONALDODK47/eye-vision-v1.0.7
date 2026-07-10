/**
 * Divide o texto da célula INOV (após o último `]`) em colunas por prefixo da planilha.
 * @returns {Record<'contabil'|'fiscal'|'folha'|'ti'|'paralegal'|'outros', string>}
 */
export function splitInovWorkTextByArea(raw) {
  const empty = {
    contabil: "",
    fiscal: "",
    folha: "",
    ti: "",
    paralegal: "",
    outros: "",
  };
  const full = String(raw || "").trim();
  if (!full) return { ...empty };

  const li = full.lastIndexOf("]");
  const work = (li >= 0 ? full.slice(li + 1) : full).trim();
  if (!work) return { ...empty };

  const re = /(?=(?:CONT[AÁ]BIL|FISCAL|DP|PARALEGAL|TI)\s*:)/gi;
  const segments = work.split(re).map((s) => s.trim()).filter(Boolean);
  const acc = {
    contabil: [],
    fiscal: [],
    folha: [],
    ti: [],
    paralegal: [],
    outros: [],
  };

  for (const seg of segments) {
    const m = seg.match(/^(CONT[AÁ]BIL|FISCAL|DP|PARALEGAL|TI)\s*:\s*(.*)$/is);
    if (m) {
      const tag = m[1].toUpperCase();
      const body = (m[2] || "").trim();
      if (tag.includes("CONT")) acc.contabil.push(body);
      else if (tag === "FISCAL") acc.fiscal.push(body);
      else if (tag === "DP") acc.folha.push(body);
      else if (tag === "PARALEGAL") acc.paralegal.push(body);
      else if (tag === "TI") acc.ti.push(body);
    } else {
      acc.outros.push(seg);
    }
  }

  const out = { ...empty };
  for (const k of Object.keys(acc)) {
    out[k] = acc[k].join(" ").trim();
  }
  if (!segments.length) {
    out.outros = work;
  }
  return out;
}

/**
 * Reconstrói o texto da célula a partir das colunas por área (inverso de splitInovWorkTextByArea).
 * @param {string} originalRaw
 * @param {Record<string, string>} areas
 */
export function mergeInovWorkTextFromAreas(originalRaw, areas) {
  const full = String(originalRaw || "").trim();
  const li = full.lastIndexOf("]");
  const prefix = li >= 0 ? full.slice(0, li + 1).trim() : "";
  const order = [
    ["contabil", "CONTÁBIL"],
    ["fiscal", "FISCAL"],
    ["folha", "DP"],
    ["paralegal", "PARALEGAL"],
    ["ti", "TI"],
  ];
  const parts = [];
  for (const [key, label] of order) {
    const v = String(areas?.[key] ?? "").trim();
    if (v) parts.push(`${label}: ${v}`);
  }
  const outros = String(areas?.outros ?? "").trim();
  if (outros) parts.push(outros);
  const body = parts.join(" ");
  if (prefix && body) return `${prefix} ${body}`;
  if (prefix) return prefix;
  return body;
}

/**
 * Número de grupo / fase a partir da legenda lateral e do texto (ex.: «GRUPO 1 · …», «FASE 2»).
 * @param {string} [sidebar]
 * @param {string} [raw]
 * @returns {string|null} Dígitos ou null se não encontrar
 */
export function inferInovGroupNumberFromTexts(sidebar, raw) {
  const text = `${String(sidebar || "")}\n${String(raw || "")}`;
  let m = text.match(/GRUPO\D*(\d+)/i);
  if (m) return m[1];
  m = text.match(/FASE\D*(\d+)/i);
  if (m) return m[1];
  return null;
}
