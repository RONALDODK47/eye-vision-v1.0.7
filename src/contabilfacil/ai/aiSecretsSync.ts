/**
 * Restaura chaves salvas localmente (localStorage / nuvem) no servidor quando necessário.
 */
import type { AiProviderId } from './aiModelCatalog';
import type { ProviderKeyStatusMap } from './aiCatalog';
import { saveApiKeyOnly } from './aiSettingsClient';
import { readLocalApiKeys } from './aiSecretsLocalStore';

export async function restoreLocalApiKeysToServer(
  providerKeys: ProviderKeyStatusMap,
): Promise<ProviderKeyStatusMap> {
  const local = readLocalApiKeys();
  let merged = { ...providerKeys };

  for (const [pid, key] of Object.entries(local)) {
    const providerId = pid as AiProviderId;
    if (!key || merged[providerId]?.configured) continue;
    const result = await saveApiKeyOnly(providerId, key);
    if (result.ok && result.providerKeys) {
      merged = { ...merged, ...result.providerKeys };
    }
  }

  return merged;
}
