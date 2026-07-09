import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushAllEyeVisionPersistence,
  registerEyeVisionAutoSaveLifecycle,
} from '../logic/eyeVisionPersistenceFlush';
import { companyStorageSlug } from '../logic/companyWorkspace';

describe('eyeVisionPersistenceFlush', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
        key: (i: number) => [...store.keys()][i] ?? null,
        get length() {
          return store.size;
        },
        clear: () => store.clear(),
      },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('flushAllEyeVisionPersistence grava writes pendentes do gerencial', async () => {
    const slug = companyStorageSlug('EMPRESA X');
    const key = `contabilfacil_${slug}_plano`;
    const { writeManagerData } = await import('../logic/companyWorkspace');
    writeManagerData('EMPRESA X', 'plano', [{ id: 'p1' }]);
    expect(store.get(key)).toBeUndefined();
    await flushAllEyeVisionPersistence();
    expect(store.get(key)).toContain('p1');
  });

  it('registerEyeVisionAutoSaveLifecycle registra listeners e limpa no teardown', () => {
    const listeners = new Map<string, Set<EventListener>>();
    const win = {
      addEventListener: (type: string, fn: EventListener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: EventListener) => {
        listeners.get(type)?.delete(fn);
      },
      setInterval: globalThis.setInterval.bind(globalThis),
      clearInterval: globalThis.clearInterval.bind(globalThis),
    };
    Object.defineProperty(globalThis, 'window', { value: win, configurable: true });
    Object.defineProperty(globalThis, 'document', {
      value: {
        visibilityState: 'visible',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });

    const cleanup = registerEyeVisionAutoSaveLifecycle();
    expect(listeners.get('beforeunload')?.size).toBe(1);
    expect(listeners.get('pagehide')?.size).toBe(1);
    cleanup();
    expect(listeners.get('beforeunload')?.size).toBe(0);
    expect(listeners.get('pagehide')?.size).toBe(0);
  });
});
