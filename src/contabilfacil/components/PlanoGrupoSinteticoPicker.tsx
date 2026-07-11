/**
 * Seletor de conta sintética (classificação hierárquica) com busca — grupos entrada/saída IA.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { DynamicStyleDiv } from '../lib/dynamicStyle';
import { cn } from '../lib/utils';
import type { ExtratoPlanoContaOption } from './ExtratoContaPicker';

const PANEL_W_PX = 340;
const PANEL_H_PX = 260;
const FILTER_LIMIT = 60;

const INPUT_CLS =
  'w-full min-w-0 h-[22px] bg-white px-1.5 py-0 border border-brand-border/50 text-[8px] font-bold font-mono';

function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isContaSintetica(p: ExtratoPlanoContaOption): boolean {
  if (p.tipo === 'S') return true;
  if (p.tipo === 'A') return false;
  return !String(p.codigoReduzido ?? '').trim();
}

function rowMatchesQuery(p: ExtratoPlanoContaOption, q: string): boolean {
  const name = normalizeSearch(p.name);
  const tokens = q.split(/\s+/).filter(Boolean);
  const nameHit = tokens.length > 0 ? tokens.every((t) => name.includes(t)) : name.includes(q);
  return (
    normalizeSearch(p.code).includes(q) ||
    nameHit ||
    (p.group ? normalizeSearch(p.group).includes(q) : false)
  );
}

function filterSinteticas(
  options: ExtratoPlanoContaOption[],
  query: string,
): ExtratoPlanoContaOption[] {
  const sinteticas = options
    .filter(isContaSintetica)
    .sort((a, b) => a.code.localeCompare(b.code, 'pt-BR', { numeric: true }));
  const q = normalizeSearch(query.trim());
  if (!q) return sinteticas.slice(0, FILTER_LIMIT);
  return sinteticas.filter((p) => rowMatchesQuery(p, q)).slice(0, FILTER_LIMIT);
}

function resolveClassificacao(
  raw: string,
  options: ExtratoPlanoContaOption[],
): string {
  const v = raw.trim();
  if (!v) return '';
  const hit = options.find(
    (p) =>
      isContaSintetica(p) &&
      (p.code.trim() === v || normalizeSearch(p.code) === normalizeSearch(v)),
  );
  if (hit) return hit.code.trim();
  if (/^\d+(\.\d+)+$/.test(v)) return v;
  const byName = options.find(
    (p) => isContaSintetica(p) && normalizeSearch(p.name).includes(normalizeSearch(v)),
  );
  return byName?.code.trim() ?? v;
}

export type PlanoGrupoSinteticoPickerProps = {
  value: string;
  options: ExtratoPlanoContaOption[];
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  onChange: (classificacao: string) => void;
};

export default memo(function PlanoGrupoSinteticoPicker({
  value,
  options,
  placeholder = 'Buscar grupo sintético…',
  ariaLabel,
  disabled = false,
  onChange,
}: PlanoGrupoSinteticoPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!focusedRef.current) setDraft(value);
  }, [value]);

  const filtered = useMemo(() => filterSinteticas(options, query), [options, query]);

  const nomeGrupo = useMemo(() => {
    const hit = options.find((p) => isContaSintetica(p) && p.code.trim() === value.trim());
    return hit?.name?.trim() ?? '';
  }, [options, value]);

  const commit = useCallback(
    (raw: string) => {
      const next = resolveClassificacao(raw, options);
      setDraft(next);
      if (next !== value.trim()) onChange(next);
    },
    [onChange, options, value],
  );

  const updatePos = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + PANEL_W_PX > window.innerWidth - 8) left = window.innerWidth - PANEL_W_PX - 8;
    if (top + PANEL_H_PX > window.innerHeight - 8) top = Math.max(8, rect.top - PANEL_H_PX - 4);
    setPos({ top, left: Math.max(8, left) });
  }, []);

  const openPanel = useCallback(() => {
    if (disabled || options.length === 0) return;
    updatePos();
    setQuery('');
    setOpen(true);
  }, [disabled, options.length, updatePos]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const panel =
    open && options.length > 0
      ? createPortal(
          <DynamicStyleDiv
            ref={panelRef}
            className="fixed z-[230] border-2 border-brand-border bg-white shadow-[4px_4px_0_0_#141414] flex flex-col overflow-hidden"
            layout={{ top: pos.top, left: pos.left, width: PANEL_W_PX, height: PANEL_H_PX }}
            layoutDeps={[pos.top, pos.left]}
          >
            <div className="p-1.5 border-b border-brand-border flex items-center gap-1 shrink-0 bg-brand-sidebar">
              <Search size={11} className="text-brand-text/70 shrink-0" aria-hidden />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Código ou nome do grupo…"
                className="flex-1 min-w-0 bg-transparent text-[9px] font-semibold outline-none"
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="p-2 text-[9px] text-center text-brand-text/50 uppercase font-semibold">
                  Nenhum grupo sintético
                </p>
              ) : (
                filtered.map((p, i) => (
                  <button
                    key={`${p.code}-${i}`}
                    type="button"
                    className={cn(
                      'w-full text-left px-2 py-1.5 border-b border-brand-border/30 hover:bg-brand-sidebar/80',
                      value === p.code.trim() && 'bg-brand-text text-white hover:bg-brand-text',
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      commit(p.code.trim());
                      setOpen(false);
                      inputRef.current?.blur();
                    }}
                  >
                    <div className="text-[9px] font-mono font-black">{p.code}</div>
                    <div className="text-[8px] font-semibold uppercase truncate opacity-90">{p.name}</div>
                    {p.group ? (
                      <div className="text-[7px] uppercase opacity-60">{p.group}</div>
                    ) : null}
                  </button>
                ))
              )}
            </div>
            <p className="text-[7px] px-2 py-1 border-t border-brand-border text-center text-brand-text/50 shrink-0">
              {options.filter(isContaSintetica).length} grupo(s) sintético(s)
            </p>
          </DynamicStyleDiv>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <div className="flex items-center gap-0.5">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel}
          title={nomeGrupo ? `${value} — ${nomeGrupo}` : value || placeholder}
          className={cn(INPUT_CLS, disabled && 'opacity-50', nomeGrupo && 'border-amber-600/40')}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            focusedRef.current = false;
            commit(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(draft);
              e.currentTarget.blur();
            }
            if (e.key === 'ArrowDown' && !open) {
              e.preventDefault();
              openPanel();
            }
          }}
        />
        <button
          type="button"
          disabled={disabled || options.length === 0}
          onClick={openPanel}
          className="shrink-0 h-[22px] w-[22px] border border-brand-border/50 bg-brand-sidebar/30 flex items-center justify-center disabled:opacity-40"
          aria-label="Buscar grupo sintético no plano"
          title="Buscar conta sintética"
        >
          <Search size={11} />
        </button>
      </div>
      {nomeGrupo ? (
        <p className="text-[6px] font-semibold uppercase truncate text-brand-text/55 mt-0.5" title={nomeGrupo}>
          {nomeGrupo}
        </p>
      ) : null}
      {panel}
    </div>
  );
});
