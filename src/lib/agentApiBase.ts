/** Base URL da Agent API (Render em produção, proxy Vite em dev). */
export function getAgentApiBase(): string {
  const raw = import.meta.env.VITE_AGENT_API_URL;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim().replace(/\/$/, '');
  }
  if (import.meta.env.DEV) return '/api/agent';
  /** Fallback quando o build não embutiu VITE_AGENT_API_URL (GitHub Pages). */
  return 'https://contabil-erp-nova-versao-v1-0-8.onrender.com/api/agent';
}

/** Origem do serviço backend (ex.: https://eye-vision-agent-api.onrender.com). */
export function getAgentApiOrigin(): string | null {
  const base = getAgentApiBase();
  if (base.startsWith('http://') || base.startsWith('https://')) {
    try {
      return new URL(base).origin;
    } catch {
      return null;
    }
  }
  return null;
}
