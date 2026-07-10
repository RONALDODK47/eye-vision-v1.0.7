/**
 * Cliente — IA sugere regras de contas a partir de plano + extrato + anexos.
 */
import type { ExtratoRegraContaNature } from '../contabilfacil/logic/extratoRegrasContasStorage';
import { fetchAiConfig } from '../contabilfacil/ai/aiSettingsClient';
import type { AiExtractImage } from './aiExtratoExtractClient';

const AGENT_BASE =
  typeof import.meta.env.VITE_AGENT_API_URL === 'string' && import.meta.env.VITE_AGENT_API_URL
    ? import.meta.env.VITE_AGENT_API_URL.replace(/\/$/, '')
    : '/api/agent';

const REQUEST_TIMEOUT_MS = 180_000;

export type AiRegraContaSugestao = {
  descricao: string;
  nature: ExtratoRegraContaNature;
  contaContrapartida: string;
  motivo?: string;
};

export type AiSuggestRegrasResult = {
  ok: boolean;
  resumo: string;
  regras: AiRegraContaSugestao[];
  model?: string;
  detail?: string;
  reason?: string;
};

export type AiColigadaPayload = {
  nome: string;
  aliases: string[];
  contaReduzida?: string;
};

export type AiSuggestRegrasParams = {
  company: string;
  contaBanco: string;
  bancoNome?: string;
  message: string;
  plano: Array<{
    code: string;
    name: string;
    codigoReduzido?: string;
    group?: string;
  }>;
  extratoSample: Array<{ description: string; nature: string; value: number }>;
  regrasExistentes?: Array<{ descricao: string; nature: string; contaContrapartida: string }>;
  images?: AiExtractImage[];
  anexosTexto?: string[];
  /** Mapa de contas usadas no razão/balancete importado. */
  balanceteUsoContas?: string;
  /** Documentos da pasta balancetes na Inteligência IA. */
  inteligenciaBalancetes?: string[];
  /** Contexto honorários/folha/categorias obrigatórias. */
  modulosContexto?: string;
  /** Empresas coligadas — NÃO são clientes (AJTF, A.J.T.F, A J T F…). */
  coligadas?: AiColigadaPayload[];
  /**
   * corrigir_cobertura = audita + cobre descobertos
   * implantar = cria regras do zero em lotes
   * chat_pedido = atende pedido livre do usuário em lotes
   */
  mode?: 'sugerir' | 'corrigir_cobertura' | 'implantar' | 'chat_pedido';
  /** Lançamentos ainda sem regra (obrigatório cobrir). */
  uncoveredExtrato?: Array<{ description: string; nature: string; value: number }>;
  signal?: AbortSignal;
};

export async function suggestRegrasContasWithAi(
  params: AiSuggestRegrasParams,
): Promise<AiSuggestRegrasResult> {
  try {
    const aiCfg = await fetchAiConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const signal = params.signal ?? controller.signal;
    try {
      const res = await fetch(`${AGENT_BASE}/ai/suggest-regras-contas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: params.company,
          contaBanco: params.contaBanco,
          bancoNome: params.bancoNome,
          message: params.message,
          plano: params.plano,
          extratoSample: params.extratoSample,
          regrasExistentes: params.regrasExistentes,
          images: params.images,
          anexosTexto: params.anexosTexto,
          balanceteUsoContas: params.balanceteUsoContas,
          inteligenciaBalancetes: params.inteligenciaBalancetes,
          modulosContexto: params.modulosContexto,
          coligadas: params.coligadas,
          mode: params.mode,
          uncoveredExtrato: params.uncoveredExtrato,
          model: aiCfg?.config?.model,
          providerId: aiCfg?.config?.providerId,
        }),
        signal,
      });
      const data = (await res.json()) as AiSuggestRegrasResult & { error?: string };
      if (!res.ok && !data.resumo) {
        return {
          ok: false,
          resumo: '',
          regras: [],
          detail: data.detail || data.error || `HTTP ${res.status}`,
          reason: data.reason,
        };
      }
      return {
        ok: Boolean(data.ok),
        resumo: data.resumo ?? '',
        regras: Array.isArray(data.regras) ? data.regras : [],
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
      regras: [],
      detail: msg.includes('abort') ? 'Tempo esgotado na IA' : msg,
      reason: 'client_error',
    };
  }
}
