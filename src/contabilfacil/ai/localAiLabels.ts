import { EMBEDDED_AI_CATALOG } from './embeddedAiCatalog';

export const LOCAL_AI_LABELS = Object.fromEntries(
  EMBEDDED_AI_CATALOG.map((m) => [m.id, m.label]),
);

export function localAiDisplayLabel(modelId: string): string {
  const hit = EMBEDDED_AI_CATALOG.find((m) => m.id === modelId || modelId.startsWith(m.id));
  return hit?.label ?? 'IA embarcada';
}
