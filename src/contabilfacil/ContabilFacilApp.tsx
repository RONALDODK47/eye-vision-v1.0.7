import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { ActiveTab } from './types';
import TabLoadingFallback from './components/TabLoadingFallback';
import { TabLauncher } from './components/TabLauncher';
import { ModuleShell } from './components/ModuleShell';
import { useCompanyWorkspace } from './logic/useCompanyWorkspace';
import { usePricingCompanyWorkspace } from './logic/usePricingCompanyWorkspace';
import { invalidateManagerDataCache } from './logic/companyWorkspace';
import {
  activateAndSaveLocalDatabase,
  configureLocalDatabaseFolder,
  isLocalFolderDbConfigured,
  isLocalFolderDbSupported,
  loadAndActivateLocalDatabase,
  LOCAL_FOLDER_DB_CHANGED,
} from '../lib/localFolderDatabase';
import { registerLocalFolderDatabaseLifecycle } from './logic/localFolderAutoSave';
import {
  flushAllEyeVisionPersistence,
  registerEyeVisionAutoSaveLifecycle,
} from './logic/eyeVisionPersistenceFlush';
import { downloadSimuladorFullBackup } from '../lib/simuladorFullBackup';
import { resolveDebugContextFromActiveTab, setDebugContext } from './agent/debugContext';
import { notifyDebugModuleLoaded } from './agent/browserConsoleBridge';

const ManagerModule = lazy(() => import('./components/ManagerModule'));
const PricingModule = lazy(() => import('./components/PricingModule'));
const GestaoContabilModule = lazy(() => import('../gestaoContabil/GestaoContabilModule'));
const AdminModule = lazy(() => import('./components/AdminModule'));
const DebugModule = lazy(() => import('./components/DebugModule'));
const EyeVisionAdminLoginGate = lazy(() => import('./components/EyeVisionAdminLoginGate'));

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
  useEffect(() => registerLocalFolderDatabaseLifecycle(), []);

  useEffect(() => {
    const onFolderDbChanged = () => {
      invalidateManagerDataCache();
      bumpStorage();
    };
    const onCloudHydrated = () => {
      invalidateManagerDataCache();
      bumpStorage();
    };
    window.addEventListener(LOCAL_FOLDER_DB_CHANGED, onFolderDbChanged);
    window.addEventListener('contabilfacil:data-hydrated', onCloudHydrated);
    return () => {
      window.removeEventListener(LOCAL_FOLDER_DB_CHANGED, onFolderDbChanged);
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

  const handleConfigureFolder = useCallback(async () => {
    if (!isLocalFolderDbSupported()) {
      alert('Use Chrome ou Edge para escolher a pasta onde os dados serão salvos.');
      return;
    }
    try {
      const result = await configureLocalDatabaseFolder();
      if (result.hasExistingFile) {
        const loadNow = confirm(
          `A pasta "${result.folderName}" já contém eye-vision-dados.json.\n\n` +
            'OK = restaurar dados da pasta no navegador agora\n' +
            'Cancelar = manter os dados atuais (clique Salvar para espelhar na pasta)',
        );
        if (loadNow) {
          await loadAndActivateLocalDatabase();
          invalidateManagerDataCache();
          bumpStorage();
          alert(
            `Dados restaurados da pasta "${result.folderName}".\n\n` +
              'Postgres e MinIO continuam ativos — a pasta é só backup de proteção.',
          );
          return;
        }
      }
      bumpStorage();
      alert(
        `Pasta configurada: ${result.folderName}\n\n` +
          'Esta pasta é um espelho de proteção (além do Postgres/MinIO).\n' +
          'Clique em Salvar para gravar um snapshot completo agora.',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao configurar pasta.';
      if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('abort')) alert(msg);
    }
  }, [bumpStorage]);

  const handleSaveToFolder = useCallback(async () => {
    if (!isLocalFolderDbSupported()) {
      downloadSimuladorFullBackup();
      alert(
        'Seu navegador não permite salvar em pasta.\n' +
          'O arquivo JSON foi baixado — guarde-o manualmente.',
      );
      return;
    }
    if (!isLocalFolderDbConfigured()) {
      alert('Configure a pasta de salvamento primeiro (botão Configurar).');
      return;
    }
    try {
      const result = await activateAndSaveLocalDatabase();
      invalidateManagerDataCache();
      bumpStorage();
      alert(
        `Backup salvo na pasta.\n\n` +
          `Pasta: ${result.folderName}\n` +
          `Arquivo: eye-vision-dados.json (+ cópia com data/hora)\n` +
          `Horário: ${new Date(result.savedAt).toLocaleString('pt-BR')}\n\n` +
          'A partir de agora:\n' +
          '• Alterações também espelham automaticamente nesta pasta\n' +
          '• Postgres e MinIO continuam como armazenamento principal\n' +
          '• A pasta serve como proteção extra dos dados',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar na pasta.';
      if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('abort')) alert(msg);
    }
  }, [bumpStorage]);

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
        return <ManagerModule {...commonProps} />;
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
            <TabLauncher
              onOpenModule={openModule}
              onConfigureFolder={handleConfigureFolder}
              onSaveToFolder={handleSaveToFolder}
            />
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
