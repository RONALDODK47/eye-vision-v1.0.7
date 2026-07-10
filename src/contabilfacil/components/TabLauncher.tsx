import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, LogOut, Save, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ActiveTab } from '../types';
import {
  getLocalFolderDbMeta,
  isLocalFolderDbActivated,
  isLocalFolderDbConfigured,
  isLocalFolderDbSupported,
  subscribeLocalFolderDb,
} from '../../lib/localFolderDatabase';
import {
  TAB_LAUNCHER_CATALOG,
  type TabLauncherEntry,
} from '../tabLauncher/tabLauncherCatalog';
import {
  getBrowserConsoleIssueCount,
  subscribeBrowserConsole,
} from '../agent/browserConsoleBridge';
// @ts-expect-error módulo JSX da gestão contábil
import { useAuth } from '../../gestaoContabil/gestaoAuth';
import { useEyeVisionModuleAccess } from '../logic/useEyeVisionModuleAccess';
import { canAccessEyeVisionModule } from '../logic/eyeVisionAdmin';

export interface TabLauncherProps {
  onOpenModule: (tab: ActiveTab) => void;
  onConfigureFolder: () => void;
  onSaveToFolder: () => void;
}

function ModuleCard({
  entry,
  debugIssues,
  onOpen,
}: {
  entry: TabLauncherEntry;
  debugIssues: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'text-left border border-brand-border p-5 transition-all',
        'hover:bg-brand-sidebar/30 hover:shadow-[4px_4px_0_0_#141414] active:translate-x-0.5 active:translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-border',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            'w-12 h-12 border-2 border-brand-border flex items-center justify-center text-lg font-black shrink-0',
            entry.primary ? 'bg-brand-border text-brand-bg' : 'bg-brand-bg',
          )}
        >
          {entry.symbol}
        </div>
        {entry.id === 'debug' && debugIssues > 0 ? (
          <span className="min-w-[22px] h-[22px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center">
            {debugIssues > 99 ? '99+' : debugIssues}
          </span>
        ) : null}
      </div>
      <h2 className="mt-4 text-sm font-black uppercase tracking-tight">{entry.name}</h2>
      <p className="mt-1 text-[10px] font-mono opacity-55 leading-relaxed">{entry.description}</p>
      <p className="mt-3 text-[9px] font-mono uppercase opacity-40">{entry.folder}</p>
    </button>
  );
}

export function TabLauncher({
  onOpenModule,
  onConfigureFolder,
  onSaveToFolder,
}: TabLauncherProps) {
  const [debugIssueCount, setDebugIssueCount] = useState(0);
  const [folderMeta, setFolderMeta] = useState(getLocalFolderDbMeta);
  const { user, logout } = useAuth();
  const { isAdminEmail, moduleAccess } = useEyeVisionModuleAccess();

  useEffect(() => {
    return subscribeLocalFolderDb(() => setFolderMeta(getLocalFolderDbMeta()));
  }, []);

  const folderConfigured = isLocalFolderDbConfigured();
  const folderActive = isLocalFolderDbActivated();
  const folderSupported = isLocalFolderDbSupported();

  useEffect(() => {
    let throttle: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (throttle) return;
      throttle = setTimeout(() => {
        throttle = null;
        setDebugIssueCount(getBrowserConsoleIssueCount());
      }, 2000);
    };
    setDebugIssueCount(getBrowserConsoleIssueCount());
    return subscribeBrowserConsole(bump);
  }, []);

  const visibleEntries = useMemo(() => {
    return TAB_LAUNCHER_CATALOG.filter((entry) => {
      if (entry.id === 'admin') return true;
      return canAccessEyeVisionModule(moduleAccess, entry.id, isAdminEmail);
    });
  }, [isAdminEmail, moduleAccess]);

  const primary = visibleEntries.filter((e) => e.primary);
  const secondary = visibleEntries.filter((e) => !e.primary);

  return (
    <div className="h-screen bg-brand-bg text-brand-text font-sans flex flex-col overflow-hidden">
      <header className="h-14 border-b border-brand-border px-6 flex items-center justify-between shrink-0">
        <div className="font-black text-xl tracking-tighter">EYE VISION</div>
        <div className="flex items-center gap-2">
          {folderConfigured ? (
            <span
              className="hidden sm:inline text-[9px] font-mono uppercase opacity-50 max-w-[200px] truncate"
              title={`Pasta: ${folderMeta?.folderLabel ?? ''}`}
            >
              <FolderOpen size={12} className="inline mr-1 -mt-px" />
              {folderMeta?.folderLabel}
              {folderActive ? ' · espelho' : ' · pendente'}
            </span>
          ) : null}
          {folderSupported ? (
            <>
              <button
                type="button"
                onClick={() => void onConfigureFolder()}
                className="technical-button flex items-center gap-2 text-[10px]"
                title="Escolher pasta de proteção (espelho paralelo ao Postgres/MinIO)"
              >
                <Settings size={14} />
                Configurar
              </button>
              <button
                type="button"
                onClick={() => void onSaveToFolder()}
                disabled={!folderConfigured}
                className="technical-button flex items-center gap-2 text-[10px] disabled:opacity-40 disabled:cursor-not-allowed"
                title={
                  folderConfigured
                    ? 'Salvar snapshot completo na pasta (backup de proteção)'
                    : 'Configure a pasta primeiro'
                }
              >
                <Save size={14} />
                Salvar
              </button>
            </>
          ) : null}
          {user ? (
            <button
              type="button"
              onClick={() => void logout()}
              className="technical-button flex items-center gap-2 text-[10px]"
              title={user.email ?? 'Terminar sessão'}
            >
              <LogOut size={14} />
              Sair
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="max-w-5xl mx-auto space-y-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Selecione o módulo</p>
            <h1 className="text-2xl font-black uppercase tracking-tighter mt-1">Escolha o software</h1>
            <p className="text-[11px] font-mono opacity-60 mt-2 max-w-xl">
              Cada aba roda sozinha — só o módulo escolhido carrega na memória. Use a seta para voltar aqui.
              {folderActive ? (
                <>
                  {' '}
                  Espelho ativo em <strong className="opacity-80">{folderMeta?.folderLabel}</strong> — alterações
                  também gravam em <code className="text-[10px]">eye-vision-dados.json</code> (proteção extra).
                  Postgres e MinIO continuam como armazenamento principal.
                </>
              ) : folderConfigured ? (
                <>
                  {' '}
                  Pasta <strong className="opacity-80">{folderMeta?.folderLabel}</strong> configurada — clique{' '}
                  <strong className="opacity-80">Salvar</strong> para criar o backup de proteção nesta pasta.
                  Postgres/MinIO continuam ativos.
                </>
              ) : folderSupported ? (
                <>
                  {' '}
                  Use <strong className="opacity-80">Configurar</strong> + <strong className="opacity-80">Salvar</strong>{' '}
                  para espelhar tudo nesta pasta como proteção (além do Postgres/MinIO).
                </>
              ) : null}
            </p>
          </div>

          {primary.length > 0 ? (
            <section>
              <h3 className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-4">Contábil</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
                {primary.map((entry) => (
                  <ModuleCard
                    key={entry.id}
                    entry={entry}
                    debugIssues={0}
                    onOpen={() => onOpenModule(entry.id)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {secondary.length > 0 ? (
            <section>
              <h3 className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-4">Sistema</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                {secondary.map((entry) => (
                  <ModuleCard
                    key={entry.id}
                    entry={entry}
                    debugIssues={debugIssueCount}
                    onOpen={() => onOpenModule(entry.id)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
