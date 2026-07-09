import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { launcherEntry } from '../tabLauncher/tabLauncherCatalog';
import type { ActiveTab } from '../types';
import ApiStatusBar from './ApiStatusBar';
import PersistenceStatusBar from './PersistenceStatusBar';

export interface ModuleShellProps {
  activeTab: ActiveTab;
  onBack: () => void;
  children: ReactNode;
}

export function ModuleShell({ activeTab, onBack, children }: ModuleShellProps) {
  const meta = launcherEntry(activeTab);

  return (
    <div className="h-screen bg-brand-bg text-brand-text font-sans flex flex-col overflow-hidden">
      <header className="h-14 border-b border-brand-border px-4 md:px-6 flex items-center justify-between shrink-0 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-2 border border-brand-border hover:bg-brand-sidebar transition-colors shrink-0"
            aria-label="Voltar à seleção de módulos"
          >
            <ArrowLeft size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Módulos</span>
          </button>
          <div className="h-8 w-px bg-brand-border opacity-30 shrink-0" />
          <div className="min-w-0 flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-mono uppercase opacity-40 truncate">{meta?.folder ?? 'modules'}</p>
              <p className="text-sm font-black uppercase tracking-tight truncate">{meta?.name ?? activeTab}</p>
            </div>
            {activeTab !== 'admin' && activeTab !== 'gestao' ? <PersistenceStatusBar /> : null}
          </div>
        </div>

        {activeTab !== 'admin' && activeTab !== 'gestao' ? (
          <div className="flex items-center gap-3 shrink-0 min-w-0">
            <ApiStatusBar activeTab={activeTab} />
          </div>
        ) : null}
      </header>

      <main
        className={
          activeTab === 'gestao'
            ? 'flex-1 min-h-0 overflow-hidden bg-white'
            : 'flex-1 overflow-y-auto bg-white/60 p-4 md:p-6'
        }
      >
        {children}
      </main>

      <footer className="h-7 border-t border-brand-border bg-brand-sidebar flex items-center justify-between px-6 text-[9px] font-mono opacity-60 shrink-0">
        <span className="uppercase truncate">{meta?.folder}</span>
        <span className="font-bold">v2.5 · módulo isolado</span>
      </footer>
    </div>
  );
}
