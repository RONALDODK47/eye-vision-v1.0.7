/**
 * Luz verde + SALVANDO ao lado do título do módulo, em qualquer alteração de dados.
 */
import { useEffect, useState } from 'react';
import {
  getLocalFolderSaveError,
  getLocalFolderSavePhase,
  subscribeLocalFolderDb,
  type LocalFolderSavePhase,
} from '../../lib/localFolderDatabase';

const SAVED_VISIBLE_MS = 2500;

export default function PersistenceStatusBar() {
  const [phase, setPhase] = useState<LocalFolderSavePhase>(() => getLocalFolderSavePhase());
  const [error, setError] = useState<string | null>(() => getLocalFolderSaveError());
  const [hideSaved, setHideSaved] = useState(true);

  useEffect(() => {
    return subscribeLocalFolderDb(() => {
      const next = getLocalFolderSavePhase();
      setPhase(next);
      setError(getLocalFolderSaveError());
      if (next === 'scheduled' || next === 'saving' || next === 'error') {
        setHideSaved(false);
      }
    });
  }, []);

  useEffect(() => {
    if (phase !== 'saved') return;
    setHideSaved(false);
    const t = window.setTimeout(() => setHideSaved(true), SAVED_VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  const saving = phase === 'saving' || phase === 'scheduled';
  if (phase === 'idle') return null;
  if (phase === 'saved' && hideSaved) return null;

  const label =
    phase === 'error' ? 'Erro ao salvar' : saving ? 'Salvando' : 'Salvo';

  return (
    <div
      className="flex items-center gap-2 shrink-0"
      role="status"
      aria-live="polite"
      aria-label={label}
      title={phase === 'error' ? error || 'Erro ao gravar' : 'Gravando alterações'}
    >
      <span
        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          phase === 'error'
            ? 'bg-red-600'
            : saving
              ? 'bg-green-500 animate-pulse'
              : 'bg-green-600'
        }`}
      />
      <span
        className={`text-[10px] font-black uppercase tracking-widest ${
          phase === 'error' ? 'text-red-700' : 'text-green-700'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
