import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isOperationalStorageKey,
  isBrowserAllowedStorageKey,
  purgeOperationalLocalStorage,
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
} from './safeLocalStorage';

describe('safeLocalStorage — sem dados operacionais no navegador', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
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
    vi.stubEnv('VITE_STORAGE_BACKEND', 'postgres');
  });

  afterEach(() => {
    store.clear();
    vi.unstubAllEnvs();
  });

  it('classifica chaves operacionais vs auth', () => {
    expect(isOperationalStorageKey('contabilfacil_EMPRESA_plano')).toBe(true);
    expect(isOperationalStorageKey('simulador_contracts')).toBe(true);
    expect(isOperationalStorageKey('gc_cloud_workspace_office_TOK')).toBe(true);
    expect(isBrowserAllowedStorageKey('gc_company_access_token')).toBe(true);
    expect(isOperationalStorageKey('gc_company_access_token')).toBe(false);
    expect(isOperationalStorageKey('eye_vision_local_folder_db_v1')).toBe(false);
  });

  it('grava operacional só em memória, não no localStorage', () => {
    safeLocalStorageSetItem('contabilfacil_TEST_plano', JSON.stringify([{ id: 1 }]));
    expect(safeLocalStorageGetItem('contabilfacil_TEST_plano')).toContain('id');
    expect(localStorage.getItem('contabilfacil_TEST_plano')).toBeNull();
  });

  it('permite auth leve no navegador', () => {
    safeLocalStorageSetItem('gc_company_access_token', 'CL-ABC');
    expect(localStorage.getItem('gc_company_access_token')).toBe('CL-ABC');
  });

  it('purge remove operacionais do navegador', () => {
    store.set('contabilfacil_X_extrato', '[]');
    store.set('gc_company_access_token', 'keep');
    const n = purgeOperationalLocalStorage();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(localStorage.getItem('contabilfacil_X_extrato')).toBeNull();
    expect(localStorage.getItem('gc_company_access_token')).toBe('keep');
  });
});
