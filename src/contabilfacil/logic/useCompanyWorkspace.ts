import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createCompanyRecord,
  flushManagerDataWrites,
  invalidateManagerDataCache,
  migrateLegacyManagerData,
  migrateOrphanAplicacoes,
  migrateOrphanParcelamentos,
  renameCompanyInStorage,
  deleteManagerCompanyInStorage,
  clearCompanyDeletion,
  normalizeCompanyName,
  repairCompanyWorkspaceState,
  resolveSelectedCompany,
  saveCompaniesRegistry,
  saveSelectedCompanyName,
  syncCompanyRegistry,
  canonicalCompanyStorageSlug,
  isSameCompanyScope,
  loadSelectedCompanyName,
  type CompanyRecord,
} from './companyWorkspace';

export function useCompanyWorkspace() {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [selectedCompany, setSelectedCompanyState] = useState('');
  const [workspaceVersion, setWorkspaceVersion] = useState(0);

  const refreshCompanies = useCallback(() => {
    const synced = syncCompanyRegistry();
    if (synced.length === 0) {
      setCompanies([]);
      setSelectedCompanyState('');
      setWorkspaceVersion((v) => v + 1);
      return '';
    }
    const selected = resolveSelectedCompany(synced);
    migrateLegacyManagerData(selected);
    migrateOrphanParcelamentos(selected);
    migrateOrphanAplicacoes(selected);
    saveSelectedCompanyName(selected);
    setCompanies(synced);
    setSelectedCompanyState(selected);
    setWorkspaceVersion((v) => v + 1);
    return selected;
  }, []);

  useEffect(() => {
    repairCompanyWorkspaceState();
    refreshCompanies();
    const onHydrated = () => {
      repairCompanyWorkspaceState();
      refreshCompanies();
    };
    window.addEventListener('contabilfacil:data-hydrated', onHydrated);
    return () => window.removeEventListener('contabilfacil:data-hydrated', onHydrated);
  }, [refreshCompanies]);

  const setSelectedCompany = useCallback(
    (name: string) => {
      const normalized = normalizeCompanyName(name);
      const previous = loadSelectedCompanyName();
      saveSelectedCompanyName(normalized);
      flushManagerDataWrites();
      if (previous) invalidateManagerDataCache(previous);
      if (normalized && !isSameCompanyScope(previous, normalized)) {
        invalidateManagerDataCache(normalized);
      }
      setSelectedCompanyState(normalized);
      setWorkspaceVersion((v) => v + 1);
    },
    [],
  );

  const createCompany = useCallback(
    (name: string) => {
      const normalized = normalizeCompanyName(name);
      if (!normalized || normalized === 'SEM EMPRESA') return null;

      const slug = canonicalCompanyStorageSlug(normalized);
      const existingBySlug = companies.find(
        (c) => canonicalCompanyStorageSlug(c.name) === slug,
      );
      if (existingBySlug) {
        clearCompanyDeletion(existingBySlug.name);
        setSelectedCompany(existingBySlug.name);
        return existingBySlug.name;
      }

      const nextRecord = createCompanyRecord(normalized);
      setCompanies((prev) => {
        if (prev.some((c) => c.name === normalized)) return prev;
        const next = [...prev, nextRecord].sort((a, b) =>
          a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
        );
        saveCompaniesRegistry(next);
        return next;
      });
      clearCompanyDeletion(normalized);
      setSelectedCompany(normalized);
      return normalized;
    },
    [companies, setSelectedCompany],
  );

  const renameCompany = useCallback(
    (currentName: string, nextName: string) => {
      const normalized = normalizeCompanyName(nextName);
      if (!normalized || normalized === 'SEM EMPRESA') return false;
      if (normalizeCompanyName(currentName) === normalized) return true;

      const ok = renameCompanyInStorage(currentName, normalized);
      if (!ok) return false;

      refreshCompanies();
      setSelectedCompany(normalized);
      return true;
    },
    [refreshCompanies, setSelectedCompany],
  );

  const deleteCompany = useCallback(
    (name: string) => {
      const ok = deleteManagerCompanyInStorage(name);
      if (!ok) return false;
      refreshCompanies();
      return true;
    },
    [refreshCompanies],
  );

  const companyOptions = useMemo(
    () => companies.map((c) => c.name).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })),
    [companies],
  );

  return {
    companies,
    companyOptions,
    selectedCompany,
    setSelectedCompany,
    createCompany,
    renameCompany,
    deleteCompany,
    refreshCompanies,
    workspaceVersion,
  };
}
