import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearBrowserConsoleEntries,
  getBrowserConsoleEntries,
  installBrowserConsoleBridge,
  notifyDebugAppHealthy,
  pruneResolvedDebugEntries,
  reportAppFailure,
} from '../agent/browserConsoleBridge';
import { patchDebugContext, setDebugContext } from '../agent/debugContext';

const NEW_ENTRY_GRACE_MS = 25_000;
const RESOLVE_QUIET_MS = 90_000;

describe('browserConsoleBridge persistence', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    clearBrowserConsoleEntries();
    setDebugContext({ module: 'system', moduleLabel: 'Sistema' });

    const ls = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
    };
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
  });

  afterEach(() => {
    clearBrowserConsoleEntries();
    vi.restoreAllMocks();
  });

  it('reportAppFailure grava aba e detalhes', () => {
    patchDebugContext({
      module: 'pricing',
      moduleLabel: 'Precificação',
      subTab: 'estoque',
      subTabLabel: 'Estoque',
      company: 'EMPRESA X',
    });

    reportAppFailure('Falha ao salvar', {
      source: 'test',
      cause: new Error('timeout'),
    });

    const rows = getBrowserConsoleEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0].contextLabel).toBe('Precificação · Estoque');
    expect(rows[0].company).toBe('EMPRESA X');
    expect(rows[0].details).toContain('timeout');
    expect(rows[0].stack).toBeTruthy();
  });

  it('persiste em localStorage', async () => {
    vi.useFakeTimers();
    reportAppFailure('Erro persistente', { source: 'test' });
    await vi.advanceTimersByTimeAsync(2500);

    expect(store.has('eye_vision_debug_log_v1')).toBe(true);
    const raw = JSON.parse(String(store.get('eye_vision_debug_log_v1')));
    expect(Array.isArray(raw)).toBe(true);
    expect(raw[0]?.message).toContain('Erro persistente');
    expect(raw[0]?.contextLabel).toBeTruthy();
    vi.useRealTimers();
  });

  it('ignora erro benigno de HMR do Vite (WebSocket)', () => {
    const entry = reportAppFailure('WebSocket closed without opened.', {
      source: 'promise',
      stack:
        'Error: WebSocket closed without opened.\n    at WebSocket.<anonymous> (http://localhost:3000/@vite/client:454:22)',
    });
    expect(entry).toBeNull();
    expect(getBrowserConsoleEntries()).toHaveLength(0);
  });

  it('notifyDebugAppHealthy remove erros de auth já corrigidos', () => {
    reportAppFailure('useAuth must be used within an AuthProvider', { source: 'react' });
    reportAppFailure('Falha real no módulo', { source: 'app' });

    expect(getBrowserConsoleEntries()).toHaveLength(2);

    notifyDebugAppHealthy();

    const rows = getBrowserConsoleEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toContain('Falha real');
  });

  it('pruneResolvedDebugEntries remove erro sem reincidência após quiet period', () => {
    vi.useFakeTimers();
    reportAppFailure('Erro transitório', { source: 'test' });
    expect(getBrowserConsoleEntries()).toHaveLength(1);

    vi.advanceTimersByTime(NEW_ENTRY_GRACE_MS + RESOLVE_QUIET_MS + 1000);
    const removed = pruneResolvedDebugEntries();

    expect(removed).toBe(1);
    expect(getBrowserConsoleEntries()).toHaveLength(0);
    vi.useRealTimers();
  });

  it('ignora spam de cota Firestore no console', () => {
    reportAppFailure(
      '[2026-06-09T00:29:01.910Z] @firebase/firestore: Firestore (12.14.0): FirebaseError: [code=resource-exhausted]: Quota limit exceeded',
      { source: 'console' },
    );
    expect(getBrowserConsoleEntries()).toHaveLength(0);
  });

  it('ignora WebChannel Firestore no console.error', () => {
    installBrowserConsoleBridge();
    console.error(
      '@firebase/firestore: Firestore (12.14.0): WebChannelConnection RPC Listen stream transport errored',
    );
    expect(getBrowserConsoleEntries()).toHaveLength(0);
  });
});

describe('debugContext', () => {
  it('resolve aba Contábil', async () => {
    const { resolveDebugContextFromActiveTab } = await import('../agent/debugContext');
    const manager = resolveDebugContextFromActiveTab('manager');
    expect(manager.moduleLabel).toBe('Contabil');
  });
});
