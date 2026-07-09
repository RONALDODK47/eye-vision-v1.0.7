/**
 * Backup local das chaves API (localStorage + sync na nuvem Eye Vision).
 * O servidor (.data/api-keys/{provedor}/) continua sendo a fonte para chamadas à IA.
 */
import { writePersistedLocalStorageJson, readPersistedLocalStorageJson } from '../../lib/persistentLocalStorage';
import type { AiProviderId } from './aiModelCatalog';

const STORAGE_KEY = 'contabilfacil_ai_secrets_v1';

type AiSecretsLocalPayload = Partial<Record<AiProviderId, string>> & {
  updatedAt?: string;
};

export function readLocalApiKeys(): Partial<Record<AiProviderId, string>> {
  const raw = readPersistedLocalStorageJson<AiSecretsLocalPayload>(STORAGE_KEY, {});
  const out: Partial<Record<AiProviderId, string>> = {};
  for (const [pid, key] of Object.entries(raw)) {
    if (pid === 'updatedAt') continue;
    const k = String(key ?? '').trim();
    if (k.length > 8) out[pid as AiProviderId] = k;
  }
  return out;
}

export function writeLocalApiKey(providerId: AiProviderId, apiKey: string): void {
  const key = String(apiKey ?? '').trim();
  const prev = readPersistedLocalStorageJson<AiSecretsLocalPayload>(STORAGE_KEY, {});
  const next: AiSecretsLocalPayload = { ...prev, updatedAt: new Date().toISOString() };
  if (key.length > 8) {
    next[providerId] = key;
  } else {
    delete next[providerId];
  }
  writePersistedLocalStorageJson(STORAGE_KEY, next);
}

export function removeLocalApiKey(providerId: AiProviderId): void {
  writeLocalApiKey(providerId, '');
}
