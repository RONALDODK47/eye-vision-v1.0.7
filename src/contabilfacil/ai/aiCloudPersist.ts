/**
 * Sincroniza configuração de IA entre Firestore e servidor local (.data).
 */
import {
  readPersistedLocalStorageJson,
  writePersistedLocalStorageJson,
} from '../../lib/persistentLocalStorage';
import { saveAiConfig } from './aiSettingsClient';
import { restoreLocalApiKeysToServer } from './aiSecretsSync';
import type { AiConfig } from './aiCatalog';
import type { AiProviderId, AiExtractEngine } from './aiModelCatalog';

export const AI_CONFIG_CLOUD_KEY = 'contabilfacil_ai_config_v1';

export function persistAiConfigToCloudStorage(config: AiConfig): void {
  writePersistedLocalStorageJson(AI_CONFIG_CLOUD_KEY, {
    providerId: config.providerId,
    model: config.model,
    localModel: config.localModel,
    extractEngine: config.extractEngine,
    pricingTier: config.pricingTier,
    tier: config.tier,
    updatedAt: new Date().toISOString(),
  });
}

/** Após hidratar do Firestore, repõe servidor local de IA (outro navegador / máquina). */
export async function restoreAiSettingsFromCloudStorage(): Promise<void> {
  const config = readPersistedLocalStorageJson<Partial<AiConfig> | null>(AI_CONFIG_CLOUD_KEY, null);
  if (config?.providerId) {
    try {
      await saveAiConfig({
        providerId: config.providerId as AiProviderId,
        model: config.model,
        localModel: config.localModel,
        extractEngine: config.extractEngine as AiExtractEngine | undefined,
      });
    } catch {
      /* agent-api offline */
    }
  }

  try {
    await restoreLocalApiKeysToServer({});
  } catch {
    /* agent-api offline */
  }
}
