/** Gemini free tier — espelho do backend. */
export const MAX_EMBEDDED_RAM_GB = 4;

export const EMBEDDED_AI_LIMITS = {
  num_ctx: 768,
  num_predict: 128,
} as const;

export const EMBEDDED_AI_CATALOG = [
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    maxRamGb: MAX_EMBEDDED_RAM_GB,
    description: 'Google Gemini free tier — auditoria OCR, debug e chat contábil.',
  },
] as const;

export const DEFAULT_EMBEDDED_MODEL_ID = 'gemini-2.5-flash';

export function embeddedAiLabel(modelId: string): string {
  const hit = EMBEDDED_AI_CATALOG.find((m) => m.id === modelId || modelId.startsWith(m.id));
  return hit?.label ?? 'Gemini AI';
}
