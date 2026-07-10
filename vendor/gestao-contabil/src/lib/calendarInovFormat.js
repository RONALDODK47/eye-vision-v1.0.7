/**
 * Parte o texto da planilha em blocos por etiqueta de área (CONTÁBIL, FISCAL, DP, …)
 * para exibição com espaçamento visual entre obrigações.
 */
export function splitInovRawIntoBlocks(raw) {
  const s = String(raw || "").trim();
  if (!s) return [];
  const parts = s.split(
    /(?<!^)(?=\s*(?:CONTÁBIL|CONTABIL|FISCAL|DP|PARALEGAL|TI)\s*:)/i
  );
  return parts.map((p) => p.trim()).filter(Boolean);
}
