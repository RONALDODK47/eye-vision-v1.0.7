import { Suspense, useCallback, useEffect, useState } from 'react';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { AnimatePresence, motion } from 'motion/react';
import type { ActiveTab } from './types';
import TabLoadingFallback from './components/TabLoadingFallback';
import { TabLauncher } from './components/TabLauncher';
import { ModuleShell } from './components/ModuleShell';
import { useCompanyWorkspace } from './logic/useCompanyWorkspace';
import { usePricingCompanyWorkspace } from './logic/usePricingCompanyWorkspace';
import { invalidateManagerDataCache } from './logic/companyWorkspace';
import { registerOperationalStorageLifecycle } from './logic/localFolderAutoSave';
import {
  flushAllEyeVisionPersistence,
  registerEyeVisionAutoSaveLifecycle,
} from './logic/eyeVisionPersistenceFlush';
import { resolveDebugContextFromActiveTab, setDebugContext } from './agent/debugContext';
import { notifyDebugModuleLoaded } from './agent/browserConsoleBridge';

const ManagerModule = lazyWithRetry(() => import('./components/ManagerModule'));
const PricingModule = lazyWithRetry(() => import('./components/PricingModule'));
const GestaoContabilModule = lazyWithRetry(() => import('../gestaoContabil/GestaoContabilModule'));
const AdminModule = lazyWithRetry(() => import('./components/AdminModule'));
const DebugModule = lazyWithRetry(() => import('./components/DebugModule'));
const EyeVisionAdminLoginGate = lazyWithRetry(() => import('./components/EyeVisionAdminLoginGate'));

type AppView = 'launcher' | 'module';

export default function ContabilFacilApp() {
  const [view, setView] = useState<AppView>('launcher');
  const [activeTab, setActiveTab] = useState<ActiveTab | null>(null);
  const [storageVersion, setStorageVersion] = useState(0);
  const [adminLoginPending, setAdminLoginPending] = useState(false);

  const {
    selectedCompany,
    setSelectedCompany,
    createCompany,
    renameCompany,
    deleteCompany,
    companyOptions,
    refreshCompanies,
    workspaceVersion,
  } = useCompanyWorkspace();

  const {
    selectedCompany: pricingSelectedCompany,
    setSelectedCompany: setPricingSelectedCompany,
    createCompany: createPricingCompany,
    renameCompany: renamePricingCompany,
    deleteCompany: deletePricingCompany,
    companyOptions: pricingCompanyOptions,
    refreshCompanies: refreshPricingCompanies,
    workspaceVersion: pricingWorkspaceVersion,
  } = usePricingCompanyWorkspace();

  const openModule = useCallback((tab: ActiveTab) => {
    if (tab === 'admin') {
      setAdminLoginPending(true);
      return;
    }
    setActiveTab(tab);
    setView('module');
  }, []);

  const handleAdminLoginSuccess = useCallback(() => {
    setAdminLoginPending(false);
    setActiveTab('admin');
    setView('module');
  }, []);

  const handleAdminLoginCancel = useCallback(() => {
    setAdminLoginPending(false);
  }, []);

  const backToLauncher = useCallback(() => {
    void flushAllEyeVisionPersistence();
    setView('launcher');
    setActiveTab(null);
  }, []);

  const dataVersion = storageVersion + workspaceVersion;
  const pricingDataVersion = storageVersion + pricingWorkspaceVersion;

  const bumpStorage = useCallback(() => {
    setStorageVersion((v) => v + 1);
    refreshCompanies();
    refreshPricingCompanies();
  }, [refreshCompanies, refreshPricingCompanies]);

  useEffect(() => registerEyeVisionAutoSaveLifecycle(), []);
  useEffect(() => registerOperationalStorageLifecycle(), []);

  useEffect(() => {
    const onCloudHydrated = () => {
      invalidateManagerDataCache();
      bumpStorage();
    };
    window.addEventListener('contabilfacil:data-hydrated', onCloudHydrated);
    return () => {
      window.removeEventListener('contabilfacil:data-hydrated', onCloudHydrated);
    };
  }, [bumpStorage]);

  useEffect(() => {
    if (view !== 'module' || !activeTab) return;
    const t = window.setTimeout(() => notifyDebugModuleLoaded(), 800);
    return () => clearTimeout(t);
  }, [view, activeTab]);

  useEffect(() => {
    if (view === 'launcher') {
      setDebugContext({
        module: 'launcher',
        moduleLabel: 'Seletor de módulos',
      });
      return;
    }
    if (activeTab) {
      setDebugContext(resolveDebugContextFromActiveTab(activeTab));
    }
  }, [view, activeTab]);

  const renderModule = (tab: ActiveTab) => {
    const companyProps = {
      selectedCompany,
      companyOptions,
      onCompanyChange: setSelectedCompany,
      onCreateCompany: createCompany,
      onRenameCompany: renameCompany,
      onDeleteCompany: deleteCompany,
    };
    const commonProps = { ...companyProps, storageVersion: dataVersion };

    switch (tab) {
      case 'manager':
        return <ManagerModule key={selectedCompany || '__sem_empresa__'} {...commonProps} />;
      case 'pricing':
        return (
          <PricingModule
            selectedCompany={pricingSelectedCompany}
            companyOptions={pricingCompanyOptions}
            onCompanyChange={setPricingSelectedCompany}
            onCreateCompany={createPricingCompany}
            onRenameCompany={renamePricingCompany}
            onDeleteCompany={deletePricingCompany}
            storageVersion={pricingDataVersion}
          />
        );
      case 'gestao':
        return <GestaoContabilModule />;
      case 'admin':
        return <AdminModule />;
      case 'debug':
        return <DebugModule />;
      default:
        return null;
    }
  };

  return (
    <>
      <AnimatePresence mode="wait">
        {view === 'launcher' ? (
          <motion.div
            key="launcher"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="h-screen"
          >
            <TabLauncher onOpenModule={openModule} />
          </motion.div>
        ) : activeTab ? (
          <motion.div
            key={`module-${activeTab}`}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.14 }}
            className="h-screen"
          >
            <ModuleShell activeTab={activeTab} onBack={backToLauncher}>
              <Suspense fallback={<TabLoadingFallback />}>{renderModule(activeTab)}</Suspense>
            </ModuleShell>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {adminLoginPending ? (
        <Suspense fallback={<TabLoadingFallback />}>
          <EyeVisionAdminLoginGate
            onSuccess={handleAdminLoginSuccess}
            onCancel={handleAdminLoginCancel}
          />
        </Suspense>
      ) : null}
    </>
  );
}
