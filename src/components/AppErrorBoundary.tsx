import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { reportBrowserConsoleError } from '../contabilfacil/agent/browserConsoleBridge';
import { isChunkLoadError } from '../lib/chunkLoadRecovery';

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void {
    reportBrowserConsoleError('react', error, errorInfo.componentStack ?? '');
    console.error('Erro não tratado na árvore React:', error, errorInfo);
    if (isChunkLoadError(error)) {
      window.setTimeout(() => window.location.reload(), 120);
    }
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-brand-bg text-brand-text flex flex-col items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-lg technical-panel shadow-[3px_3px_0_0_#141414] border-red-800/80 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-brand-border bg-brand-sidebar/60">
              <div className="w-9 h-9 border border-red-800/60 bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-800" aria-hidden />
              </div>
              <div className="min-w-0 text-left">
                <p className="text-[9px] font-black uppercase tracking-widest text-red-800">
                  Erro de renderização
                </p>
                <p className="text-[10px] font-bold uppercase opacity-50 tracking-widest">
                  ContabilFacil
                </p>
              </div>
            </div>

            <div className="px-5 py-6 space-y-4 text-left">
              <h1 className="text-xl font-black tracking-tighter uppercase italic leading-tight">
                Algo inesperado aconteceu na interface.
              </h1>
              <p className="text-[11px] font-mono leading-relaxed opacity-70">
                Tente recarregar a página. Se o erro persistir, revise os últimos dados informados e
                tente novamente.
              </p>
              <div className="pt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="technical-button-primary inline-flex items-center gap-2"
                >
                  <RefreshCw size={14} aria-hidden />
                  Recarregar
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
