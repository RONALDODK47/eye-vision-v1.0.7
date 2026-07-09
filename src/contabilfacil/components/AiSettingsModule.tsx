import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Sparkles,
  Key,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Save,
  Zap,
  FolderOpen,
  Settings2,
} from 'lucide-react';
import { ModulePageHeader } from './ModulePageHeader';
import { cn } from '../lib/utils';
import {
  fetchAgentHealth,
  fetchAiConfig,
  saveAiConfig,
  saveApiKeyOnly,
  testAiConnection,
} from '../ai/aiSettingsClient';
import { writeLocalApiKey } from '../ai/aiSecretsLocalStore';
import { restoreLocalApiKeysToServer } from '../ai/aiSecretsSync';
import { persistAiConfigToCloudStorage } from '../ai/aiCloudPersist';
import type { AiConfig, ProviderKeyStatusMap } from '../ai/aiCatalog';
import {
  AI_PROVIDERS,
  AI_TIER_INFO,
  EXTRACT_ENGINE_LABELS,
  normalizeExtractEngine,
  modelsCapableForProvider,
  providersWithCapableModels,
  tierBadgeClass,
  type AiPricingTier,
  type AiProviderId,
  type AiExtractEngine,
} from '../ai/aiModelCatalog';
import { fetchGeminiHealth } from '../../lib/geminiMonitorClient';

export interface AiSettingsModuleProps {
  selectedCompany: string;
}

type AiSettingsSection = 'config' | 'keys';

export default function AiSettingsModule({ selectedCompany }: AiSettingsModuleProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [providerKeys, setProviderKeys] = useState<ProviderKeyStatusMap>({});
  const [tierFilter, setTierFilter] = useState<AiPricingTier | 'all'>('all');
  const [apiKeyInputs, setApiKeyInputs] = useState<Partial<Record<AiProviderId, string>>>({});
  const [savingKey, setSavingKey] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [keySaveMsg, setKeySaveMsg] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [activeSection, setActiveSection] = useState<AiSettingsSection>('config');

  const providerId = (config?.providerId ?? 'gemini') as AiProviderId;
  const selectedModel = config?.model ?? 'gemini-2.5-flash';
  const extractEngine = normalizeExtractEngine(config?.extractEngine);

  const capableProviders = useMemo(() => providersWithCapableModels(), []);

  const visibleModels = useMemo(() => {
    let list = modelsCapableForProvider(providerId);
    if (tierFilter !== 'all') list = list.filter((m) => m.tier === tierFilter);
    return list;
  }, [providerId, tierFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    const [health, gemini, aiCfg] = await Promise.all([
      fetchAgentHealth(),
      fetchGeminiHealth(),
      fetchAiConfig(),
    ]);
    setOnline(Boolean(health.ok || gemini.ok));
    if (aiCfg) {
      persistAiConfigToCloudStorage(aiCfg.config);
      let next = aiCfg.config;
      const capable = modelsCapableForProvider((next.providerId ?? 'gemini') as AiProviderId);
      if (capable.length > 0 && !capable.some((m) => m.id === next.model)) {
        const first = capable[0]!;
        next = { ...next, model: first.id, localModel: first.id, pricingTier: first.tier };
      }
      if (!providersWithCapableModels().some((p) => p.id === next.providerId)) {
        const geminiFirst = modelsCapableForProvider('gemini')[0];
        next = {
          ...next,
          providerId: 'gemini',
          model: geminiFirst?.id ?? 'gemini-2.5-flash',
          localModel: geminiFirst?.id ?? 'gemini-2.5-flash',
        };
      }
      setConfig(next);
      const keys = await restoreLocalApiKeysToServer(aiCfg.providerKeys ?? {});
      setProviderKeys(keys);
    } else {
      const keys = await restoreLocalApiKeysToServer({});
      if (Object.keys(keys).length) setProviderKeys(keys);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, selectedCompany]);

  const persistApiKey = async (
    targetProviderId: AiProviderId,
    key: string,
    opts?: { clearInput?: boolean },
  ) => {
    const trimmed = key.trim();
    if (trimmed.length < 8) return false;
    setSavingKey(true);
    setKeySaveMsg('');
    try {
      writeLocalApiKey(targetProviderId, trimmed);
      const result = await saveApiKeyOnly(targetProviderId, trimmed);
      if (!result.ok) throw new Error(result.error ?? 'Erro ao salvar chave');
      setProviderKeys(result.providerKeys ?? {});
      if (opts?.clearInput !== false) {
        setApiKeyInputs((prev) => ({ ...prev, [targetProviderId]: '' }));
      }
      setKeySaveMsg('Chave salva permanentemente.');
      return true;
    } catch (err) {
      setKeySaveMsg(err instanceof Error ? err.message : 'Erro ao salvar chave');
      return false;
    } finally {
      setSavingKey(false);
    }
  };

  const handleSaveApiKey = async () => {
    const key = apiKeyInputs[providerId]?.trim();
    if (!key) {
      setKeySaveMsg('Cole a chave API antes de salvar.');
      return;
    }
    await persistApiKey(providerId, key);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const patch: Parameters<typeof saveAiConfig>[0] = {
        providerId: config.providerId,
        model: selectedModel,
        localModel: selectedModel,
        extractEngine: config.extractEngine,
      };
      const saved = await saveAiConfig(patch);
      setConfig(saved.config);
      setProviderKeys(saved.providerKeys ?? providerKeys);
      persistAiConfigToCloudStorage(saved.config);
      setSaveMsg('Configuração salva.');
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestMsg('');
    const key = apiKeyInputs[providerId]?.trim();
    if (key) {
      await persistApiKey(providerId, key, { clearInput: false });
    }
    const result = await testAiConnection(providerId);
    setTestMsg(result.ok ? `Conexão OK${result.model ? ` (${result.model})` : ''}` : result.detail ?? 'Falhou');
    setTesting(false);
    void load();
  };

  const providerInfo = AI_PROVIDERS.find((p) => p.id === providerId);
  const keyStatus = providerKeys[providerId];
  const activeKeyFolder = `.data/api-keys/${providerId}/`;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <ModulePageHeader
        title="Configuração de IA"
        subtitle="Motor, provedor e modelo em uso · chaves guardadas em pastas por provedor"
      />

      <div className="border border-brand-border p-4 flex items-center justify-between gap-4 shadow-[2px_2px_0_0_#141414]">
        <div className="flex items-center gap-3">
          <Sparkles size={22} />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest">Em uso agora</p>
            <p className="text-sm font-mono font-bold">
              {config?.model ?? '—'} · {providerInfo?.label ?? '—'}
            </p>
            <p className="text-[9px] font-mono opacity-60 mt-0.5">
              {EXTRACT_ENGINE_LABELS[extractEngine]}
              {keyStatus?.configured ? ' · chave OK' : ' · sem chave'}
            </p>
          </div>
        </div>
        <span
          className={cn(
            'text-[9px] font-mono font-bold uppercase px-2 py-1 border shrink-0',
            online === true && 'border-green-700 text-green-800 bg-green-50',
            online === false && 'border-red-700 text-red-800 bg-red-50',
            online === null && 'border-amber-600 text-amber-800 bg-amber-50',
          )}
        >
          {loading ? '…' : online ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      {/* Sub-abas */}
      <div className="flex flex-wrap gap-2 border-b border-brand-border pb-2">
        <button
          type="button"
          onClick={() => setActiveSection('config')}
          className={cn(
            'px-3 py-1.5 text-[10px] font-black uppercase border flex items-center gap-1.5',
            activeSection === 'config'
              ? 'bg-brand-text text-brand-sidebar border-brand-text'
              : 'border-brand-border hover:bg-brand-sidebar/20',
          )}
        >
          <Settings2 size={12} /> Configuração
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('keys')}
          className={cn(
            'px-3 py-1.5 text-[10px] font-black uppercase border flex items-center gap-1.5',
            activeSection === 'keys'
              ? 'bg-brand-text text-brand-sidebar border-brand-text'
              : 'border-brand-border hover:bg-brand-sidebar/20',
          )}
        >
          <FolderOpen size={12} /> Pastas de chaves
          {keyStatus?.configured ? ' ✓' : ''}
        </button>
      </div>

      {activeSection === 'config' && (
        <>
          <section className="technical-panel p-4 space-y-3 shadow-[2px_2px_0_0_#141414]">
            <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <Zap className="w-3 h-3" /> Motor de extração (extrato)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(['ai', 'hybrid'] as AiExtractEngine[]).map((eng) => (
                <button
                  key={eng}
                  type="button"
                  onClick={() => setConfig((c) => (c ? { ...c, extractEngine: eng } : c))}
                  className={cn(
                    'text-left p-3 border text-[10px] leading-snug transition-colors',
                    extractEngine === eng
                      ? 'border-orange-700 bg-orange-50 font-black'
                      : 'border-brand-border hover:bg-brand-sidebar/20',
                  )}
                >
                  {EXTRACT_ENGINE_LABELS[eng]}
                </button>
              ))}
            </div>
            <p className="text-[9px] opacity-60 leading-relaxed">
              <strong>Somente IA</strong> — envia imagem ao modelo na nuvem (precisa de chave API).{' '}
              <strong>Híbrido</strong> — texto nativo do PDF + IA corrige linhas difíceis (precisa de chave).
              Extratos PDF usam o leitor-recortador (sem OCR local). Só aparecem modelos com visão capazes de
              extrato e conciliação.
            </p>
          </section>

          <section className="technical-panel p-4 space-y-3 shadow-[2px_2px_0_0_#141414]">
            <h3 className="text-[10px] font-black uppercase tracking-widest">Provedor em uso</h3>
            <div className="flex flex-wrap gap-2">
              {capableProviders.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    setConfig((c) => {
                      const firstModel = modelsCapableForProvider(p.id)[0]?.id ?? 'gemini-2.5-flash';
                      return c
                        ? { ...c, providerId: p.id, tier: p.id, model: firstModel, localModel: firstModel }
                        : c;
                    })
                  }
                  className={cn(
                    'px-3 py-1.5 text-[10px] font-black uppercase border',
                    providerId === p.id
                      ? 'bg-brand-text text-brand-sidebar border-brand-text'
                      : 'border-brand-border hover:bg-brand-sidebar/20',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-[9px] opacity-50 font-mono">
              A chave fica na pasta{' '}
              <span className="font-bold">.data/api-keys/{providerId}/</span> — gerencie em Pastas de chaves.
              Provedores só-texto (ex.: Groq) ficam ocultos — não dão conta do extrato.
            </p>
          </section>

          <section className="technical-panel p-4 space-y-3 shadow-[2px_2px_0_0_#141414]">
            <h3 className="text-[10px] font-black uppercase tracking-widest">Modelo</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTierFilter('all')}
                className={cn(
                  'px-2 py-1 text-[9px] font-black uppercase border',
                  tierFilter === 'all' ? 'bg-brand-text text-brand-sidebar' : 'border-brand-border',
                )}
              >
                Todos
              </button>
              {AI_TIER_INFO.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTierFilter(t.id)}
                  className={cn(
                    'px-2 py-1 text-[9px] font-black uppercase border',
                    tierFilter === t.id ? tierBadgeClass(t.id) : 'border-brand-border opacity-70',
                  )}
                  title={t.description}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {visibleModels.map((m) => (
                <label
                  key={m.id}
                  className={cn(
                    'flex items-start gap-2 p-2 border cursor-pointer text-[10px]',
                    selectedModel === m.id ? 'border-orange-700 bg-orange-50/50' : 'border-brand-border/50',
                  )}
                >
                  <input
                    type="radio"
                    name="ai-model"
                    checked={selectedModel === m.id}
                    onChange={() =>
                      setConfig((c) => (c ? { ...c, model: m.id, localModel: m.id, pricingTier: m.tier } : c))
                    }
                    className="mt-0.5 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-black">{m.label}</span>
                    <span
                      className={cn(
                        'ml-2 text-[8px] font-black uppercase px-1 py-0.5 border',
                        tierBadgeClass(m.tier),
                      )}
                    >
                      {m.tierLabel}
                    </span>
                    {m.hint ? <span className="block opacity-60 text-[9px] mt-0.5">{m.hint}</span> : null}
                    <span className="block text-[8px] text-emerald-800 mt-0.5">Visão + extração — apto para extrato</span>
                  </span>
                </label>
              ))}
              {visibleModels.length === 0 && (
                <p className="text-[10px] opacity-60">
                  Nenhum modelo com visão neste filtro para {providerInfo?.label}. Escolha outro provedor.
                </p>
              )}
            </div>
          </section>

          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="button"
              disabled={saving || !config}
              onClick={() => void handleSave()}
              className="technical-button-primary text-xs font-bold flex items-center gap-2 disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar configuração
            </button>
            <button
              type="button"
              disabled={testing}
              onClick={() => void handleTest()}
              className="technical-button text-xs flex items-center gap-2 disabled:opacity-40"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              Testar conexão
            </button>
            {saveMsg ? <span className="text-[10px] font-mono">{saveMsg}</span> : null}
            {testMsg ? (
              <span className={cn('text-[10px] font-mono', testMsg.includes('OK') ? 'text-green-700' : 'text-red-700')}>
                {testMsg}
              </span>
            ) : null}
          </div>
        </>
      )}

      {activeSection === 'keys' && (
        <section className="technical-panel p-4 space-y-4 shadow-[2px_2px_0_0_#141414]">
          <div className="flex items-start gap-2 border border-brand-border/40 bg-brand-sidebar/10 p-3">
            <FolderOpen size={16} className="shrink-0 mt-0.5 opacity-70" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest">.data/api-keys/</p>
              <p className="text-[9px] font-mono opacity-60 mt-1 leading-relaxed">
                Cada provedor tem sua pasta. Só a pasta do provedor <strong>em uso</strong> é exibida abaixo.
              </p>
            </div>
          </div>

          {/* Sub-aba da pasta do provedor em uso */}
          <div className="border border-brand-border shadow-[2px_2px_0_0_#141414]">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-brand-border bg-brand-sidebar/20">
              <FolderOpen size={12} className="shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-widest font-mono">{providerId}/</span>
              <span className="ml-auto text-[8px] font-black uppercase px-1.5 py-0.5 bg-orange-600 text-white">
                em uso
              </span>
            </div>

            <div className="p-4 space-y-3">
              <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                <Key className="w-3 h-3" /> {providerInfo?.label}
              </h3>

              {keyStatus?.configured ? (
                <p className="text-[10px] font-mono flex flex-wrap items-center gap-x-2 gap-y-1 text-green-800">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>
                    Configurada ({keyStatus.source === 'env' ? 'via .env' : 'via interface'})
                    {keyStatus.masked ? ` · ${keyStatus.masked}` : ''}
                  </span>
                  {keyStatus.storagePath ? (
                    <span className="opacity-60 w-full sm:w-auto">{keyStatus.storagePath}</span>
                  ) : (
                    <span className="opacity-60 w-full sm:w-auto">{activeKeyFolder}api-key.json</span>
                  )}
                </p>
              ) : (
                <p className="text-[10px] font-mono flex items-center gap-2 text-amber-800">
                  <AlertCircle size={14} />
                  Sem chave — informe abaixo ou defina {providerInfo?.keyEnvVar} no .env
                </p>
              )}

              <input
                type="password"
                autoComplete="off"
                placeholder={
                  keyStatus?.configured
                    ? 'Chave já salva — cole aqui somente para substituir'
                    : `Cole sua ${providerInfo?.keyEnvVar ?? 'API key'} aqui`
                }
                value={apiKeyInputs[providerId] ?? ''}
                onChange={(e) =>
                  setApiKeyInputs((prev) => ({ ...prev, [providerId]: e.target.value }))
                }
                onBlur={() => {
                  const key = apiKeyInputs[providerId]?.trim();
                  if (key && key.length >= 8) void persistApiKey(providerId, key);
                }}
                className="w-full border border-brand-border bg-brand-sidebar/30 text-[11px] py-2 px-3 font-mono shadow-[2px_2px_0_0_#141414]"
              />

              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  disabled={savingKey}
                  onClick={() => void handleSaveApiKey()}
                  className="technical-button text-xs flex items-center gap-2 disabled:opacity-40"
                >
                  {savingKey ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                  Salvar chave
                </button>
                <button
                  type="button"
                  disabled={testing}
                  onClick={() => void handleTest()}
                  className="technical-button text-xs flex items-center gap-2 disabled:opacity-40"
                >
                  {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  Testar conexão
                </button>
                {keySaveMsg ? (
                  <span
                    className={cn(
                      'text-[10px] font-mono',
                      keySaveMsg.includes('salva') ? 'text-green-700' : 'text-red-700',
                    )}
                  >
                    {keySaveMsg}
                  </span>
                ) : null}
                {testMsg ? (
                  <span
                    className={cn(
                      'text-[10px] font-mono',
                      testMsg.includes('OK') ? 'text-green-700' : 'text-red-700',
                    )}
                  >
                    {testMsg}
                  </span>
                ) : null}
              </div>

              {providerInfo?.docsUrl ? (
                <a
                  href={providerInfo.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[9px] font-mono flex items-center gap-1 text-blue-700 hover:underline"
                >
                  Obter chave em {providerInfo.label} <ExternalLink size={10} />
                </a>
              ) : null}

              <p className="text-[8px] opacity-50 font-mono leading-relaxed">
                Salva em {activeKeyFolder}api-key.json e no banco local/nuvem (Eye Vision).
                Para trocar de provedor, altere em Configuração — a pasta exibida muda automaticamente.
              </p>
            </div>
          </div>
        </section>
      )}

      <p className="text-[9px] font-mono opacity-50 leading-relaxed border border-brand-border/30 p-3">
        Modelos <strong>grátis</strong>: cota permanente (Gemini Flash, Groq).{' '}
        <strong>Grátis limitado</strong>: trial ou preview com quota diária.{' '}
        <strong>Pago</strong>: requer billing ativo. Extração com IA usa o provedor e modelo selecionados acima.
      </p>
    </div>
  );
}
