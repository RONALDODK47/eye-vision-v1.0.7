import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../gestaoContabil/dbClientPostgres', () => ({
  isPostgresStorageClientEnabled: () => false,
}));

import {
  COMPANIES_REGISTRY_KEY,
  mergeCompaniesRegistryLists,
  saveCompaniesRegistry,
  type CompanyRecord,
} from '../logic/companyWorkspace';

describe('companyWorkspace registry guard', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
    });
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-test' });
  });

  const seven: CompanyRecord[] = [
    { id: '1', name: 'COMERCIAL FERNANDES', createdAt: '2026-01-01' },
    { id: '2', name: 'ORGANO', createdAt: '2026-01-01' },
    { id: '3', name: 'POLO SUL CLIMATIZAÇÃO', createdAt: '2026-01-01' },
    { id: '4', name: 'PROMETAL ESTRUTURAS', createdAt: '2026-01-01' },
    { id: '5', name: 'SINDICATO', createdAt: '2026-01-01' },
    { id: '6', name: 'TOP SERVICOS', createdAt: '2026-01-01' },
    { id: '7', name: 'XXX', createdAt: '2026-01-01' },
  ];

  it('saveCompaniesRegistry não reduz 7 empresas para 1', () => {
    store.set(COMPANIES_REGISTRY_KEY, JSON.stringify(seven));
    saveCompaniesRegistry([{ id: 't', name: 'TECHNOVA INDÚSTRIA LTDA', createdAt: '2026-01-01' }]);
    const saved = JSON.parse(store.get(COMPANIES_REGISTRY_KEY) || '[]') as CompanyRecord[];
    expect(saved.length).toBe(7);
  });

  it('saveCompaniesRegistry com replace remove empresa excluída', () => {
    store.set(COMPANIES_REGISTRY_KEY, JSON.stringify(seven));
    saveCompaniesRegistry(seven.filter((c) => c.name !== 'XXX'), { replace: true });
    const saved = JSON.parse(store.get(COMPANIES_REGISTRY_KEY) || '[]') as CompanyRecord[];
    expect(saved.length).toBe(6);
    expect(saved.some((c) => c.name === 'XXX')).toBe(false);
  });

  it('mergeCompaniesRegistryLists une listas sem duplicar', () => {
    const merged = mergeCompaniesRegistryLists(seven, [{ id: '8', name: 'NOVA EMPRESA', createdAt: '2026-01-01' }]);
    expect(merged.length).toBe(8);
  });
});
