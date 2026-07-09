import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createCompanyRecord,
  migrateLegacyManagerData,
  migrateOrphanAplicacoes,
  migrateOrphanParcelamentos,
  renameCompanyInStorage,
  deleteManagerCompanyInStorage,
  normalizeCompanyName,
  resolveSelectedCompany,
  saveCompaniesRegistry,
  saveSelectedCompanyName,
  syncCompanyRegistry,
  type CompanyRecord,
} from './companyWorkspace';

export function useCompanyWorkspace() {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [selectedCompany, setSelectedCompanyState] = useState('');
  const [workspaceVersion, setWorkspaceVersion] = useState(0);

  const refreshCompanies = useCallback(() => {
    let synced = syncCompanyRegistry();
    if (synced.length === 0) {
      synced = [createCompanyRecord('TECHNOVA INDÚSTRIA LTDA')];
      saveCompaniesRegistry(synced);
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
    refreshCompanies();
    const onHydrated = () => refreshCompanies();
    window.addEventListener('contabilfacil:data-hydrated', onHydrated);
    return () => window.removeEventListener('contabilfacil:data-hydrated', onHydrated);
  }, [refreshCompanies]);

  const setSelectedCompany = useCallback(
    (name: string) => {
      const normalized = normalizeCompanyName(name);
      saveSelectedCompanyName(normalized);
      setSelectedCompanyState(normalized);
      setWorkspaceVersion((v) => v + 1);
    },
    [],
  );

  const createCompany = useCallback(
    (name: string) => {
      const normalized = normalizeCompanyName(name);
      if (!normalized || normalized === 'SEM EMPRESA') return null;

      const nextRecord = createCompanyRecord(normalized);
      setCompanies((prev) => {
        if (prev.some((c) => c.name === normalized)) return prev;
        const next = [...prev, nextRecord].sort((a, b) =>
          a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
        );
        saveCompaniesRegistry(next);
        return next;
      });
      setSelectedCompany(normalized);
      return normalized;
    },
    [setSelectedCompany],
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
