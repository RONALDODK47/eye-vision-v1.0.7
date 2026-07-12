import { getAgentApiOrigin } from '../lib/agentApiBase';

function resolveFiscalApiBase(): string | null {
  const explicit =
    (typeof import.meta.env.VITE_FISCAL_API_URL === 'string' && import.meta.env.VITE_FISCAL_API_URL) ||
    (typeof import.meta.env.VITE_FISCAL_NFE_URL === 'string' && import.meta.env.VITE_FISCAL_NFE_URL);
  if (explicit) return explicit.trim().replace(/\/$/, '');

  const agentOrigin = getAgentApiOrigin();
  if (agentOrigin) return `${agentOrigin}/api/fiscal-nfe`;

  if (import.meta.env.DEV) return '/api/fiscal-nfe';

  /** GitHub Pages / Firebase Hosting — sem proxy fiscal local. */
  return null;
}

/** Base URL da API fiscal (Render ou proxy Vite em dev). Null = indisponível no host estático. */
export const FISCAL_API_BASE: string | null = resolveFiscalApiBase();

export function fiscalApiCandidateBases(): string[] {
  const bases: string[] = [];
  if (FISCAL_API_BASE) bases.push(FISCAL_API_BASE);
  /** API fiscal local só existe em dev — evita Failed to fetch no app publicado. */
  if (import.meta.env.DEV) {
    bases.push('http://127.0.0.1:8780');
  }
  return [...new Set(bases.map((b) => b.replace(/\/$/, '')))];
}

/** Verifica se alguma base fiscal responde no endpoint de health. */
export async function pingFiscalHealth(path: string): Promise<boolean> {
  const healthPath = path.startsWith('/') ? path : `/${path}`;
  for (const base of fiscalApiCandidateBases()) {
    try {
      const res = await fetch(`${base}${healthPath}`, { method: 'GET', cache: 'no-store' });
      if (!res.ok) continue;
      const data = (await res.json()) as { ok?: boolean; online?: boolean };
      if (data.online === false || data.ok === false) continue;
      return true;
    } catch {
      // próxima base
    }
  }
  return false;
}
