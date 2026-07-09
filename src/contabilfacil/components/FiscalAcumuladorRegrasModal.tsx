import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ListOrdered, Plus, Trash2, X } from 'lucide-react';
import { cn } from '../lib/utils';
import type {
  FiscalAcumuladorRegra,
  FiscalAcumuladorRegraNature,
} from '../logic/fiscalAcumuladorRegrasStorage';
import {
  addFiscalAcumuladorRegra,
  removeFiscalAcumuladorRegra,
  saveFiscalAcumuladorRegras,
} from '../logic/fiscalAcumuladorRegrasStorage';
import { normalizeExtratoRegraTexto } from '../logic/extratoRegrasContasStorage';
import { CF_FORM_INPUT_LONG, CF_SELECT_WIDE } from '../lib/formFieldClasses';
import ExtratoContaPicker, { type ExtratoPlanoContaOption } from './ExtratoContaPicker';
import type { FiscalAcumuladorGroup } from '../logic/fiscalAcumuladorModel';

export type FiscalAcumuladorOption = { key: string; label: string };

export type FiscalAcumuladorRegrasModalProps = {
  open: boolean;
  company: string;
  regras: FiscalAcumuladorRegra[];
  planoOptions: ExtratoPlanoContaOption[];
  acumuladores: FiscalAcumuladorGroup[];
  nfAcumuladores?: FiscalAcumuladorOption[];
  onClose: () => void;
  onChange: (next: FiscalAcumuladorRegra[]) => void;
};

const INPUT_REGRA_CLS = cn(
  CF_FORM_INPUT_LONG,
  'max-w-none w-full h-[26px] text-[10px] uppercase',
);

export default memo(function FiscalAcumuladorRegrasModal({
  open,
  company,
  regras,
  planoOptions,
  acumuladores,
  nfAcumuladores = [],
  onClose,
  onChange,
}: FiscalAcumuladorRegrasModalProps) {
  const [scopeKey, setScopeKey] = useState('');
  const [draftDescricao, setDraftDescricao] = useState('');
  const [draftNature, setDraftNature] = useState<FiscalAcumuladorRegraNature>('D');
  const [draftConta, setDraftConta] = useState('');

  useEffect(() => {
    if (!open) return;
    setScopeKey('');
    setDraftDescricao('');
    setDraftNature('D');
    setDraftConta('');
  }, [open]);

  const regrasFiltradas = useMemo(() => {
    if (!scopeKey) return regras;
    return regras.filter((r) => !r.acumuladorKey || r.acumuladorKey === scopeKey);
  }, [regras, scopeKey]);

  const persist = useCallback(
    (next: FiscalAcumuladorRegra[]) => {
      onChange(saveFiscalAcumuladorRegras(company, next));
    },
    [company, onChange],
  );

  const handleAdd = useCallback(() => {
    const descricao = normalizeExtratoRegraTexto(draftDescricao);
    const contaContrapartida = draftConta.trim();
    if (!descricao || !contaContrapartida) return;
    persist(
      addFiscalAcumuladorRegra(company, {
        nome: descricao.slice(0, 40),
        descricao,
        nature: draftNature,
        contaContrapartida,
        acumuladorKey: scopeKey || undefined,
      }),
    );
    setDraftDescricao('');
    setDraftNature('D');
    setDraftConta('');
  }, [company, draftConta, draftDescricao, draftNature, persist, scopeKey]);

  const handleRemove = useCallback(
    (id: string) => {
      persist(removeFiscalAcumuladorRegra(company, id));
    },
    [company, persist],
  );

  const contaLabel = useCallback(
    (code: string) => {
      const hit = planoOptions.find((p) => p.code === code);
      return hit ? `${hit.code} — ${hit.name}` : code;
    },
    [planoOptions],
  );

  const acumuladorLabel = useCallback(
    (key: string) => {
      const nfHit = nfAcumuladores.find((a) => a.key === key);
      if (nfHit) return nfHit.label;
      const hit = acumuladores.find((a) => a.key === key);
      if (!hit) return key;
      return `${hit.item.registro} · ${hit.item.codigo} · ${hit.item.descricao.slice(0, 32)}`;
    },
    [acumuladores, nfAcumuladores],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[81] flex items-center justify-center p-4 bg-black/50">
      <div
        className="technical-panel shadow-[6px_6px_0_0_#141414] w-full max-w-3xl max-h-[90vh] flex flex-col"
        role="dialog"
        aria-labelledby="fiscal-acumulador-regras-title"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-brand-border bg-brand-sidebar/40">
          <div className="flex-1 min-w-0">
            <h2
              id="fiscal-acumulador-regras-title"
              className="text-sm font-black uppercase tracking-widest inline-flex items-center gap-2"
            >
              <ListOrdered size={16} aria-hidden="true" />
              Regras de contas — acumuladores
            </h2>
            <p className="text-[10px] text-slate-600 mt-1 leading-snug max-w-xl">
              Igual à conciliação do extrato: cadastre palavras do histórico ou do fornecedor da NF e a
              contrapartida. Pode limitar a regra a um acumulador específico.
            </p>
            <div className="mt-3 max-w-md">
              <label className="block text-[8px] font-bold uppercase opacity-50 mb-1">
                Acumulador (opcional)
              </label>
              <select
                aria-label="Acumulador das regras"
                value={scopeKey}
                onChange={(e) => setScopeKey(e.target.value)}
                className={cn(CF_SELECT_WIDE, 'text-[10px] w-full max-w-none')}
              >
                <option value="">Todas as regras / todos os acumuladores</option>
                {nfAcumuladores.length > 0 ? (
                  <optgroup label="Notas fiscais (CFOP)">
                    {nfAcumuladores.map((a) => (
                      <option key={a.key} value={a.key}>
                        {a.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {acumuladores.length > 0 ? (
                  <optgroup label="Apuração SPED">
                    {acumuladores.map((a) => (
                      <option key={a.id} value={a.key}>
                        {a.item.registro} · {a.item.codigo} — {a.item.descricao.slice(0, 40)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-red-600 shrink-0"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 border-b border-brand-border/40 space-y-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-brand-text/60">
            Nova regra
            {scopeKey ? ` · ${acumuladorLabel(scopeKey)}` : ' · global'}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch">
            <input
              type="text"
              aria-label="Texto para casar"
              value={draftDescricao}
              onChange={(e) => setDraftDescricao(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="FORNECEDOR, PIX, TARIFA…"
              className={INPUT_REGRA_CLS}
            />
            <select
              aria-label="Natureza"
              value={draftNature}
              onChange={(e) => setDraftNature(e.target.value as FiscalAcumuladorRegraNature)}
              className={cn(CF_SELECT_WIDE, 'h-[26px] text-[10px] w-24 shrink-0')}
            >
              <option value="D">Débito</option>
              <option value="C">Crédito</option>
            </select>
            <div className="flex-1 min-w-[140px]">
              <ExtratoContaPicker
                value={draftConta}
                options={planoOptions}
                onChange={setDraftConta}
                placeholder="Conta contrapartida"
              />
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!draftDescricao.trim() || !draftConta.trim()}
              className="technical-button-primary text-[10px] px-3 py-1 flex items-center gap-1 font-bold shrink-0 disabled:opacity-40"
            >
              <Plus size={12} />
              Adicionar
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {regrasFiltradas.length === 0 ? (
            <p className="text-[10px] text-slate-500 uppercase text-center py-8">
              Nenhuma regra cadastrada.
            </p>
          ) : (
            <ul className="space-y-2">
              {regrasFiltradas.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-2 p-2 border border-brand-border/40 bg-brand-sidebar/10 text-[10px] font-mono"
                >
                  <span className="font-black uppercase px-1.5 py-0.5 bg-brand-sidebar/50 border border-brand-border">
                    {r.nature}
                  </span>
                  <span className="flex-1 min-w-[120px] font-bold">{r.descricao}</span>
                  <span className="opacity-70 truncate max-w-[200px]" title={contaLabel(r.contaContrapartida)}>
                    → {contaLabel(r.contaContrapartida)}
                  </span>
                  {r.acumuladorKey ? (
                    <span className="text-[8px] uppercase opacity-50 max-w-[160px] truncate" title={r.acumuladorKey}>
                      [{acumuladorLabel(r.acumuladorKey)}]
                    </span>
                  ) : (
                    <span className="text-[8px] uppercase opacity-40">[global]</span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(r.id)}
                    className="p-1 text-red-700 hover:bg-red-50"
                    aria-label="Remover regra"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-3 border-t border-brand-border flex justify-end gap-2">
          <button type="button" onClick={onClose} className="technical-button text-[10px] px-4 py-2 font-bold">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
});
