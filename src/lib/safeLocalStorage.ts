/**
 * localStorage à prova de QuotaExceededError.
 * Mantém dados em memória se o disco do browser estiver cheio.
 */

const memoryFallback = new Map<string, string>();

export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014 ||
    /quota/i.test(String(e.message ?? ''))
  );
}

/**
 * Libera espaço removendo só payloads GIGANTES.
 * NÃO apaga meta leve de inteligência (docs salvos nas pastas).
 */
export function reclaimLocalStorageSpace(preferKeys: string[] = []): number {
  let freed = 0;
  const HUGE = 80_000; // ~80 KB — meta leve fica bem abaixo
  try {
    for (const key of preferKeys) {
      // Nunca apaga a chave de inteligência leve — só se estiver enorme (legado)
      if (key.includes('_ai_inteligencia_v1')) {
        const raw = localStorage.getItem(key);
        if (raw && raw.length > HUGE) {
          freed += raw.length;
          localStorage.removeItem(key);
        }
        continue;
      }
      const raw = localStorage.getItem(key);
      if (raw && raw.length > HUGE) {
        freed += raw.length;
        localStorage.removeItem(key);
      }
    }
    // Remove só textos legados enormes de inteligência (não a meta atual)
    const toDrop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.includes('_ai_inteligencia_docs_')) {
        toDrop.push(k);
        continue;
      }
      if (k.includes('_ai_inteligencia_v1')) {
        const raw = localStorage.getItem(k);
        if (raw && raw.length > HUGE) toDrop.push(k);
      }
    }
    for (const k of toDrop) {
      const raw = localStorage.getItem(k);
      if (raw) freed += raw.length;
      localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
  return freed;
}

/**
 * setItem seguro: em caso de cota, tenta reclaim + retry; se falhar, guarda em memória.
 * Nunca lança QuotaExceededError.
 */
export function safeLocalStorageSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    memoryFallback.set(key, value); // espelho para backup da pasta
    return true;
  } catch (err) {
    if (!isQuotaExceededError(err)) {
      console.warn(`[storage] falha ao gravar ${key}:`, err);
      memoryFallback.set(key, value);
      return false;
    }
    reclaimLocalStorageSpace(
      key.includes('_ai_inteligencia') ? [] : [key],
    );
    try {
      localStorage.setItem(key, value);
      memoryFallback.set(key, value);
      return true;
    } catch (err2) {
      console.warn(
        `[storage] cota cheia — ${key} ficou em memória + pasta (${Math.round(value.length / 1024)} KB).`,
        err2,
      );
      memoryFallback.set(key, value);
      return false;
    }
  }
}

export function safeLocalStorageGetItem(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) {
      memoryFallback.set(key, raw);
      return raw;
    }
  } catch {
    /* ignore */
  }
  return memoryFallback.get(key) ?? null;
}

export function safeLocalStorageRemoveItem(key: string): void {
  memoryFallback.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Todas as chaves em memória (para backup na pasta quando LS falhou). */
export function listMemoryFallbackEntries(): Array<[string, string]> {
  return Array.from(memoryFallback.entries());
}

export function getMemoryFallbackValue(key: string): string | undefined {
  return memoryFallback.get(key);
}
