import type { AiConfig, InferenceLimits, LocalAiCatalogEntry, SystemProfile, ProviderKeyStatusMap } from './aiCatalog';
import type { AiProviderId, AiExtractEngine, AiPricingTier } from './aiModelCatalog';

const AGENT_BASE =
  typeof import.meta.env.VITE_AGENT_API_URL === 'string' && import.meta.env.VITE_AGENT_API_URL
    ? import.meta.env.VITE_AGENT_API_URL.replace(/\/$/, '')
    : '/api/agent';

export interface AgentHealthInfo {
  ok?: boolean;
  configured?: boolean;
  providerId?: string;
  tier?: string;
  model?: string;
  label?: string;
  detail?: string;
  engine?: string;
  engineLabel?: string;
}

export async function fetchAgentHealth(): Promise<AgentHealthInfo> {
  try {
    const res = await fetch(`${AGENT_BASE}/health`, { method: 'GET' });
    if (!res.ok) {
      return {
        ok: false,
        label: 'IA offline',
        detail: res.status === 404 ? 'API local sem rotas /agent — reinicie npm run dev' : `HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as AgentHealthInfo;
    return data;
  } catch {
    return { ok: false, label: 'IA offline' };
  }
}

export async function fetchAiConfig(): Promise<{
  config: AiConfig;
  label: string;
  providerKeys?: ProviderKeyStatusMap;
} | null> {
  try {
    const res = await fetch(`${AGENT_BASE}/config`);
    if (!res.ok) return null;
    return (await res.json()) as {
      config: AiConfig;
      label: string;
      providerKeys?: ProviderKeyStatusMap;
    };
  } catch {
    return null;
  }
}

export async function saveApiKeyOnly(
  providerId: AiProviderId,
  apiKey: string,
): Promise<{ ok: boolean; providerKeys?: ProviderKeyStatusMap; error?: string }> {
  const res = await fetch(`${AGENT_BASE}/ai/save-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId, apiKey }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    providerKeys?: ProviderKeyStatusMap;
    error?: string;
  };
  if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
  return { ok: true, providerKeys: data.providerKeys };
}

export async function saveAiConfig(patch: Partial<AiConfig> & {
  apiKey?: string;
  apiKeyProvider?: AiProviderId;
  apiKeys?: Partial<Record<AiProviderId, string>>;
}): Promise<{ config: AiConfig; label: string; providerKeys?: ProviderKeyStatusMap }> {
  const res = await fetch(`${AGENT_BASE}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { config: AiConfig; label: string; providerKeys?: ProviderKeyStatusMap };
}

export async function testAiConnection(providerId: AiProviderId): Promise<{
  ok: boolean;
  detail?: string;
  model?: string;
}> {
  try {
    const res = await fetch(`${AGENT_BASE}/ai/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId }),
    });
    return (await res.json()) as { ok: boolean; detail?: string; model?: string };
  } catch {
    return { ok: false, detail: 'Servidor IA indisponível' };
  }
}

export async function fetchAiModelsCatalog(): Promise<{
  providers: import('./aiModelCatalog').AiProviderInfo[];
  models: import('./aiModelCatalog').AiModelEntry[];
  tiers: import('./aiModelCatalog').AiTierInfo[];
  providerKeys?: ProviderKeyStatusMap;
} | null> {
  try {
    const res = await fetch(`${AGENT_BASE}/models`);
    if (!res.ok) return null;
    return (await res.json()) as {
      providers: import('./aiModelCatalog').AiProviderInfo[];
      models: import('./aiModelCatalog').AiModelEntry[];
      tiers: import('./aiModelCatalog').AiTierInfo[];
      providerKeys?: ProviderKeyStatusMap;
    };
  } catch {
    return null;
  }
}

export async function fetchSystemProfile(): Promise<{
  profile: SystemProfile;
  catalog: LocalAiCatalogEntry[];
  inferenceLimits?: InferenceLimits;
}> {
  const res = await fetch(`${AGENT_BASE}/system-profile`);
  if (!res.ok) throw new Error('Não foi possível analisar o computador');
  return (await res.json()) as {
    profile: SystemProfile;
    catalog: LocalAiCatalogEntry[];
    inferenceLimits?: InferenceLimits;
  };
}

export async function setupLocalAiAuto(model?: string): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
  needsInstall?: boolean;
  installUrl?: string;
  config?: AiConfig;
  label?: string;
  recommendedModel?: string;
}> {
  const res = await fetch(`${AGENT_BASE}/local-ai/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(model ? { model, localModel: model } : {}),
  });
  return (await res.json()) as {
    ok: boolean;
    message?: string;
    error?: string;
    needsInstall?: boolean;
    installUrl?: string;
  };
}

/** @deprecated alias — use setupLocalAiAuto */
export const setupGeminiAuto = setupLocalAiAuto;

export async function fetchLocalAiPullStatus(): Promise<{
  active: boolean;
  model: string;
  lines: string[];
  done: boolean;
  error: string | null;
}> {
  try {
    const res = await fetch(`${AGENT_BASE}/local-ai/pull-status`);
    if (!res.ok) return { active: false, model: '', lines: [], done: true, error: null };
    return (await res.json()) as {
      active: boolean;
      model: string;
      lines: string[];
      done: boolean;
      error: string | null;
    };
  } catch {
    return { active: false, model: '', lines: [], done: true, error: null };
  }
}

/** @deprecated alias — use fetchLocalAiPullStatus */
export const fetchGeminiPullStatus = fetchLocalAiPullStatus;
