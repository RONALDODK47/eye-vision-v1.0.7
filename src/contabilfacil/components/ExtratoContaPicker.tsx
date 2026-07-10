import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';
import { DynamicStyleDiv } from '../lib/dynamicStyle';
import { cn } from '../lib/utils';
import { sanitizeCodigoReduzido, normalizeExtratoContaParaGravacao, sameCodigoReduzido } from '../logic/planoContasMapper';

export type ExtratoPlanoContaOption = {
  code: string;
  name: string;
  codigoReduzido?: string;
};

const PANEL_W_PX = 272;
const PANEL_H_PX = 216;
const FILTER_LIMIT = 80;

const INPUT_CLS =
  'w-full min-w-0 h-[26px] bg-brand-sidebar/50 px-2 py-0.5 border border-brand-border text-[10px] font-bold font-mono';

function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normContaCode(code: string): string {
  return code.replace(/[^\d]/g, '').trim();
}

function reduzidoKeyVariants(reduzido: string): string[] {
  const keys = new Set<string>();
  const r = reduzido.trim();
  if (!r) return [];
  keys.add(r);
  keys.add(normContaCode(r));
  const asInt = String(parseInt(normContaCode(r) || r, 10));
  if (asInt && Number.isFinite(Number(asInt))) keys.add(asInt);
  // Domínio 7 dígitos com zero à esquerda
  if (/^\d{1,7}$/.test(asInt)) keys.add(asInt.padStart(7, '0'));
  return [...keys].filter(Boolean);
}

/** Valor usado na conciliação: CÓDIGO REDUZIDO (nunca classificação). */
export function contaValueForConciliacao(p: ExtratoPlanoContaOption): string {
  return sanitizeCodigoReduzido(p.codigoReduzido) || '';
}

/** Mapa código (reduzido/classificação) → nome da conta no plano. */
export function buildPlanoNomeLookup(
  options: ExtratoPlanoContaOption[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of options) {
    const name = p.name.trim();
    if (!name) continue;
    const reduzido = sanitizeCodigoReduzido(p.codigoReduzido);
    if (reduzido) {
      for (const k of reduzidoKeyVariants(reduzido)) map.set(k, name);
    }
    const code = p.code.trim();
    if (code) {
      map.set(code, name);
      const norm = normContaCode(code);
      if (norm) map.set(norm, name);
    }
  }
  return map;
}

function findContaNoPlano(
  code: string,
  plano: ExtratoPlanoContaOption[],
): ExtratoPlanoContaOption | undefined {
  const c = code.trim();
  if (!c || !plano.length) return undefined;
  const digits = normContaCode(c);

  return plano.find((p) => {
    const red = sanitizeCodigoReduzido(p.codigoReduzido);
    if (red && (sameCodigoReduzido(red, c) || sameCodigoReduzido(red, digits))) return true;
    const codeP = p.code.trim();
    if (codeP === c || normContaCode(codeP) === digits) return true;
    return false;
  });
}

/**
 * Resolve o NOME da conta a partir do código (reduzido ou classificação).
 * Sempre tenta o plano completo — nunca deixa DESC. DÉBITO/CRÉDITO em branco se a conta existir.
 */
export function resolveContaNome(
  lookup: Map<string, string>,
  code: string,
  plano?: ExtratoPlanoContaOption[],
): string {
  const c = code.trim();
  if (!c) return '';

  for (const k of reduzidoKeyVariants(c)) {
    const hit = lookup.get(k);
    if (hit) return hit;
  }
  const byClassif = lookup.get(c) ?? lookup.get(normContaCode(c)) ?? '';
  if (byClassif) return byClassif;

  if (plano?.length) {
    const red = normalizeExtratoContaParaGravacao(c, plano);
    if (red) {
      for (const k of reduzidoKeyVariants(red)) {
        const byRed = lookup.get(k);
        if (byRed) return byRed;
      }
      const hitRed = findContaNoPlano(red, plano);
      if (hitRed?.name?.trim()) return hitRed.name.trim();
    }
    const hit = findContaNoPlano(c, plano);
    if (hit?.name?.trim()) return hit.name.trim();
  }

  return '';
}

export function dedupePlanoOptions(options: ExtratoPlanoContaOption[]): ExtratoPlanoContaOption[] {
  const seen = new Set<string>();
  const out: ExtratoPlanoContaOption[] = [];
  for (const p of options) {
    const key = contaValueForConciliacao(p) || p.code.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ code: p.code, name: p.name, codigoReduzido: p.codigoReduzido });
  }
  return out;
}

function filterPlanoOptions(options: ExtratoPlanoContaOption[], query: string): ExtratoPlanoContaOption[] {
  const q = normalizeSearch(query.trim());
  const withReduzido = options.filter((p) => Boolean(sanitizeCodigoReduzido(p.codigoReduzido)));
  const source = withReduzido.length > 0 ? withReduzido : options;
  if (!q) return source.slice(0, FILTER_LIMIT);
  const out: ExtratoPlanoContaOption[] = [];
  for (const p of source) {
    const red = sanitizeCodigoReduzido(p.codigoReduzido) || '';
    if (
      normalizeSearch(red).includes(q) ||
      normalizeSearch(p.code).includes(q) ||
      normalizeSearch(p.name).includes(q)
    ) {
      out.push(p);
      if (out.length >= FILTER_LIMIT) break;
    }
  }
  return out;
}

type ExtratoContaPickerProps = {
  value: string;
  options: ExtratoPlanoContaOption[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  onChange: (code: string) => void;
};

export default memo(function ExtratoContaPicker({
  value,
  options,
  placeholder,
  ariaLabel,
  className,
  onChange,
}: ExtratoContaPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  /** Digitação local — só grava no pai no blur / Enter / escolha da lista. */
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const focusedRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(value);
      draftRef.current = value;
    }
  }, [value]);

  const commit = useCallback(
    (code: string) => {
      const raw = code.trim();
      // Digitação livre: converte classificação → reduzido; rejeita classificação sem match.
      const next = raw
        ? normalizeExtratoContaParaGravacao(raw, options) ||
          (sanitizeCodigoReduzido(raw) ?? '')
        : '';
      draftRef.current = next;
      setDraft(next);
      if (next !== value.trim()) onChange(next);
    },
    [onChange, options, value],
  );

  const filtered = useMemo(() => filterPlanoOptions(options, query), [options, query]);
  const onlyReduzido = useMemo(
    () => options.some((p) => Boolean(sanitizeCodigoReduzido(p.codigoReduzido))),
    [options],
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
    updatePos();
    setQuery('');
    setOpen(true);
  }, [updatePos]);

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
            className="fixed z-[220] border border-brand-border bg-brand-bg shadow-[4px_4px_0_0_#141414] flex flex-col overflow-hidden w-[272px] h-[216px]"
            layout={{ top: pos.top, left: pos.left }}
            layoutDeps={[pos.top, pos.left]}
          >
            <div className="p-1.5 border-b border-brand-border/30 flex items-center gap-1 shrink-0 bg-brand-sidebar/20">
              <Search size={11} className="opacity-50 shrink-0" aria-hidden />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar reduzido ou nome..."
                className="w-full bg-transparent text-[9px] font-mono outline-none placeholder:opacity-50"
                aria-label="Buscar conta no plano"
              />
            </div>
            {onlyReduzido ? (
              <p className="text-[8px] px-2 py-1 border-b border-brand-border/20 text-amber-800 bg-amber-50 shrink-0 font-bold uppercase">
                Só código reduzido — classificação proibida
              </p>
            ) : (
              <p className="text-[8px] px-2 py-1 border-b border-brand-border/20 text-rose-800 bg-rose-50 shrink-0 font-bold uppercase">
                Plano sem reduzido — importe o código reduzido
              </p>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {filtered.length === 0 ? (
                <p className="p-3 text-[9px] text-slate-500 uppercase text-center">Nenhuma conta encontrada</p>
              ) : (
                filtered.map((p, i) => {
                  const red = contaValueForConciliacao(p);
                  if (!red && onlyReduzido) return null;
                  const pick = red || p.code;
                  return (
                    <button
                      key={`${pick}-${i}`}
                      type="button"
                      className={cn(
                        'w-full text-left px-2 py-1.5 border-b border-brand-border/10 hover:bg-brand-border hover:text-brand-bg transition-colors',
                        value === pick && 'bg-brand-sidebar/60',
                      )}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        commit(pick);
                        setOpen(false);
                        inputRef.current?.blur();
                      }}
                    >
                      <div className="text-[9px] font-black font-mono leading-tight">
                        {red ? red : p.code}
                        {red ? (
                          <span className="ml-1 font-normal opacity-50 text-[8px]">(reduzido)</span>
                        ) : null}
                      </div>
                      <div className="text-[8px] uppercase truncate opacity-80 leading-tight">{p.name}</div>
                      {red && p.code.includes('.') ? (
                        <div className="text-[7px] opacity-40 font-mono truncate line-through">
                          classif. {p.code}
                        </div>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
            {options.length > FILTER_LIMIT && !query.trim() && (
              <p className="text-[8px] px-2 py-1 border-t border-brand-border/20 text-slate-500 text-center shrink-0 bg-brand-sidebar/10">
                {options.length.toLocaleString('pt-BR')} contas — digite para filtrar
              </p>
            )}
          </DynamicStyleDiv>,
          document.body,
        )
      : null;

  const inputHandlers = {
    onFocus: () => {
      focusedRef.current = true;
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      draftRef.current = e.target.value;
      setDraft(e.target.value);
    },
    onBlur: () => {
      focusedRef.current = false;
      commit(draftRef.current);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit(draftRef.current);
        e.currentTarget.blur();
      }
      if (e.key === 'Escape') {
        draftRef.current = value;
        setDraft(value);
        setOpen(false);
        e.currentTarget.blur();
      }
    },
  };

  if (options.length === 0) {
    return (
      <input
        type="text"
        className={INPUT_CLS}
        value={draft}
        placeholder={placeholder ?? 'Código reduzido…'}
        aria-label={ariaLabel}
        {...inputHandlers}
      />
    );
  }

  return (
    <div ref={wrapRef} className={cn('flex items-stretch gap-0.5 w-full min-w-0', className)}>
      <input
        ref={inputRef}
        type="text"
        className={cn(INPUT_CLS, 'flex-1')}
        value={draft}
        placeholder={placeholder ?? 'Código reduzido (não use classificação)…'}
        aria-label={ariaLabel}
        {...inputHandlers}
      />
      <button
        type="button"
        tabIndex={-1}
        className="shrink-0 px-1 border border-brand-border/20 bg-brand-sidebar/50 hover:bg-brand-sidebar/80"
        aria-label="Abrir lista de contas"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        <ChevronDown size={10} aria-hidden />
      </button>
      {panel}
    </div>
  );
});
