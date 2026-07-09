import { format } from 'date-fns';
import {
  collectSimuladorFullBackupForFolder,
  importSimuladorFullBackupOverwrite,
  type SimuladorFullBackupImportSummary,
  type SimuladorFullBackupV1,
} from './simuladorFullBackup';
import {
  clearFolderHandle,
  loadFolderHandle,
  saveFolderHandle,
} from './localFolderDbHandleStore';

export const LOCAL_DB_MAIN_FILE = 'eye-vision-dados.json';
export const LOCAL_FOLDER_DB_CHANGED = 'eye-vision-local-db-changed';
const META_KEY = 'eye_vision_local_folder_db_v1';

export type LocalFolderDbMeta = {
  folderLabel: string;
  lastSavedAt: string | null;
  lastLoadedAt: string | null;
  /** Ativo após o primeiro Salvar — habilita auto-import e pausa Firebase */
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

/** Pasta configurada e primeiro salvamento concluído — fonte primária local. */
export function isLocalFolderDbActivated(): boolean {
  const meta = readMeta();
  return Boolean(meta?.localDbActivated && meta.folderLabel);
}

export function shouldAutoLoadLocalFolder(): boolean {
  return isLocalFolderDbActivated();
}

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

async function readMainFile(handle: FileSystemDirectoryHandle): Promise<SimuladorFullBackupV1 | null> {
  try {
    const fileHandle = await handle.getFileHandle(LOCAL_DB_MAIN_FILE);
    const file = await fileHandle.getFile();
    const text = await file.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as SimuladorFullBackupV1;
  } catch {
    return null;
  }
}

async function writeMainFile(
  handle: FileSystemDirectoryHandle,
  payload: SimuladorFullBackupV1,
): Promise<void> {
  const fileHandle = await handle.getFileHandle(LOCAL_DB_MAIN_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(payload, null, 2));
  await writable.close();
}

async function writeHistoryCopy(handle: FileSystemDirectoryHandle, payload: SimuladorFullBackupV1): Promise<void> {
  const stamp = format(new Date(), 'yyyy-MM-dd_HHmmss');
  const name = `eye-vision-dados_${stamp}.json`;
  const fileHandle = await handle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(payload, null, 2));
  await writable.close();
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
  includeHistoryCopy?: boolean;
}): Promise<string> {
  const handle = await getWritableHandle();
  if (!handle) {
    throw new Error('Nenhuma pasta configurada. Use o botão Backup para escolher a pasta.');
  }
  // Inclui textos completos da Inteligência IA (não só preview do localStorage)
  const payload = await collectSimuladorFullBackupForFolder();
  await writeMainFile(handle, payload);
  if (options?.includeHistoryCopy) {
    await writeHistoryCopy(handle, payload);
  }
  const at = new Date().toISOString();
  writeMeta({ folderLabel: handle.name, lastSavedAt: at });
  return at;
}

export async function loadLocalDatabaseFromFolder(): Promise<{
  summary: SimuladorFullBackupImportSummary;
  exportedAt: string;
} | null> {
  const handle = await getWritableHandle();
  if (!handle) return null;
  const payload = await readMainFile(handle);
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
export function scheduleLocalDatabaseSave(delayMs = 800): void {
  setSavePhase('scheduled');
  if (!isLocalFolderDbConfigured()) {
    // Dados já foram para o localStorage — feedback visual mesmo sem pasta.
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
    void flushLocalDatabaseSave();
  }, delayMs);
}

export async function flushLocalDatabaseSave(): Promise<void> {
  if (!isLocalFolderDbConfigured()) return;
  if (saveInFlight) {
    pendingSave = true;
    return;
  }
  saveInFlight = true;
  setSavePhase('saving');
  try {
    await saveLocalDatabaseToFolder();
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
      void flushLocalDatabaseSave();
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

/** Escolhe a pasta de salvamento sem mover dados (Firebase continua ativo). */
export async function configureLocalDatabaseFolder(): Promise<{
  folderName: string;
  hasExistingFile: boolean;
}> {
  const handle = await pickLocalDatabaseFolder();
  if (!handle) throw new Error('Nenhuma pasta selecionada.');
  const existing = await readMainFile(handle);
  return { folderName: handle.name, hasExistingFile: Boolean(existing) };
}

/** Grava dados atuais na pasta e ativa banco local (pausa Firebase). */
export async function activateAndSaveLocalDatabase(): Promise<{
  folderName: string;
  savedAt: string;
}> {
  const handle = await getWritableHandle();
  if (!handle) {
    throw new Error('Nenhuma pasta configurada. Use Configurar para escolher a pasta.');
  }
  const savedAt = await saveLocalDatabaseToFolder({ includeHistoryCopy: true });
  writeMeta({ localDbActivated: true });
  return { folderName: handle.name, savedAt };
}

/** Carrega da pasta e ativa banco local (para pasta que já tinha backup). */
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
