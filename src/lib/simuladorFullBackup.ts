import { format } from 'date-fns';
import { downloadJsonBackup } from './jsonBackup';
import { listMemoryFallbackEntries, safeLocalStorageGetItem, safeLocalStorageSetItem } from './safeLocalStorage';

export const SIMULADOR_FULL_BACKUP_VERSION = 1 as const;

/** Chaves canônicas gravadas pelo simulador. */
export const SIMULADOR_CANONICAL_STORAGE_KEYS = [
  'simulador_contracts',
  'simulador_parcelamentos',
  'simulador_aplicacoes',
  'simulador_precificacao_v1',
] as const;

/** Dados auxiliares do mesmo produto (extrato PDF, layouts). */
export const SIMULADOR_EXTRA_STORAGE_KEYS = ['pdfLayouts', 'extratoVision_conciliacoes_v1'] as const;

/** Chaves legadas removidas na importação para evitar mistura com backup antigo. */
export const SIMULADOR_LEGACY_STORAGE_KEYS = [
  'contracts',
  'emprestimos_contracts',
  'simulador_contratos',
  'parcelamentos',
  'emprestimos_parcelamentos',
  'aplicacoes',
  'emprestimos_aplicacoes',
] as const;

export const SIMULADOR_ALL_MANAGED_STORAGE_KEYS = [
  ...SIMULADOR_CANONICAL_STORAGE_KEYS,
  ...SIMULADOR_EXTRA_STORAGE_KEYS,
  ...SIMULADOR_LEGACY_STORAGE_KEYS,
] as const;

export type SimuladorFullBackupV1 = {
  version: typeof SIMULADOR_FULL_BACKUP_VERSION;
  exportedAt: string;
  storage: Record<string, unknown>;
};

export type SimuladorFullBackupImportSummary = {
  contracts: number;
  parcelamentos: number;
  aplicacoes: number;
  /** Chaves contabilfacil_* (plano, razão, extrato gerencial por empresa). */
  gerencialKeys: number;
  extraKeys: string[];
};

const CONTABILFACIL_STORAGE_PREFIX = 'contabilfacil_';

function readStorageValue(key: string): unknown | undefined {
  // Preferir memória (pode ter valor mais novo se LS falhou por cota)
  const mem = safeLocalStorageGetItem(key);
  if (mem == null) return undefined;
  try {
    return JSON.parse(mem) as unknown;
  } catch {
    return mem;
  }
}

function writeStorageValue(key: string, value: unknown): void {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  safeLocalStorageSetItem(key, raw);
}

function clearManagedStorage(): void {
  for (const key of SIMULADOR_ALL_MANAGED_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
}

function listContabilfacilStorageKeys(): string[] {
  const keys = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(CONTABILFACIL_STORAGE_PREFIX)) keys.add(key);
  }
  // Inclui chaves que só estão em memória (cota cheia)
  for (const [key] of listMemoryFallbackEntries()) {
    if (key.startsWith(CONTABILFACIL_STORAGE_PREFIX)) keys.add(key);
  }
  return Array.from(keys);
}

function clearContabilfacilStorage(): void {
  for (const key of listContabilfacilStorageKeys()) {
    localStorage.removeItem(key);
  }
}

export function clearEyeVisionOperationalLocalStorage(): void {
  clearManagedStorage();
  clearContabilfacilStorage();
  const extratoKeys = [
    'extratoVision_conciliacoes_v1',
    'extratoVision_empresa_padrao_v1',
    'extratoVision_empresa_codigo_padrao_v1',
    'extratoVision_balancetes_salvos_v1',
    'extratoVision_workspace_snapshots_v1',
  ];
  for (const key of extratoKeys) {
    localStorage.removeItem(key);
  }
}

export function collectSimuladorFullBackup(): SimuladorFullBackupV1 {
  const storage: Record<string, unknown> = {};
  for (const key of [...SIMULADOR_CANONICAL_STORAGE_KEYS, ...SIMULADOR_EXTRA_STORAGE_KEYS]) {
    const value = readStorageValue(key);
    if (value !== undefined) storage[key] = value;
  }
  for (const key of listContabilfacilStorageKeys()) {
    const value = readStorageValue(key);
    if (value !== undefined) storage[key] = value;
  }
  return {
    version: SIMULADOR_FULL_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    storage,
  };
}

/**
 * Backup completo para a pasta local — inclui stores + textos da Inteligência IA (IndexedDB).
 * Garante que docs salvos nas pastas (Outros, Coligadas, etc.) entrem no eye-vision-dados.json.
 */
export async function collectSimuladorFullBackupForFolder(): Promise<SimuladorFullBackupV1> {
  const payload = collectSimuladorFullBackup();
  try {
    const { idbExportAllDocTexts, idbExportAllInteligenciaStores } = await import(
      './aiInteligenciaIdb'
    );

    // 1) Stores completos do IndexedDB (lista de docs) — fonte confiável se LS falhou/cota
    const idbStores = await idbExportAllInteligenciaStores();
    for (const row of idbStores) {
      const key = `contabilfacil_${row.companySlug}_ai_inteligencia_v1`;
      let parsed: { docs?: unknown[]; coligadas?: unknown[]; updatedAt?: string } | null = null;
      try {
        parsed = JSON.parse(row.payload) as {
          docs?: unknown[];
          coligadas?: unknown[];
          updatedAt?: string;
        };
      } catch {
        continue;
      }
      if (!parsed || !Array.isArray(parsed.docs)) continue;

      const existing = payload.storage[key] as
        | { docs?: unknown[]; coligadas?: unknown[]; updatedAt?: string }
        | undefined;
      const existingCount = Array.isArray(existing?.docs) ? existing.docs.length : 0;
      const idbCount = parsed.docs.length;
      const useIdb =
        !existing ||
        idbCount > existingCount ||
        (idbCount === existingCount &&
          Date.parse(parsed.updatedAt || row.updatedAt || 0) >=
            Date.parse(existing.updatedAt || 0));

      if (useIdb) {
        payload.storage[key] = {
          docs: parsed.docs,
          coligadas: Array.isArray(parsed.coligadas) ? parsed.coligadas : existing?.coligadas ?? [],
          updatedAt: parsed.updatedAt || row.updatedAt || new Date().toISOString(),
        };
      }
    }

    // 2) Textos completos dos documentos
    const texts = await idbExportAllDocTexts();
    if (texts.length === 0) return payload;

    const bySlug = new Map<string, Map<string, string>>();
    for (const t of texts) {
      let m = bySlug.get(t.companySlug);
      if (!m) {
        m = new Map();
        bySlug.set(t.companySlug, m);
      }
      m.set(t.docId, t.texto);
    }

    for (const [key, value] of Object.entries(payload.storage)) {
      if (!key.includes('_ai_inteligencia_v1') || !value || typeof value !== 'object') continue;
      const store = value as { docs?: Array<{ id: string; textoExtraido?: string }> };
      if (!Array.isArray(store.docs)) continue;
      const m = key.match(/^contabilfacil_(.+)_ai_inteligencia_v1$/);
      const slug = m?.[1];
      if (!slug) continue;
      const textMap = bySlug.get(slug);
      if (!textMap) continue;
      store.docs = store.docs.map((d) => ({
        ...d,
        textoExtraido: textMap.get(d.id) || d.textoExtraido || '',
      }));
      payload.storage[key] = store;
    }
  } catch {
    /* pasta ainda grava o que houver no LS mesmo se IDB falhar */
  }
  return payload;
}

export function downloadSimuladorFullBackup(): void {
  const payload = collectSimuladorFullBackup();
  downloadJsonBackup(
    `simulador_backup_completo_${format(new Date(), 'yyyy-MM-dd_HHmm')}.json`,
    payload
  );
}

function normalizeImportPayload(raw: unknown): SimuladorFullBackupV1 {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Arquivo JSON inválido ou vazio.');
  }

  const o = raw as Record<string, unknown>;

  if (o.version === SIMULADOR_FULL_BACKUP_VERSION && o.storage && typeof o.storage === 'object') {
    return {
      version: SIMULADOR_FULL_BACKUP_VERSION,
      exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : new Date().toISOString(),
      storage: o.storage as Record<string, unknown>,
    };
  }

  if (Array.isArray(raw)) {
    return {
      version: SIMULADOR_FULL_BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      storage: { simulador_contracts: raw },
    };
  }

  const storage: Record<string, unknown> = {};
  if (o.simulador_contracts != null) storage.simulador_contracts = o.simulador_contracts;
  else if (o.contracts != null) storage.simulador_contracts = o.contracts;

  if (o.simulador_parcelamentos != null) storage.simulador_parcelamentos = o.simulador_parcelamentos;
  else if (o.parcelamentos != null) storage.simulador_parcelamentos = o.parcelamentos;

  if (o.simulador_aplicacoes != null) storage.simulador_aplicacoes = o.simulador_aplicacoes;
  else if (o.aplicacoes != null) storage.simulador_aplicacoes = o.aplicacoes;

  if (Object.keys(storage).length > 0) {
    return {
      version: SIMULADOR_FULL_BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      storage,
    };
  }

  throw new Error(
    'Formato não reconhecido. Use um backup completo exportado por «Exportar todos os dados».'
  );
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * Substitui todos os dados gerenciados no `localStorage` pelo conteúdo do backup.
 * Também restaura textos/stores da Inteligência IA no IndexedDB.
 */
export function importSimuladorFullBackupOverwrite(raw: unknown): SimuladorFullBackupImportSummary {
  const backup = normalizeImportPayload(raw);
  clearManagedStorage();
  clearContabilfacilStorage();

  const allowed = new Set<string>([
    ...SIMULADOR_CANONICAL_STORAGE_KEYS,
    ...SIMULADOR_EXTRA_STORAGE_KEYS,
  ]);

  const extraKeys: string[] = [];
  let gerencialKeys = 0;
  for (const [key, value] of Object.entries(backup.storage)) {
    if (value === undefined || value === null) continue;
    const isGerencial = key.startsWith(CONTABILFACIL_STORAGE_PREFIX);
    if (!allowed.has(key) && !isGerencial) {
      extraKeys.push(key);
      continue;
    }
    writeStorageValue(key, value);
    if (isGerencial) gerencialKeys += 1;
  }

  // Restaura Inteligência IA no IndexedDB (async, best-effort)
  void restoreAiInteligenciaFromBackup(backup);

  return {
    contracts: countArray(backup.storage.simulador_contracts),
    parcelamentos: countArray(backup.storage.simulador_parcelamentos),
    aplicacoes: countArray(backup.storage.simulador_aplicacoes),
    gerencialKeys,
    extraKeys,
  };
}

async function restoreAiInteligenciaFromBackup(backup: SimuladorFullBackupV1): Promise<void> {
  try {
    const { idbPutDocText, idbPutInteligenciaStore } = await import('./aiInteligenciaIdb');
    for (const [key, value] of Object.entries(backup.storage)) {
      if (!key.includes('_ai_inteligencia_v1') || !value || typeof value !== 'object') continue;
      const m = key.match(/^contabilfacil_(.+)_ai_inteligencia_v1$/);
      const slug = m?.[1];
      if (!slug) continue;
      const store = value as {
        docs?: Array<{ id: string; textoExtraido?: string }>;
        coligadas?: unknown[];
        updatedAt?: string;
      };
      // Meta leve no IDB (lista de docs)
      const light = {
        ...store,
        docs: Array.isArray(store.docs)
          ? store.docs.map((d) => ({
              ...d,
              textoExtraido: String(d.textoExtraido ?? '').slice(0, 400),
            }))
          : [],
      };
      await idbPutInteligenciaStore(slug, JSON.stringify(light));
      if (Array.isArray(store.docs)) {
        for (const d of store.docs) {
          const texto = String(d.textoExtraido ?? '');
          if (texto) await idbPutDocText(slug, d.id, texto.slice(0, 12_000));
        }
      }
    }
  } catch {
    /* IDB opcional no import */
  }
}
