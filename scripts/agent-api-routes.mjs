/**
 * Agente IA — Gemini free tier (OCR audit, debug, chat contábil).
 */
import {
  loadAiConfig,
  saveAiConfig,
  providerDisplayLabel,
  resolveLocalModelId,
  publicAiConfig,
} from './ai-config-store.mjs';
import { localAiDisplayLabel } from './local-ai-labels.mjs';
import {
  EMBEDDED_AI_CATALOG,
  DEFAULT_EMBEDDED_MODEL_ID,
} from './embedded-ai.mjs';
import { catalogForApi, normalizeSelectedModel, findModelInCatalog } from './ai-model-catalog.mjs';
import {
  publicProviderKeyStatus,
  saveApiKeyForProvider,
  isProviderConfigured,
} from './ai-secrets-store.mjs';
import {
  handleAiExtractExtrato,
  handleAiExtractPlano,
  handleAiExtractColigadas,
  handleAiExtractSocios,
  handleAiRefineOcrRows,
  handleAiExtractLoanContract,
  handleAiOcrOverlay,
} from './ai-extract-handler.mjs';
import { handleAiSuggestRegrasContas } from './ai-regras-contas-handler.mjs';
import { handleAiSuggestModuloContas } from './ai-modulo-contas-handler.mjs';
import { analyzeSystemProfile } from './ai-system-profile.mjs';
import { resolveHardwareLimits } from './ai-hardware-limits.mjs';
import { createCursorHandoff } from './ai-cursor-handoff.mjs';
import {
  chatLocal,
  ensureLocalAiEngine,
  isLocalModelReady,
} from './local-ai-chat.mjs';
import { bootstrapLocalAiOnStartup } from './local-ai-bootstrap.mjs';
import { buildBotAutomationSystemPrompt } from './ia-contabil-prompts.mjs';
import { callGemini, isGeminiConfigured, parseGeminiJson, pingGeminiApi, geminiModelId } from './gemini-client.mjs';
import {
  handleGeminiHealth,
  handleGeminiAnalyzeExtratoImport,
  handleGeminiAnalyzeDebug,
} from './gemini-api-handlers.mjs';
import { handleAgentChatRequest } from './agent-chat-handler.mjs';
import { DEBUG_GEMINI_SYSTEM } from './gemini-audit-prompts.mjs';
import { registerWorkspaceRoutes } from './storage/workspace-routes.mjs';

const consoleAutofixLast = new Map();
const CONSOLE_AUTOFIX_COOLDOWN_MS = 25_000;

async function providerHealth(_config) {
  const ping = await pingGeminiApi();
  const model = ping.model ?? geminiModelId();
  return {
    ok: ping.ok,
    configured: isGeminiConfigured(),
    providerId: 'gemini',
    tier: 'gemini',
    model,
    label: 'Gemini AI',
    engine: ping.ok ? 'gemini' : 'offline',
    engineLabel: ping.detail ?? (ping.ok ? `Gemini (${model})` : 'Gemini offline'),
    detail: ping.detail,
  };
}

export function registerAgentRoutes(app) {
  app.get('/agent/health', async (_req, res) => {
    const config = loadAiConfig();
    const health = await providerHealth(config);
    const inferenceLimits = resolveHardwareLimits();
    res.status(200).json({
      service: 'agent-api',
      timestamp: new Date().toISOString(),
      ...health,
      inferenceLimits,
    });
  });

  app.get('/agent/config', (_req, res) => {
    const config = loadAiConfig();
    res.json({
      config: publicAiConfig(config),
      label: providerDisplayLabel(config),
      providerKeys: publicProviderKeyStatus(),
      catalog: catalogForApi(),
    });
  });

  app.put('/agent/config', async (req, res) => {
    const body = req.body ?? {};
    const prev = loadAiConfig();
    const providerId = String(body.providerId ?? prev.providerId ?? 'gemini').trim();
    const model = normalizeSelectedModel(providerId, body.localModel || body.model || prev.model);
    const patch = {
      providerId,
      tier: providerId,
      localModel: model,
      model,
    };
    if (body.extractEngine) {
      patch.extractEngine = 'ai';
    }
    const entry = findModelInCatalog(model);
    if (entry) patch.pricingTier = entry.tier;

    if (body.apiKey && body.apiKeyProvider) {
      saveApiKeyForProvider(body.apiKeyProvider, body.apiKey);
    } else if (body.removeApiKey && body.apiKeyProvider) {
      saveApiKeyForProvider(body.apiKeyProvider, '');
    }
    if (body.apiKeys && typeof body.apiKeys === 'object') {
      for (const [pid, key] of Object.entries(body.apiKeys)) {
        if (typeof key === 'string' && key.trim()) saveApiKeyForProvider(pid, key);
      }
    }

    const saved = saveAiConfig(patch);
    res.json({
      config: publicAiConfig(saved),
      label: providerDisplayLabel(saved),
      providerKeys: publicProviderKeyStatus(),
    });
  });

  app.get('/agent/models', (_req, res) => {
    res.json({ ...catalogForApi(), providerKeys: publicProviderKeyStatus() });
  });

  app.post('/agent/ai/extract-extrato', async (req, res) => {
    const out = await handleAiExtractExtrato(req.body ?? {});
    res.status(out.status).json(out.body);
  });

  app.post('/agent/ai/extract-plano', async (req, res) => {
    const out = await handleAiExtractPlano(req.body ?? {});
    res.status(out.status).json(out.body);
  });

  app.post('/agent/ai/extract-loan-contract', async (req, res) => {
    const out = await handleAiExtractLoanContract(req.body ?? {});
    res.status(out.status).json(out.body);
  });

  app.post('/agent/ai/extract-coligadas', async (req, res) => {
    const out = await handleAiExtractColigadas(req.body ?? {});
    res.status(out.status).json(out.body);
  });

  app.post('/agent/ai/extract-socios', async (req, res) => {
    const out = await handleAiExtractSocios(req.body ?? {});
    res.status(out.status).json(out.body);
  });

  app.post('/agent/ai/ocr-overlay', async (req, res) => {
    const out = await handleAiOcrOverlay(req.body ?? {});
    res.status(out.status).json(out.body);
  });

  app.post('/agent/ai/suggest-regras-contas', async (req, res) => {
    const out = await handleAiSuggestRegrasContas(req.body ?? {});
    res.status(out.status).json(out.body);
  });

  app.post('/agent/ai/suggest-modulo-contas', async (req, res) => {
    const out = await handleAiSuggestModuloContas(req.body ?? {});
    res.status(out.status).json(out.body);
  });

  app.post('/agent/ai/save-api-key', (req, res) => {
    const providerId = String(req.body?.providerId ?? '').trim();
    const apiKey = String(req.body?.apiKey ?? '').trim();
    if (!providerId) {
      res.status(400).json({ ok: false, error: 'providerId obrigatório' });
      return;
    }
    if (!apiKey) {
      res.status(400).json({ ok: false, error: 'apiKey obrigatória' });
      return;
    }
    try {
      saveApiKeyForProvider(providerId, apiKey);
      res.json({ ok: true, providerKeys: publicProviderKeyStatus() });
    } catch (err) {
      res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'Falha ao salvar chave' });
    }
  });

  app.post('/agent/ai/test-connection', async (req, res) => {
    const providerId = String(req.body?.providerId ?? loadAiConfig().providerId ?? 'gemini');
    if (!isProviderConfigured(providerId)) {
      res.status(503).json({ ok: false, detail: 'Chave API não configurada' });
      return;
    }
    if (providerId === 'gemini') {
      const ping = await pingGeminiApi();
      res.json(ping);
      return;
    }
    res.json({ ok: true, detail: `Chave ${providerId} salva — teste completo na primeira extração` });
  });

  app.get('/agent/system-profile', (_req, res) => {
    const profile = analyzeSystemProfile();
    const inferenceLimits = resolveHardwareLimits(profile);
    const catalog = EMBEDDED_AI_CATALOG.map(({ id, label, description, maxRamGb }) => ({
      id,
      label,
      minRamGb: 0,
      maxRamGb: maxRamGb ?? 4,
      description,
    }));
    res.json({ profile, catalog, inferenceLimits });
  });

  async function selectModel(req, res) {
    const body = req.body ?? {};
    const requested = String(
      body.model || body.localModel || resolveLocalModelId(loadAiConfig()) || DEFAULT_EMBEDDED_MODEL_ID,
    );
    const catalogIds = EMBEDDED_AI_CATALOG.map((m) => m.id);
    const model = catalogIds.includes(requested) ? requested : DEFAULT_EMBEDDED_MODEL_ID;
    const labelName = localAiDisplayLabel(model);
    const ping = await pingGeminiApi();
    if (!ping.ok) {
      res.status(503).json({
        ok: false,
        message: 'Gemini indisponível. Defina GEMINI_API_KEY no .env e reinicie npm run dev.',
        recommendedModel: model,
      });
      return;
    }
    const saved = saveAiConfig({
      tier: 'gemini',
      providerId: 'gemini',
      localModel: model,
      model,
    });
    res.json({
      ok: true,
      config: publicAiConfig(saved),
      label: providerDisplayLabel(saved),
      model,
      message: `${labelName} ativa via Gemini.`,
    });
  }

  app.post('/agent/local-ai/setup', selectModel);

  app.get('/agent/local-ai/status', async (_req, res) => {
    const ping = await pingGeminiApi();
    const config = loadAiConfig();
    const model = resolveLocalModelId(config);
    res.json({
      online: ping.ok,
      engine: ping.ok ? 'gemini' : 'none',
      selectedModel: model,
      modelReady: ping.ok,
      label: localAiDisplayLabel(model),
      detail: ping.detail,
    });
  });

  app.get('/agent/local-ai/pull-status', (_req, res) => {
    res.json({ active: false, model: '', lines: [], done: true, error: null });
  });

  app.post('/agent/local-ai/pull', (_req, res) => {
    res.status(410).json({ ok: false, error: 'Download local removido — use Gemini free tier' });
  });

  app.post('/agent/console-autofix', async (req, res) => {
    const body = req.body ?? {};
    const message = String(body.message ?? '').trim();
    const kind = String(body.kind ?? 'error');
    const signature = String(body.signature ?? message.slice(0, 200));
    const url = String(body.url ?? '');
    if (!message) {
      res.status(400).json({ error: 'message obrigatório' });
      return;
    }
    const last = consoleAutofixLast.get(signature) ?? 0;
    if (Date.now() - last < CONSOLE_AUTOFIX_COOLDOWN_MS) {
      res.status(200).json({ skipped: true, reason: 'cooldown' });
      return;
    }
    consoleAutofixLast.set(signature, Date.now());
    let geminiAnalysis = '';
    if (isGeminiConfigured()) {
      try {
        const out = await callGemini({
          systemInstruction: DEBUG_GEMINI_SYSTEM,
          userContent: JSON.stringify({
            kind,
            message,
            url,
            signature,
          }).slice(0, 4000),
          jsonMode: true,
          temperature: 0.1,
        });
        const parsed = parseGeminiJson(out.text);
        geminiAnalysis = parsed?.summary
          ? String(parsed.summary)
          : out.text.slice(0, 500);
      } catch (err) {
        console.warn('[agent-api console-autofix] Gemini:', err instanceof Error ? err.message : err);
      }
    }
    try {
      const result = createCursorHandoff({
        resumo: `[Console ${kind}] Corrigir erro no navegador`,
        limitacao: message,
        tentativas: `URL: ${url}${geminiAnalysis ? `\nGemini: ${geminiAnalysis}` : ''}`,
        sugestaoTecnica: 'Corrigir em src/',
        prioridade: 'alta',
        contexto: { realtime: true, geminiAnalysis, ...body },
      });
      res.status(200).json({ ok: true, realtime: true, geminiAnalysis, ...result });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Falha no autofix' });
    }
  });

  app.post('/agent/cursor-handoff', (req, res) => {
    const body = req.body ?? {};
    const resumo = String(body.resumo ?? '').trim();
    const limitacao = String(body.limitacao ?? '').trim();
    if (!resumo || !limitacao) {
      res.status(400).json({ error: 'resumo e limitacao são obrigatórios' });
      return;
    }
    try {
      const result = createCursorHandoff({
        resumo,
        limitacao,
        tentativas: body.tentativas,
        sugestaoTecnica: body.sugestaoTecnica,
        prioridade: body.prioridade || 'media',
        contexto: body.contexto ?? {},
      });
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Falha no handoff' });
    }
  });

  app.post('/agent/assist', async (req, res) => {
    const { task, payload } = req.body ?? {};

    if (task !== 'ocr_refine' && task !== 'proactive_hint') {
      res.status(400).json({ error: `task não suportada: ${task}` });
      return;
    }

    try {
      if (task === 'proactive_hint') {
        const source = String(payload?.source ?? 'sistema');
        const context = String(payload?.context ?? '').trim();
        const data = payload?.data ?? {};
        if (!context) {
          res.status(400).json({ error: 'payload.context obrigatório' });
          return;
        }

        const hintPrompt = [
          'Se detectar problema, risco ou inconsistência nos fatos, responda UMA frase curta e clara em português BR (máx. 200 caracteres), começando com ⚠️ ou 💡.',
          'Se estiver tudo normal, responda exatamente: OK',
        ].join(' ');
        const hintUser = `Origem: ${source}\nContexto: ${context}\nDados: ${JSON.stringify(data).slice(0, 2000)}`;

        if (isGeminiConfigured()) {
          try {
            const out = await callGemini({
              systemInstruction: `Você monitora o software contábil Eye Vision / ContabilFacil. ${hintPrompt}`,
              userContent: hintUser,
              temperature: 0.2,
            });
            const hint = (out.text ?? '').trim();
            if (!hint || hint.toUpperCase() === 'OK') {
              res.status(200).json({ ok: true, text: '', provider: 'gemini' });
              return;
            }
            res.status(200).json({ ok: true, text: hint, provider: 'gemini', model: out.model });
            return;
          } catch (err) {
            res.status(200).json({
              ok: false,
              skipped: true,
              detail: err?.userHint ?? 'Gemini indisponível',
              reason: 'gemini_error',
            });
            return;
          }
        }

        res.status(503).json({ ok: false, skipped: true, reason: 'gemini_not_configured' });
        return;
      }

      if (task === 'ocr_refine') {
        const out = await handleAiRefineOcrRows(payload ?? {});
        res.status(out.status).json(out.body);
        return;
      }

      res.status(400).json({ error: `task não suportada: ${task}` });
    } catch (err) {
      console.error('[agent-api assist]', err);
      res.status(500).json({
        ok: false,
        detail: err instanceof Error ? err.message : 'Falha na IA',
      });
    }
  });

  async function handleAgentChat(req, res, { stream = false } = {}) {
    const abortController = new AbortController();
    const aborted = { value: false };
    req.on('close', () => {
      aborted.value = true;
      abortController.abort();
    });

    const sendSse = (obj) => {
      if (!stream || res.writableEnded) return;
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
    }

    try {
      const { contents, systemInstruction, fast } = req.body ?? {};
      const result = await handleAgentChatRequest({
        contents,
        systemInstruction,
        fast,
        stream,
        signal: abortController.signal,
        onToken: stream ? (token) => sendSse({ token }) : undefined,
      });

      if (aborted.value || res.writableEnded) return;

      if (stream) {
        if (result.status !== 200) {
          sendSse({ token: result.body?.error ?? 'Erro' });
        }
        sendSse({ done: true, functionCalls: result.body?.functionCalls ?? [] });
        res.end();
        return;
      }

      res.status(result.status).json(result.body);
    } catch (err) {
      if (aborted.value || res.writableEnded || err?.name === 'AbortError') return;
      console.error('[agent-api]', err);
      const msg = err instanceof Error ? err.message : 'Falha na IA';
      const text = `Não foi possível concluir agora: ${msg}`;
      if (stream) {
        sendSse({ token: text });
        sendSse({ done: true, functionCalls: [] });
        res.end();
      } else {
        res.status(200).json({ text, functionCalls: [] });
      }
    }
  }

  app.post('/agent/bot/run', async (req, res) => {
    const config = loadAiConfig();
    const localModel = resolveLocalModelId(config);
    const { tab, company, automation, snapshot } = req.body ?? {};

    const autoSummary = String(automation?.summary ?? 'Automação executada');
    const autoDetails = Array.isArray(automation?.details) ? automation.details : [];
    const autoOk = automation?.ok !== false;

    try {
      const running = await ensureLocalAiEngine();
      if (!running.online || !(await isLocalModelReady(localModel))) {
        res.status(200).json({
          ok: autoOk,
          summary: autoSummary,
          warnings: [],
          suggestions: [],
          skipped: true,
          reason: 'gemini_offline',
        });
        return;
      }

      const tabLabel = String(tab ?? 'aba');
      const empresa = String(company ?? '').trim() || 'sindicato';
      const out = await chatLocal({
        model: localModel,
        messages: [
          { role: 'system', content: buildBotAutomationSystemPrompt() },
          {
            role: 'user',
            content: JSON.stringify({
              aba: tabLabel,
              empresa,
              automacao: { ok: autoOk, summary: autoSummary, details: autoDetails.slice(0, 40), data: automation?.data ?? {} },
              contexto: snapshot ?? {},
              instrucao: 'Valide lançamentos, CPC, razão e diga o que ainda falta automatizar nesta aba.',
            }).slice(0, 8000),
          },
        ],
        options: { fast: false, temperature: 0.1 },
      });

      let parsed = null;
      const raw = String(out.text ?? '').trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          parsed = null;
        }
      }

      res.status(200).json({
        ok: parsed?.ok !== false && autoOk,
        summary: String(parsed?.summary ?? autoSummary),
        warnings: Array.isArray(parsed?.warnings) ? parsed.warnings.map(String).slice(0, 8) : [],
        suggestions: Array.isArray(parsed?.suggestions) ? parsed.suggestions.map(String).slice(0, 8) : [],
      });
    } catch (err) {
      res.status(200).json({
        ok: autoOk,
        summary: autoSummary,
        warnings: [],
        suggestions: [],
        skipped: true,
        reason: err instanceof Error ? err.message : 'bot_review_failed',
      });
    }
  });

  app.post('/agent/chat', (req, res) => handleAgentChat(req, res, { stream: false }));
  app.post('/agent/chat/stream', (req, res) => handleAgentChat(req, res, { stream: true }));

  app.get('/agent/gemini/health', async (_req, res) => {
    const result = await handleGeminiHealth();
    res.status(result.status).json(result.body);
  });

  app.post('/agent/gemini/analyze-extrato-import', async (req, res) => {
    const result = await handleGeminiAnalyzeExtratoImport(req.body ?? {});
    res.status(result.status).json(result.body);
  });

  app.post('/agent/gemini/analyze-debug', async (req, res) => {
    const result = await handleGeminiAnalyzeDebug(req.body ?? {});
    res.status(result.status).json(result.body);
  });

  registerWorkspaceRoutes(app);

  bootstrapLocalAiOnStartup().catch((err) => {
    console.warn(`[agent-api] Bootstrap: ${err instanceof Error ? err.message : err}`);
  });
}
