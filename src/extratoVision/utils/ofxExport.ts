/** OFX exige ponto como separador decimal (padrão internacional). */
export function formatOFXAmount(value: number): string {
  return value.toFixed(2);
}

export function sanitizeOFXMemo(memo: string): string {
  return memo
    .substring(0, 255)
    .replace(/[çÇ]/g, 'c')
    .replace(/[áàãâä]/gi, 'a')
    .replace(/[éèêë]/gi, 'e')
    .replace(/[íìîï]/gi, 'i')
    .replace(/[óòõôö]/gi, 'o')
    .replace(/[úùûü]/gi, 'u')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[^a-zA-Z0-9., \-_ ]/g, '');
}

/** FITID único entre importações (data + valor + histórico + índice + carimbo de exportação). */
export function buildOFXFitId(
  postedDate: string,
  trnAmt: string,
  memo: string,
  index: number,
  exportEpochMs: number
): string {
  const raw = `${postedDate}|${trnAmt}|${memo}|${index}|${exportEpochMs}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (Math.imul(31, hash) + raw.charCodeAt(i)) | 0;
  }
  const suffix = Math.abs(hash).toString(36).padStart(6, '0').slice(0, 8);
  return `${postedDate}${exportEpochMs}${suffix}${String(index + 1).padStart(4, '0')}`;
}
