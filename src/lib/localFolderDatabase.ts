import { format } from 'date-fns';
import {
  importSimuladorFullBackupOverwrite,
  type SimuladorFullBackupImportSummary,
  type SimuladorFullBackupV1,
} from './simuladorFullBackup';
import { yieldToMain } from '../contabilfacil/lib/deferIdle';
import {
  hasOperationalStorageDirty,
  markOperationalFolderFlushed,
} from '../contabilfacil/logic/eyeVisionOperationalSave';
import {
  clearFolderHandle,
  loadFolderHandle,
  saveFolderHandle,
} from './localFolderDbHandleStore';

export const LOCAL_DB_MAIN_FILE = 'eye-vision-dados.json';
export const LOCAL_DB_LATEST_POINTER = 'eye-vision-latest.json';
export const LOCAL_DB_SAVE_PREFIX = 'eye-vision-dados_';
export const LOCAL_FOLDER_DB_CHANGED = 'eye-vision-local-db-changed';
const MAX_VERSIONED_SAVES = 120;
const META_KEY = 'eye_vision_local_folder_db_v1';

export type LocalFolderDbMeta = {
  folderLabel: string;
  lastSavedAt: string | null;
  lastLoadedAt: string | null;
  lastSavedFile?: string | null;
  /**
   * Espelho local ativo (já salvou ao menos uma vez).
   * NÃO pausa Postgres/MinIO — a pasta é backup paralelo de proteção.
   */
  localDbActivated: boolean;
};

type FolderPermission = 'granted' | 'denied' | 'prompt';

function signalLocalDbChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LOCAL_FOLDER_DB_CHANGED));
  }
}
let cachedHandle: FileSystemDirectoryHandle | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveInFlight = false;
let pendingSave = false;
let lastSaveError: string | null = null;
let lastSavePhase: 'idle' | 'scheduled' | 'saving' | 'saved' | 'error' = 'idle';

const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach((fn) => fn());
}

export type LocalFolderSavePhase = 'idle' | 'scheduled' | 'saving' | 'saved' | 'error';

export function getLocalFolderSavePhase(): LocalFolderSavePhase {
  return lastSavePhase;
}

export function getLocalFolderSaveError(): string | null {
  return lastSaveError;
}

function setSavePhase(phase: LocalFolderSavePhase, error: string | null = null): void {
  lastSavePhase = phase;
  lastSaveError = error;
  notifyListeners();
}

export function subscribeLocalFolderDb(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isLocalFolderDbSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

function readMeta(): LocalFolderDbMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalFolderDbMeta & { localDbActivated?: boolean };
    return {
      folderLabel: parsed.folderLabel ?? '',
      lastSavedAt: parsed.lastSavedAt ?? null,
      lastLoadedAt: parsed.lastLoadedAt ?? null,
      lastSavedFile: parsed.lastSavedFile ?? null,
      localDbActivated: parsed.localDbActivated ?? Boolean(parsed.lastSavedAt),
    };
  } catch {
    return null;
  }
}

function writeMeta(patch: Partial<LocalFolderDbMeta>): LocalFolderDbMeta {
  const prev = readMeta() ?? {
    folderLabel: '',
    lastSavedAt: null,
    lastLoadedAt: null,
    localDbActivated: false,
  };
  const next = { ...prev, ...patch };
  localStorage.setItem(META_KEY, JSON.stringify(next));
  notifyListeners();
  return next;
}

export function getLocalFolderDbMeta(): LocalFolderDbMeta | null {
  return readMeta();
}

export function isLocalFolderDbConfigured(): boolean {
  return Boolean(readMeta()?.folderLabel);
}

/** Pasta configurada e já espelhada ao menos uma vez (backup paralelo). */
export function isLocalFolderDbActivated(): boolean {
  const meta = readMeta();
  return Boolean(meta?.localDbActivated && meta.folderLabel);
}

/**
 * Auto-load da pasta na abertura.
 * Desligado: Postgres/MinIO são a fonte; a pasta só espelha (proteção).
 */
export function shouldAutoLoadLocalFolder(): boolean {
  return false;
}

/** @deprecated Preferir mirror — mantido para compat. */
export function markLocalFolderDbActivated(): void {
  writeMeta({ localDbActivated: true });
}

async function ensureHandlePermission(
  handle: FileSystemDirectoryHandle,
  mode: FileSystemPermissionMode = 'readwrite',
): Promise<boolean> {
  const opts = { mode };
  const current = (await handle.queryPermission(opts)) as FolderPermission;
  if (current === 'granted') return true;
  const requested = (await handle.requestPermission(opts)) as FolderPermission;
  return requested === 'granted';
}

async function getWritableHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (cachedHandle) {
    const ok = await ensureHandlePermission(cachedHandle);
    if (ok) return cachedHandle;
    cachedHandle = null;
  }
  const stored = await loadFolderHandle();
  if (!stored) return null;
  const ok = await ensureHandlePermission(stored);
  if (!ok) return null;
  cachedHandle = stored;
  return stored;
}

async function readNamedJsonFile<T>(handle: FileSystemDirectoryHandle, name: string): Promise<T | null> {
  try {
    const fileHandle = await handle.getFileHandle(name);
    const file = await fileHandle.getFile();
    const text = await file.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function writeNamedJsonFile(
  handle: FileSystemDirectoryHandle,
  name: string,
  payload: unknown,
): Promise<void> {
  await yieldToMain();
  const serialized = JSON.stringify(payload);
  await yieldToMain();
  const fileHandle = await handle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(serialized);
  await writable.close();
}

async function readMainFile(handle: FileSystemDirectoryHandle): Promise<SimuladorFullBackupV1 | null> {
  return readNamedJsonFile<SimuladorFullBackupV1>(handle, LOCAL_DB_MAIN_FILE);
}

type LatestSavePointer = {
  file: string;
  exportedAt: string;
};

async function readLatestPointer(handle: FileSystemDirectoryHandle): Promise<LatestSavePointer | null> {
  return readNamedJsonFile<LatestSavePointer>(handle, LOCAL_DB_LATEST_POINTER);
}

async function writeLatestPointer(handle: FileSystemDirectoryHandle, pointer: LatestSavePointer): Promise<void> {
  await writeNamedJsonFile(handle, LOCAL_DB_LATEST_POINTER, pointer);
}

function isVersionedSaveFile(name: string): boolean {
  return name.startsWith(LOCAL_DB_SAVE_PREFIX) && name.endsWith('.json');
}

async function findNewestVersionedFile(handle: FileSystemDirectoryHandle): Promise<string | null> {
  const names: string[] = [];
  try {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file' && isVersionedSaveFile(entry.name)) {
        names.push(entry.name);
      }
    }
  } catch {
    return null;
  }
  if (names.length === 0) return null;
  names.sort((a, b) => b.localeCompare(a));
  return names[0] ?? null;
}

async function pruneOldVersionedSaves(handle: FileSystemDirectoryHandle): Promise<void> {
  const names: string[] = [];
  try {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file' && isVersionedSaveFile(entry.name)) {
        names.push(entry.name);
      }
    }
  } catch {
    return;
  }
  if (names.length <= MAX_VERSIONED_SAVES) return;
  names.sort((a, b) => b.localeCompare(a));
  for (const name of names.slice(MAX_VERSIONED_SAVES)) {
    try {
      await handle.removeEntry(name);
    } catch {
      /* ignore */
    }
  }
}

async function writeVersionedSave(
  handle: FileSystemDirectoryHandle,
  payload: SimuladorFullBackupV1,
): Promise<string> {
  const stamp = format(new Date(), 'yyyy-MM-dd_HHmmss');
  const seq = String(Date.now() % 1000).padStart(3, '0');
  const fileName = `${LOCAL_DB_SAVE_PREFIX}${stamp}_${seq}.json`;
  await writeNamedJsonFile(handle, fileName, payload);
  await writeLatestPointer(handle, { file: fileName, exportedAt: payload.exportedAt });
  await pruneOldVersionedSaves(handle);
  return fileName;
}

async function readLatestPayload(handle: FileSystemDirectoryHandle): Promise<SimuladorFullBackupV1 | null> {
  const pointer = await readLatestPointer(handle);
  if (pointer?.file) {
    const fromPointer = await readNamedJsonFile<SimuladorFullBackupV1>(handle, pointer.file);
    if (fromPointer) return fromPointer;
  }
  const newest = await findNewestVersionedFile(handle);
  if (newest) {
    const fromNewest = await readNamedJsonFile<SimuladorFullBackupV1>(handle, newest);
    if (fromNewest) return fromNewest;
  }
  return readMainFile(handle);
}

export async function pickLocalDatabaseFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!isLocalFolderDbSupported()) {
    throw new Error('Seu navegador não suporta escolher pasta. Use Chrome ou Edge.');
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  const ok = await ensureHandlePermission(handle);
  if (!ok) throw new Error('Permissão negada para acessar a pasta.');
  await saveFolderHandle(handle);
  cachedHandle = handle;
  writeMeta({
    folderLabel: handle.name,
    lastSavedAt: null,
    lastLoadedAt: null,
    localDbActivated: false,
  });
  return handle;
}

export async function saveLocalDatabaseToFolder(options?: {
  /** @deprecated Cada gravação já gera arquivo versionado — não sobrescreve. */
  includeHistoryCopy?: boolean;
  /** Auto-save: só localStorage/memória — sem IndexedDB nem PDFs base64. */
  light?: boolean;
  /** Ignora flag de dirty (fechar aba / backup manual). */
  force?: boolean;
}): Promise<string> {
  if (!options?.force && !hasOperationalStorageDirty()) {
    return readMeta()?.lastSavedAt ?? new Date().toISOString();
  }
  const handle = await getWritableHandle();
  if (!handle) {
    throw new Error('Nenhuma pasta configurada. Use o botão Backup para escolher a pasta.');
  }
  await yieldToMain();
  const { collectSimuladorFullBackup, collectSimuladorFullBackupForFolder } = await import(
    './simuladorFullBackup'
  );
  const payload = options?.light
    ? await collectSimuladorFullBackupAsync(collectSimuladorFullBackup)
    : await collectSimuladorFullBackupForFolder();
  await yieldToMain();
  const fileName = await writeVersionedSave(handle, payload);
  const at = payload.exportedAt || new Date().toISOString();
  writeMeta({ folderLabel: handle.name, lastSavedAt: at, lastSavedFile: fileName });
  markOperationalFolderFlushed();
  return at;
}

async function collectSimuladorFullBackupAsync(
  collect: () => SimuladorFullBackupV1,
): Promise<SimuladorFullBackupV1> {
  await yieldToMain();
  return collect();
}

export async function loadLocalDatabaseFromFolder(): Promise<{
  summary: SimuladorFullBackupImportSummary;
  exportedAt: string;
} | null> {
  const handle = await getWritableHandle();
  if (!handle) return null;
  const payload = await readLatestPayload(handle);
  if (!payload) return null;
  const summary = importSimuladorFullBackupOverwrite(payload);
  writeMeta({
    folderLabel: handle.name,
    lastLoadedAt: new Date().toISOString(),
    lastSavedAt: payload.exportedAt ?? null,
  });
  signalLocalDbChanged();
  return { summary, exportedAt: payload.exportedAt };
}

/**
 * Agenda gravação na pasta selecionada.
 * Sempre sinaliza “Salvando” na UI; se a pasta estiver configurada, grava de verdade.
 */
export function scheduleLocalDatabaseSave(delayMs = 8000): void {
  setSavePhase('scheduled');
  if (!isLocalFolderDbConfigured()) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      setSavePhase('saved');
    }, Math.min(delayMs, 400));
    return;
  }
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const run = () => void flushLocalDatabaseSave({ light: true });
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 4000 });
    } else {
      run();
    }
  }, delayMs);
}

export async function flushLocalDatabaseSave(options?: { light?: boolean; force?: boolean }): Promise<void> {
  if (!isLocalFolderDbConfigured()) return;
  if (!options?.force && !hasOperationalStorageDirty()) {
    setSavePhase('saved');
    return;
  }
  if (saveInFlight) {
    pendingSave = true;
    return;
  }
  saveInFlight = true;
  setSavePhase('saving');
  try {
    await saveLocalDatabaseToFolder({ light: options?.light ?? true, force: options?.force });
    // Marca espelho ativo sem pausar cloud (Postgres/MinIO continuam).
    if (!isLocalFolderDbActivated()) {
      writeMeta({ localDbActivated: true });
    }
    setSavePhase('saved');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao gravar na pasta';
    setSavePhase('error', msg);
  } finally {
    saveInFlight = false;
    if (pendingSave) {
      pendingSave = false;
      void flushLocalDatabaseSave({ light: true, force: hasOperationalStorageDirty() });
    }
  }
}

export async function hydrateFromLocalDatabaseFolder(): Promise<boolean> {
  if (!shouldAutoLoadLocalFolder()) return false;
  try {
    const result = await loadLocalDatabaseFromFolder();
    return Boolean(result);
  } catch {
    return false;
  }
}

/** Escolhe a pasta de salvamento (espelho paralelo — Postgres/MinIO continuam ativos). */
export async function configureLocalDatabaseFolder(): Promise<{
  folderName: string;
  hasExistingFile: boolean;
}> {
  const handle = await pickLocalDatabaseFolder();
  if (!handle) throw new Error('Nenhuma pasta selecionada.');
  const existing = await readLatestPayload(handle);
  return { folderName: handle.name, hasExistingFile: Boolean(existing) };
}

/** Grava snapshot completo na pasta (cópia histórica) — backup paralelo ao Postgres/MinIO. */
export async function activateAndSaveLocalDatabase(): Promise<{
  folderName: string;
  savedAt: string;
}> {
  const handle = await getWritableHandle();
  if (!handle) {
    throw new Error('Nenhuma pasta configurada. Use Configurar para escolher a pasta.');
  }
  const savedAt = await saveLocalDatabaseToFolder({ light: false, force: true });
  writeMeta({ localDbActivated: true });
  return { folderName: handle.name, savedAt };
}

/** Carrega da pasta para o navegador (restauração manual). Cloud continua ativo. */
export async function loadAndActivateLocalDatabase(): Promise<{
  summary: SimuladorFullBackupImportSummary;
  exportedAt: string;
}> {
  const result = await loadLocalDatabaseFromFolder();
  if (!result) throw new Error('Nenhum arquivo eye-vision-dados.json na pasta.');
  writeMeta({ localDbActivated: true });
  return result;
}

export async function disconnectLocalDatabaseFolder(): Promise<void> {
  cachedHandle = null;
  await clearFolderHandle();
  localStorage.removeItem(META_KEY);
  notifyListeners();
}

/** @deprecated Use configureLocalDatabaseFolder + activateAndSaveLocalDatabase */
export async function configureAndSaveLocalDatabaseFolder(): Promise<{
  folderName: string;
  savedAt: string;
  createdNewFolder: boolean;
}> {
  const { folderName } = await configureLocalDatabaseFolder();
  const { savedAt } = await activateAndSaveLocalDatabase();
  return { folderName, savedAt, createdNewFolder: true };
}
