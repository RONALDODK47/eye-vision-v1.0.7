/** Catálogo frontend — espelha scripts/ai-model-catalog.mjs */

export type AiPricingTier = 'free' | 'limited' | 'paid';
export type AiProviderId = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'mistral';
export type AiExtractEngine = 'ai' | 'hybrid';

/** Migra valores legados (ocr local) para motores ativos. */
export function normalizeExtractEngine(eng?: string | null): AiExtractEngine {
  if (eng === 'ai') return 'ai';
  return 'hybrid';
}

export interface AiProviderInfo {
  id: AiProviderId;
  label: string;
  keyEnvVar: string;
  docsUrl: string;
}

export interface AiModelEntry {
  id: string;
  providerId: AiProviderId;
  label: string;
  tier: AiPricingTier;
  tierLabel: string;
  hint?: string;
  supportsVision?: boolean;
  supportsExtract?: boolean;
}

export interface AiTierInfo {
  id: AiPricingTier;
  label: string;
  description: string;
}

export const AI_TIER_INFO: AiTierInfo[] = [
  { id: 'free', label: 'Totalmente grátis', description: 'Cota gratuita permanente ou generosa' },
  { id: 'limited', label: 'Grátis limitado', description: 'Trial, preview ou quota diária reduzida' },
  { id: 'paid', label: 'Somente pago', description: 'Requer billing ativo na plataforma' },
];

export const AI_PROVIDERS: AiProviderInfo[] = [
  { id: 'gemini', label: 'Google Gemini', keyEnvVar: 'GEMINI_API_KEY', docsUrl: 'https://aistudio.google.com/apikey' },
  { id: 'openai', label: 'OpenAI', keyEnvVar: 'OPENAI_API_KEY', docsUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', label: 'Anthropic Claude', keyEnvVar: 'ANTHROPIC_API_KEY', docsUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'groq', label: 'Groq', keyEnvVar: 'GROQ_API_KEY', docsUrl: 'https://console.groq.com/keys' },
  { id: 'mistral', label: 'Mistral AI', keyEnvVar: 'MISTRAL_API_KEY', docsUrl: 'https://console.mistral.ai/api-keys' },
];

export const AI_MODEL_CATALOG: AiModelEntry[] = [
  { id: 'gemini-2.5-flash', providerId: 'gemini', label: 'Gemini 2.5 Flash', tier: 'free', tierLabel: 'Grátis', hint: 'Recomendado', supportsVision: true, supportsExtract: true },
  { id: 'gemini-2.5-flash-lite', providerId: 'gemini', label: 'Gemini 2.5 Flash Lite', tier: 'free', tierLabel: 'Grátis', supportsVision: true, supportsExtract: true },
  { id: 'gemini-flash-lite-latest', providerId: 'gemini', label: 'Gemini Flash Lite (latest)', tier: 'free', tierLabel: 'Grátis', supportsVision: true, supportsExtract: true },
  { id: 'gemini-3-flash-preview', providerId: 'gemini', label: 'Gemini 3 Flash Preview', tier: 'limited', tierLabel: 'Grátis limitado', hint: 'Preview', supportsVision: true, supportsExtract: true },
  { id: 'gemini-3.1-flash-lite-preview', providerId: 'gemini', label: 'Gemini 3.1 Flash Lite Preview', tier: 'limited', tierLabel: 'Grátis limitado', supportsVision: true, supportsExtract: true },
  { id: 'gemini-2.5-pro', providerId: 'gemini', label: 'Gemini 2.5 Pro', tier: 'paid', tierLabel: 'Pago', supportsVision: true, supportsExtract: true },
  { id: 'gemini-2.0-flash', providerId: 'gemini', label: 'Gemini 2.0 Flash', tier: 'paid', tierLabel: 'Pago', supportsVision: true, supportsExtract: true },
  { id: 'gpt-4o-mini', providerId: 'openai', label: 'GPT-4o Mini', tier: 'limited', tierLabel: 'Grátis limitado', supportsVision: true, supportsExtract: true },
  { id: 'gpt-4o', providerId: 'openai', label: 'GPT-4o', tier: 'paid', tierLabel: 'Pago', supportsVision: true, supportsExtract: true },
  { id: 'gpt-4.1-mini', providerId: 'openai', label: 'GPT-4.1 Mini', tier: 'paid', tierLabel: 'Pago', supportsVision: true, supportsExtract: true },
  { id: 'gpt-4.1', providerId: 'openai', label: 'GPT-4.1', tier: 'paid', tierLabel: 'Pago', supportsVision: true, supportsExtract: true },
  { id: 'claude-3-5-haiku-latest', providerId: 'anthropic', label: 'Claude 3.5 Haiku', tier: 'limited', tierLabel: 'Grátis limitado', supportsVision: true, supportsExtract: true },
  { id: 'claude-sonnet-4-20250514', providerId: 'anthropic', label: 'Claude Sonnet 4', tier: 'paid', tierLabel: 'Pago', supportsVision: true, supportsExtract: true },
  { id: 'claude-opus-4-20250514', providerId: 'anthropic', label: 'Claude Opus 4', tier: 'paid', tierLabel: 'Pago', supportsVision: true, supportsExtract: true },
  { id: 'llama-3.3-70b-versatile', providerId: 'groq', label: 'Llama 3.3 70B (Groq)', tier: 'free', tierLabel: 'Grátis', hint: 'Só texto', supportsVision: false, supportsExtract: false },
  { id: 'llama-3.1-8b-instant', providerId: 'groq', label: 'Llama 3.1 8B Instant', tier: 'free', tierLabel: 'Grátis', supportsVision: false, supportsExtract: false },
  { id: 'mistral-small-latest', providerId: 'mistral', label: 'Mistral Small', tier: 'limited', tierLabel: 'Grátis limitado', supportsVision: false, supportsExtract: true },
  { id: 'mistral-large-latest', providerId: 'mistral', label: 'Mistral Large', tier: 'paid', tierLabel: 'Pago', supportsVision: false, supportsExtract: true },
];

const WEAK_MODEL_PATTERNS = [/lite/i, /-mini/i, /8b/i, /haiku/i, /instant/i];

export function isWeakAiModel(m: AiModelEntry): boolean {
  return WEAK_MODEL_PATTERNS.some((p) => p.test(m.id));
}

/** Modelos que servem para extrato/conciliação/regras — sem variantes fracas (lite/mini/8b). */
export function modelDaContaDoRecado(m: AiModelEntry): boolean {
  if (m.supportsExtract !== true || m.supportsVision === false) return false;
  if (isWeakAiModel(m)) return false;
  return true;
}

export function modelsForProvider(providerId: AiProviderId): AiModelEntry[] {
  return AI_MODEL_CATALOG.filter((m) => m.providerId === providerId);
}

/** Só modelos capazes de extrato / conciliação com IA (esconde texto-puro tipo Groq). */
export function modelsCapableForProvider(providerId: AiProviderId): AiModelEntry[] {
  return modelsForProvider(providerId).filter(modelDaContaDoRecado);
}

export function providersWithCapableModels(): AiProviderInfo[] {
  return AI_PROVIDERS.filter((p) => modelsCapableForProvider(p.id).length > 0);
}

export function modelsForTier(tier: AiPricingTier): AiModelEntry[] {
  return AI_MODEL_CATALOG.filter((m) => m.tier === tier);
}

export function findModel(modelId: string): AiModelEntry | undefined {
  return AI_MODEL_CATALOG.find((m) => m.id === modelId);
}

export function tierBadgeClass(tier: AiPricingTier): string {
  switch (tier) {
    case 'free':
      return 'bg-green-100 text-green-900 border-green-700';
    case 'limited':
      return 'bg-amber-100 text-amber-900 border-amber-600';
    case 'paid':
      return 'bg-purple-100 text-purple-900 border-purple-700';
  }
}

export const EXTRACT_ENGINE_LABELS: Record<AiExtractEngine, string> = {
  ai: 'Somente IA (visão)',
  hybrid: 'Híbrido (texto nativo + IA corrige)',
};

/** Rótulo curto no banner do mapeamento de extrato (modo ativo). */
export const EXTRACT_ENGINE_BANNER_LABELS: Record<AiExtractEngine, string> = {
  ai: 'IA',
  hybrid: 'Híbrido',
};
