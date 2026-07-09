import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import './index.css';
import { deferIdle } from './contabilfacil/lib/deferIdle';

export const DATA_HYDRATED_EVENT = 'contabilfacil:data-hydrated';

/**
 * Dev only: silencia logs ruidosos do cliente HMR do Vite no console do navegador
 * (ex.: "[vite] hot updated:", "[vite] connecting...", "[vite] connected.").
 * Erros e warnings continuam visíveis.
 */
if (import.meta.env.DEV) {
  const originalLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && /^\[vite\]\s/.test(first)) return;
    originalLog(...args);
  };

  const originalInfo = console.info.bind(console);
  console.info = (...args: unknown[]) => {
    const text = args.map(String).join(' ');
    if (/react devtools/i.test(text)) return;
    originalInfo(...args);
  };

  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const text = args.map(String).join(' ');
    if (/react devtools/i.test(text)) return;
    originalError(...args);
  };
}

/** Legado (?mv_auth) — apenas limpa a barra se o Hub tiver passado o parâmetro. */
function stripMvAuthSearchParam(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('mv_auth')) return;
    params.delete('mv_auth');
    const qs = params.toString();
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
    );
  } catch {
    /* ignore */
  }
}

stripMvAuthSearchParam();

const rootEl = document.getElementById('root')!;

createRoot(rootEl).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

/** Telemetria/bridge em idle para não atrasar login inicial. */
deferIdle(() => {
  void import('./contabilfacil/agent/browserConsoleBridge').then((mod) => {
    mod.installBrowserConsoleBridge();
  });
}, 600);

/** Calendário bancário em background — não bloqueia primeira tela (login). */
deferIdle(() => {
  void import('./services/bankingCalendarService').then((mod) => {
    mod.hydrateBankingCalendarFromStorage();
    void mod.hydrateBankingCalendarFromRemote();
  });
}, 900);

/** Dados BCB e contratos em background — não bloqueia a UI. */
deferIdle(() => {
  void Promise.all([
    import('./services/bcbSeriesStorage'),
    import('./lib/deployDataBundle'),
  ]).then(([bcb, deploy]) =>
    Promise.all([
      bcb.hydrateBcbSeriesFromBundledAssets(),
      deploy.hydrateDeployDataFromBundledAssets(),
    ]),
  ).then(() => {
    window.dispatchEvent(new CustomEvent(DATA_HYDRATED_EVENT));
  });
}, 1200);
