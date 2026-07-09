import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '../lib/utils';
import { pingBcbApi } from '../../services/bcbService';
import { fetchGeminiApiHealth, geminiStatusTitle } from '../../services/geminiApi';
import { notifyDebugAppHealthy } from '../agent/browserConsoleBridge';
import { deferIdle } from '../lib/deferIdle';
import { useVisibilityAwareInterval } from '../lib/useVisibilityAwareInterval';
import type { ActiveTab } from '../types';
import {
  getApiStatusRegistryForTab,
  initialApiStatusMap,
  probeAllApiStatuses,
  type ApiStatusEntry,
  type ApiStatusValue,
} from '../../services/apiStatusRegistry';

const REFRESH_MS = 120_000;

function statusDotClass(status: ApiStatusValue): string {
  if (status === 'online') return 'bg-green-600';
  if (status === 'offline') return 'bg-red-600';
  return 'bg-amber-500 animate-pulse';
}

function statusLabel(status: ApiStatusValue): string {
  if (status === 'online') return 'ON';
  if (status === 'offline') return 'OFF';
  return '…';
}

function ApiStatusItem({
  entry,
  status,
  titleOverride,
}: {
  entry: ApiStatusEntry;
  status: ApiStatusValue;
  titleOverride?: string;
}) {
  const title =
    titleOverride ??
    `${entry.label}${entry.port ? ` (${entry.port})` : ''}: ${
      status === 'online' ? 'disponível' : status === 'offline' ? 'indisponível' : 'verificando…'
    }`;

  return (
    <div
      className="flex items-center gap-1.5 shrink-0"
      title={title}
      role="status"
      aria-label={title}
    >
      <div className={cn('w-2 h-2 rounded-full shrink-0', statusDotClass(status))} />
      <span className="text-[9px] font-mono font-bold whitespace-nowrap">
        {entry.label}
        {entry.port ? ` :${entry.port}` : ''}: {statusLabel(status)}
      </span>
    </div>
  );
}

export default function ApiStatusBar({ activeTab }: { activeTab: ActiveTab }) {
  const registry = useMemo(() => getApiStatusRegistryForTab(activeTab), [activeTab]);
  const [statusMap, setStatusMap] = useState(() => initialApiStatusMap(registry));
  const [bcbTitle, setBcbTitle] = useState<string | undefined>(undefined);
  const [geminiTitle, setGeminiTitle] = useState<string | undefined>(undefined);

  const refresh = useCallback(async (deepGemini = false) => {
    const next = await probeAllApiStatuses(registry);
    setStatusMap(next);

    const showsBcb = registry.some((e) => e.id === 'bcb');
    if (!showsBcb) {
      setBcbTitle(undefined);
    } else {
      const live = await pingBcbApi().catch(() => false);
      if (live) setBcbTitle('BCB (remoto): API SGS online');
      else if (next.bcb === 'online') {
        setBcbTitle('BCB: API ao vivo indisponível — usando histórico embutido (PRONAMPE)');
      } else {
        setBcbTitle(undefined);
      }
    }

    const showsGemini = registry.some((e) => e.id === 'gemini');
    if (!showsGemini) {
      setGeminiTitle(undefined);
    } else {
      const health = await fetchGeminiApiHealth(deepGemini).catch(() => ({
        ok: false,
        configured: false,
      }));
      setGeminiTitle(geminiStatusTitle(health, next.gemini === 'online'));
    }

    notifyDebugAppHealthy();
  }, [registry]);

  useEffect(() => {
    setStatusMap(initialApiStatusMap(registry));
    deferIdle(() => void refresh(), 1500);
  }, [registry, refresh]);

  useVisibilityAwareInterval(() => void refresh(), REFRESH_MS);

  if (registry.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 max-w-[min(100%,52rem)]">
      {registry.map((entry) => (
        <ApiStatusItem
          key={entry.id}
          entry={entry}
          status={statusMap[entry.id] ?? 'checking'}
          titleOverride={
            entry.id === 'bcb' ? bcbTitle : entry.id === 'gemini' ? geminiTitle : undefined
          }
        />
      ))}
      <button
        type="button"
        onClick={() => void refresh(true)}
        className="text-[8px] font-mono font-bold uppercase opacity-50 hover:opacity-100 underline shrink-0"
        title="Atualizar status (Gemini faz ping real na Google). Fiscal :8780 OFF? Rode npm run dev."
      >
        Atualizar
      </button>
    </div>
  );
}
