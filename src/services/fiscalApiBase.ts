/** Base URL da API fiscal local (porta 8780 / proxy Vite). */
export const FISCAL_API_BASE =
  typeof import.meta.env.VITE_FISCAL_API_URL === 'string' && import.meta.env.VITE_FISCAL_API_URL
    ? import.meta.env.VITE_FISCAL_API_URL.replace(/\/$/, '')
    : typeof import.meta.env.VITE_FISCAL_NFE_URL === 'string' && import.meta.env.VITE_FISCAL_NFE_URL
      ? import.meta.env.VITE_FISCAL_NFE_URL.replace(/\/$/, '')
      : '/api/fiscal-nfe';

export function fiscalApiCandidateBases(): string[] {
  const bases = [FISCAL_API_BASE];
  /** API fiscal local só existe em dev — evita Failed to fetch no app publicado (Firebase). */
  if (import.meta.env.DEV) {
    bases.push('http://127.0.0.1:8780');
  }
  return [...new Set(bases.map((b) => b.replace(/\/$/, '')))];
}
