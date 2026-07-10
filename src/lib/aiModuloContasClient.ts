/**
 * Cliente — IA sugere contas (classificação) para abas Contas dos módulos.
 */
import { fetchAiConfig } from '../contabilfacil/ai/aiSettingsClient';
import type {
  ModuloContaCampoDef,
  ModuloContasAiId,
} from '../contabilfacil/logic/moduloContasAiSchemas';

const AGENT_BASE =
  typeof import.meta.env.VITE_AGENT_API_URL === 'string' && import.meta.env.VITE_AGENT_API_URL
    ? import.meta.env.VITE_AGENT_API_URL.replace(/\/$/, '')
    : '/api/agent';

const REQUEST_TIMEOUT_MS = 180_000;

export type AiSuggestModuloContasParams = {
  company: string;
  modulo: ModuloContasAiId;
  message?: string;
  plano: Array<{ code: string; name: string }>;
  campos: ModuloContaCampoDef[];
  contasAtuais?: Record<string, string>;
  contexto?: Record<string, string | boolean | number | undefined>;
  anexosTexto?: string[];
  signal?: AbortSignal;
};

export type AiSuggestModuloContasResult = {
  ok: boolean;
  resumo: string;
  contas: Record<string, string>;
  detail?: string;
  reason?: string;
  model?: string;
};

export async function suggestModuloContasWithAi(
  params: AiSuggestModuloContasParams,
): Promise<AiSuggestModuloContasResult> {
  try {
    const aiCfg = await fetchAiConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const signal = params.signal ?? controller.signal;
    try {
      const res = await fetch(`${AGENT_BASE}/ai/suggest-modulo-contas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: params.company,
          modulo: params.modulo,
          message: params.message,
          plano: params.plano,
          campos: params.campos,
          contasAtuais: params.contasAtuais,
          contexto: params.contexto,
          anexosTexto: params.anexosTexto,
          model: aiCfg?.config?.model,
          providerId: aiCfg?.config?.providerId,
        }),
        signal,
      });
      const data = (await res.json()) as AiSuggestModuloContasResult & {
        error?: string;
        contas?: Array<{ key: string; conta: string }> | Record<string, string>;
      };
      if (!res.ok && !data.resumo) {
        return {
          ok: false,
          resumo: '',
          contas: {},
          detail: data.detail || data.error || `HTTP ${res.status}`,
          reason: data.reason,
        };
      }
      const contas = normalizeContasPayload(data.contas);
      return {
        ok: Boolean(data.ok),
        resumo: data.resumo ?? '',
        contas,
        model: data.model,
        detail: data.detail,
        reason: data.reason,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      resumo: '',
      contas: {},
      detail: msg.includes('abort') ? 'Tempo esgotado na IA' : msg,
      reason: 'client_error',
    };
  }
}

function normalizeContasPayload(
  raw: Array<{ key: string; conta: string }> | Record<string, string> | undefined,
): Record<string, string> {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (const item of raw) {
      const key = String(item?.key ?? '').trim();
      const conta = String(item?.conta ?? '').trim();
      if (key && conta) out[key] = conta;
    }
    return out;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.trim() && String(v).trim()) out[k.trim()] = String(v).trim();
  }
  return out;
}
