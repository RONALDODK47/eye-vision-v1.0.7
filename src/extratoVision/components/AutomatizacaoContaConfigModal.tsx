import React, { useCallback, useMemo, useState } from 'react';
import { Info, Plus, Trash2, X } from 'lucide-react';
import type { VisionPlanoRow } from '../types/accounting';
import {
  PAPEIS_AUTOMACAO_UI,
  type AutomacaoContaConfig,
  type AutomacaoContaPapel,
  type AutomacaoContaPapelConfig,
  type AutomacaoContaVinculo,
  type AutomacaoDataModo,
  type AutomacaoEmprestimoColigada,
  buscarContasNoPlano,
  newEmprestimoColigadaId,
  readAutomatizacaoContaConfig,
  saveAutomatizacaoContaConfig,
  vinculoFromCodigoManual,
  vinculoFromPlano,
} from '../utils/automatizacaoContaConfig';
import {
  loadCompaniesRegistry,
  normalizeCompanyName,
} from '../../contabilfacil/logic/companyWorkspace';
import { listAiColigadasParaIa } from '../../contabilfacil/logic/aiInteligenciaStorage';

type Surface = 'vision' | 'contabilfacil';

type Props = {
  open: boolean;
  onClose: () => void;
  planoRows: VisionPlanoRow[];
  empresaNome: string;
  onSaved?: (config: AutomacaoContaConfig) => void;
  surface?: Surface;
};

function VinculoLadoField({
  lado,
  tituloLado,
  hintLado,
  vinculo,
  planoRows,
  buscaGlobal,
  resultadosBusca,
  onSelectPlano,
  onApplyCodigo,
  onClear,
  contabil,
}: {
  lado: 'debito' | 'credito';
  tituloLado: string;
  hintLado: string;
  vinculo?: AutomacaoContaVinculo;
  planoRows: VisionPlanoRow[];
  buscaGlobal: string;
  resultadosBusca: VisionPlanoRow[];
  onSelectPlano: (p: VisionPlanoRow, lado: 'debito' | 'credito') => void;
  onApplyCodigo: (codigo: string, lado: 'debito' | 'credito') => void;
  onClear: (lado: 'debito' | 'credito') => void;
  contabil: boolean;
}) {
  const [codigoManual, setCodigoManual] = useState(vinculo?.classificacao ?? '');
  const inputMonoClass = contabil
    ? 'flex-1 min-w-[120px] px-2 py-1.5 bg-white border border-brand-border text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-brand-border'
    : 'flex-1 min-w-[120px] bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-xs font-mono';

  const ladoBadgeClass =
    lado === 'debito'
      ? contabil
        ? 'bg-red-800 text-white'
        : 'bg-red-600/80 text-white'
      : contabil
        ? 'bg-emerald-800 text-white'
        : 'bg-emerald-600/80 text-white';

  const vinculoSalvoClass = contabil
    ? 'text-[10px] font-mono font-bold text-green-800 bg-green-50 border border-green-800/30 px-2 py-1'
    : 'text-[10px] text-emerald-300/90 font-mono';

  const listClass = contabil
    ? 'max-h-28 overflow-y-auto border border-brand-border bg-white divide-y divide-brand-border/30'
    : 'max-h-28 overflow-y-auto custom-scrollbar rounded border border-slate-700 divide-y divide-slate-800';

  const listBtnClass = contabil
    ? 'w-full text-left px-2 py-1.5 text-[10px] font-mono transition-colors hover:bg-brand-border hover:text-brand-bg'
    : 'w-full text-left px-2 py-1.5 hover:bg-violet-950/40 text-[10px]';

  const btnSecondary = contabil
    ? 'technical-button text-[10px] py-1 px-2'
    : 'px-2 py-1 rounded-lg border border-slate-600 text-slate-400 text-[10px] uppercase';

  React.useEffect(() => {
    setCodigoManual(vinculo?.classificacao ?? '');
  }, [vinculo?.classificacao]);

  const showResults = buscaGlobal.trim().length > 0 && resultadosBusca.length > 0;

  const aplicarCodigo = () => {
    const t = codigoManual.trim();
    if (!t) {
      if (vinculo) onClear(lado);
      return;
    }
    if (t === (vinculo?.classificacao ?? '').trim()) return;
    onApplyCodigo(t, lado);
  };

  return (
    <div
      className={
        contabil
          ? 'border border-brand-border/40 bg-white p-3 space-y-2'
          : 'rounded-lg border border-slate-700/80 bg-slate-950/40 p-2.5 space-y-2'
      }
    >
      <div className="flex items-start gap-2">
        <span className={`shrink-0 px-1.5 py-0.5 text-[9px] font-black uppercase ${ladoBadgeClass}`}>
          {tituloLado}
        </span>
        <p className={contabil ? 'text-[9px] font-bold uppercase opacity-50 leading-snug flex-1' : 'text-[10px] text-slate-500 leading-snug flex-1'}>
          {hintLado}
        </p>
      </div>
      {vinculo?.classificacao && (
        <p className={vinculoSalvoClass}>
          {vinculo.classificacao}
          {vinculo.nome ? ` — ${vinculo.nome}` : ''}
        </p>
      )}
      {showResults && (
        <ul className={listClass}>
          {resultadosBusca.map((p) => (
            <li key={`${lado}-${p.codigo}`}>
              <button
                type="button"
                className={listBtnClass}
                onClick={() => onSelectPlano(p, lado)}
              >
                <span className="font-bold">{p.codigo}</span>
                {p.codigoReduzido && <span className="opacity-60 ml-1">({p.codigoReduzido})</span>}
                <span className="ml-1">— {p.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[140px]">
          <label className={contabil ? 'block text-[9px] font-bold uppercase opacity-50 mb-1' : 'sr-only'}>
            Código {tituloLado}
          </label>
          <input
            type="text"
            value={codigoManual}
            onChange={(e) => setCodigoManual(e.target.value)}
            onBlur={aplicarCodigo}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                aplicarCodigo();
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="Código / classificação — clique fora para aplicar"
            className={inputMonoClass}
            aria-label={`Código manual ${tituloLado}`}
          />
        </div>
        {vinculo && (
          <button type="button" onClick={() => onClear(lado)} className={btnSecondary}>
            Limpar
          </button>
        )}
      </div>
    </div>
  );
}

function PapelEditor({
  papel,
  titulo,
  hint,
  debHint,
  credHint,
  info,
  config,
  planoRows,
  onChange,
  contabil,
}: {
  papel: AutomacaoContaPapel;
  titulo: string;
  hint: string;
  debHint: string;
  credHint: string;
  info: string;
  config?: AutomacaoContaPapelConfig;
  planoRows: VisionPlanoRow[];
  onChange: (p: AutomacaoContaPapel, cfg: AutomacaoContaPapelConfig | undefined) => void;
  contabil: boolean;
}) {
  const [busca, setBusca] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);

  const resultados = useMemo(
    () => buscarContasNoPlano(planoRows, busca, 20),
    [planoRows, busca],
  );

  const sectionClass = contabil
    ? 'technical-panel p-4 bg-brand-sidebar/15 space-y-3'
    : 'rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-2';

  const labelTitle = contabil
    ? 'text-[10px] font-black uppercase tracking-widest text-brand-text'
    : 'text-[11px] font-bold text-violet-200';

  const labelHint = contabil
    ? 'text-[9px] font-bold uppercase opacity-50 leading-snug'
    : 'text-[10px] text-slate-500 leading-snug';

  const inputClass = contabil
    ? 'w-full px-2 py-1.5 bg-white border border-brand-border text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-brand-border'
    : 'w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs';

  const patch = (patchCfg: Partial<AutomacaoContaPapelConfig>) => {
    const next: AutomacaoContaPapelConfig = {
      ...config,
      ...patchCfg,
    };
    delete next.classificacao;
    delete next.codigo;
    delete next.nome;
    if (!next.debito?.classificacao && !next.credito?.classificacao) {
      onChange(papel, undefined);
      return;
    }
    onChange(papel, next);
  };

  const setLado = (lado: 'debito' | 'credito', v: AutomacaoContaVinculo | undefined) => {
    if (!v) {
      const next = { ...config };
      if (lado === 'debito') delete next.debito;
      else delete next.credito;
      patch(next);
      return;
    }
    patch(lado === 'debito' ? { debito: v } : { credito: v });
  };

  return (
    <div className={sectionClass}>
      <div>
        <div className="flex items-center gap-2">
          <p className={labelTitle}>{titulo}</p>
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className={
              contabil
                ? 'h-6 w-6 border border-brand-border flex items-center justify-center hover:bg-brand-sidebar/20'
                : 'h-6 w-6 rounded border border-slate-600 flex items-center justify-center hover:bg-slate-800'
            }
            title="Como a automação usa este bloco"
            aria-label={`Informações de ${titulo}`}
          >
            <Info size={12} />
          </button>
        </div>
        <p className={labelHint}>{hint}</p>
      </div>

      <div>
        <label className={contabil ? 'block text-[9px] font-bold uppercase opacity-50 mb-1' : 'sr-only'}>
          Pesquisar no plano
        </label>
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Pesquisar no plano (nome ou código) — clique na conta e escolha D ou C abaixo"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <VinculoLadoField
          lado="debito"
          tituloLado="Débito"
          hintLado={debHint}
          vinculo={config?.debito}
          planoRows={planoRows}
          buscaGlobal={busca}
          resultadosBusca={resultados}
          onSelectPlano={(p, lado) => {
            setLado(lado, vinculoFromPlano(p));
            setBusca('');
          }}
          onApplyCodigo={(cod, lado) => {
            const t = cod.trim();
            if (!t) setLado(lado, undefined);
            else setLado(lado, vinculoFromCodigoManual(t, planoRows));
          }}
          onClear={(lado) => setLado(lado, undefined)}
          contabil={contabil}
        />
        <VinculoLadoField
          lado="credito"
          tituloLado="Crédito"
          hintLado={credHint}
          vinculo={config?.credito}
          planoRows={planoRows}
          buscaGlobal={busca}
          resultadosBusca={resultados}
          onSelectPlano={(p, lado) => {
            setLado(lado, vinculoFromPlano(p));
            setBusca('');
          }}
          onApplyCodigo={(cod, lado) => {
            const t = cod.trim();
            if (!t) setLado(lado, undefined);
            else setLado(lado, vinculoFromCodigoManual(t, planoRows));
          }}
          onClear={(lado) => setLado(lado, undefined)}
          contabil={contabil}
        />
      </div>
      {busca.trim() && resultados.length === 0 && (
        <p className="text-[9px] opacity-50">Nenhuma conta encontrada para &quot;{busca}&quot;.</p>
      )}

      {infoOpen && (
        <div
          className={
            contabil
              ? 'fixed inset-0 z-[220] flex items-center justify-center p-4 bg-brand-text/40'
              : 'fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/70'
          }
          onClick={() => setInfoOpen(false)}
        >
          <div
            className={
              contabil
                ? 'w-full max-w-xl technical-panel shadow-[8px_8px_0_0_#141414] bg-brand-bg'
                : 'w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900'
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={
                contabil
                  ? 'px-4 py-3 border-b border-brand-border flex items-start justify-between gap-2 bg-brand-sidebar/30'
                  : 'px-4 py-3 border-b border-slate-700 flex items-start justify-between gap-2'
              }
            >
              <h3 className={contabil ? 'text-[10px] font-black uppercase tracking-widest' : 'text-sm font-bold'}>
                {titulo} — como a automação usa
              </h3>
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                className={
                  contabil
                    ? 'p-1 border border-brand-border hover:bg-brand-border hover:text-brand-bg'
                    : 'px-2 text-slate-400 hover:text-white'
                }
                aria-label="Fechar explicação"
              >
                {contabil ? <X size={14} /> : '×'}
              </button>
            </div>
            <div className={contabil ? 'p-4 space-y-2' : 'p-4 space-y-2 text-slate-200'}>
              {info.split('\n').map((line, i) => {
                const t = line.trim();
                if (!t) return <div key={i} className="h-2" />;
                if (t.endsWith(':')) {
                  return (
                    <p key={i} className={contabil ? 'text-[10px] font-black uppercase tracking-wide' : 'text-xs font-bold uppercase'}>
                      {t}
                    </p>
                  );
                }
                if (t.startsWith('• ')) {
                  return (
                    <p key={i} className={contabil ? 'text-[10px] pl-3 border-l-2 border-brand-border/30' : 'text-xs pl-3 border-l-2 border-slate-600'}>
                      {t.slice(2)}
                    </p>
                  );
                }
                return <p key={i} className={contabil ? 'text-[10px]' : 'text-xs'}>{t}</p>;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ColigadaEmprestimoEditor({
  item,
  empresas,
  planoRows,
  contabil,
  onChange,
  onRemove,
}: {
  item: AutomacaoEmprestimoColigada;
  empresas: string[];
  planoRows: VisionPlanoRow[];
  contabil: boolean;
  onChange: (patch: Partial<AutomacaoEmprestimoColigada>) => void;
  onRemove: () => void;
}) {
  const [busca, setBusca] = useState('');
  const resultados = useMemo(() => buscarContasNoPlano(planoRows, busca, 20), [planoRows, busca]);

  const boxClass = contabil
    ? 'border border-brand-border/40 bg-white p-3 space-y-2'
    : 'rounded-lg border border-slate-700/80 bg-slate-950/40 p-2.5 space-y-2';

  const inputClass = contabil
    ? 'w-full px-2 py-1.5 bg-white border border-brand-border text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-brand-border'
    : 'w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs';

  const setLado = (lado: 'debito' | 'credito', v: AutomacaoContaVinculo | undefined) => {
    if (!v) {
      const next = { ...item };
      if (lado === 'debito') delete next.debito;
      else delete next.credito;
      onChange(next);
      return;
    }
    onChange(lado === 'debito' ? { debito: v } : { credito: v });
  };

  return (
    <div className={boxClass}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[180px]">
          <label className={contabil ? 'block text-[9px] font-bold uppercase opacity-50 mb-1' : 'sr-only'}>
            Empresa coligada
          </label>
          <select
            value={item.empresaColigada}
            onChange={(e) => onChange({ empresaColigada: e.target.value })}
            className={inputClass}
            aria-label="Empresa coligada"
          >
            <option value="">Selecione a empresa…</option>
            {empresas.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            {item.empresaColigada && !empresas.includes(item.empresaColigada) ? (
              <option value={item.empresaColigada}>{item.empresaColigada}</option>
            ) : null}
          </select>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className={
            contabil
              ? 'technical-button text-[10px] p-1.5 text-rose-700'
              : 'p-1.5 rounded border border-slate-600 text-rose-400'
          }
          title="Remover vínculo"
          aria-label="Remover empréstimo coligada"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <input
        type="text"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Pesquisar no plano — clique na conta e escolha D ou C"
        className={inputClass}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <VinculoLadoField
          lado="debito"
          tituloLado="Débito"
          hintLado="D — conta na empresa atual (ex.: mútuo a receber / coligada)"
          vinculo={item.debito}
          planoRows={planoRows}
          buscaGlobal={busca}
          resultadosBusca={resultados}
          onSelectPlano={(p, lado) => {
            setLado(lado, vinculoFromPlano(p));
            setBusca('');
          }}
          onApplyCodigo={(cod, lado) => {
            const t = cod.trim();
            if (!t) setLado(lado, undefined);
            else setLado(lado, vinculoFromCodigoManual(t, planoRows));
          }}
          onClear={(lado) => setLado(lado, undefined)}
          contabil={contabil}
        />
        <VinculoLadoField
          lado="credito"
          tituloLado="Crédito"
          hintLado="C — contrapartida (ex.: banco / caixa / mútuo a pagar)"
          vinculo={item.credito}
          planoRows={planoRows}
          buscaGlobal={busca}
          resultadosBusca={resultados}
          onSelectPlano={(p, lado) => {
            setLado(lado, vinculoFromPlano(p));
            setBusca('');
          }}
          onApplyCodigo={(cod, lado) => {
            const t = cod.trim();
            if (!t) setLado(lado, undefined);
            else setLado(lado, vinculoFromCodigoManual(t, planoRows));
          }}
          onClear={(lado) => setLado(lado, undefined)}
          contabil={contabil}
        />
      </div>
    </div>
  );
}

export function AutomatizacaoContaConfigModal({
  open,
  onClose,
  planoRows,
  empresaNome,
  onSaved,
  surface = 'contabilfacil',
}: Props) {
  const contabil = surface === 'contabilfacil';

  const [draft, setDraft] = useState<AutomacaoContaConfig>(() =>
    readAutomatizacaoContaConfig(empresaNome),
  );

  const reload = useCallback(() => {
    setDraft(readAutomatizacaoContaConfig(empresaNome));
  }, [empresaNome]);

  React.useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  const setPapel = (papel: AutomacaoContaPapel, cfg: AutomacaoContaPapelConfig | undefined) => {
    setDraft((prev) => {
      const next = { ...prev };
      if (cfg) next[papel] = cfg;
      else delete next[papel];
      return next;
    });
  };

  const empresasDisponiveis = useMemo(() => {
    const registry = loadCompaniesRegistry().map((c) => c.name);
    const ia = listAiColigadasParaIa(empresaNome).map((c) => normalizeCompanyName(c.nome));
    const atual = normalizeCompanyName(empresaNome);
    const set = new Set<string>();
    for (const n of [...registry, ...ia]) {
      if (n && n !== atual) set.add(n);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [empresaNome, open]);

  const coligadas = draft.emprestimoColigadas ?? [];

  const upsertColigada = (id: string, patch: Partial<AutomacaoEmprestimoColigada>) => {
    setDraft((prev) => {
      const list = [...(prev.emprestimoColigadas ?? [])];
      const idx = list.findIndex((c) => c.id === id);
      if (idx < 0) return prev;
      list[idx] = { ...list[idx], ...patch };
      return { ...prev, emprestimoColigadas: list };
    });
  };

  const addColigada = () => {
    setDraft((prev) => ({
      ...prev,
      emprestimoColigadas: [
        ...(prev.emprestimoColigadas ?? []),
        {
          id: newEmprestimoColigadaId(),
          empresaColigada: empresasDisponiveis[0] ?? '',
        },
      ],
    }));
  };

  const removeColigada = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      emprestimoColigadas: (prev.emprestimoColigadas ?? []).filter((c) => c.id !== id),
    }));
  };

  const setDataModo = (modo: AutomacaoDataModo) => {
    setDraft((prev) => ({ ...prev, dataModo: modo }));
  };

  const salvar = () => {
    saveAutomatizacaoContaConfig(empresaNome, draft);
    onSaved?.(draft);
    onClose();
  };

  if (!open) return null;

  const overlayClass = contabil
    ? 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-brand-text/40'
    : 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70';

  const shellClass = contabil
    ? 'w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col technical-panel shadow-[8px_8px_0_0_#141414]'
    : 'w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-violet-500/40 bg-slate-900 shadow-2xl';

  const headerClass = contabil
    ? 'px-4 py-3 border-b border-brand-border flex items-start justify-between gap-2 bg-brand-sidebar/40'
    : 'px-4 py-3 border-b border-slate-700 flex items-start justify-between gap-2';

  const titleClass = contabil
    ? 'text-[10px] font-black uppercase tracking-widest text-brand-text'
    : 'text-sm font-black text-violet-200 uppercase tracking-wide';

  const subtitleClass = contabil
    ? 'text-[9px] font-bold uppercase opacity-50 mt-1'
    : 'text-[10px] text-slate-400 mt-1';

  const bodyClass = contabil
    ? 'flex-1 overflow-y-auto p-4 space-y-4 bg-brand-bg'
    : 'flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3';

  const footerClass = contabil
    ? 'px-4 py-3 border-t border-brand-border flex flex-wrap gap-2 justify-end bg-brand-sidebar/30'
    : 'px-4 py-3 border-t border-slate-700 flex flex-wrap gap-2 justify-end';

  const sectionClass = contabil
    ? 'technical-panel p-4 bg-brand-sidebar/15 space-y-3'
    : 'rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-2';

  const labelTitle = contabil
    ? 'text-[10px] font-black uppercase tracking-widest text-brand-text'
    : 'text-[11px] font-bold text-violet-200';

  const labelHint = contabil
    ? 'text-[9px] font-bold uppercase opacity-50 leading-snug'
    : 'text-[10px] text-slate-500 leading-snug';

  const inputClass = contabil
    ? 'w-full px-2 py-1.5 bg-white border border-brand-border text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-brand-border'
    : 'w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs';

  const dataModo = draft.dataModo ?? 'ultimo_dia_mes';

  return (
    <div
      className={overlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby="automacao-config-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={shellClass} onClick={(e) => e.stopPropagation()}>
        <div className={headerClass}>
          <div>
            <h2 id="automacao-config-title" className={titleClass}>
              Configuração de automação
            </h2>
            <p className={subtitleClass}>
              Empresa: {empresaNome.trim() || 'Padrão'} · D e C nos blocos abaixo. Caixa e despesa de ajuste são
              identificados automaticamente no plano.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={
              contabil
                ? 'p-1 border border-brand-border hover:bg-brand-border hover:text-brand-bg transition-colors'
                : 'text-slate-400 hover:text-white text-lg leading-none px-2'
            }
            aria-label="Fechar"
          >
            {contabil ? <X size={16} strokeWidth={2.5} /> : '×'}
          </button>
        </div>
        <div className={bodyClass}>
          <div className={sectionClass}>
            <p className={labelTitle}>Data dos lançamentos</p>
            <p className={labelHint}>
              Define a data dos lançamentos gerados pela automação (garantida, clientes, mútuo, custos).
              Não se aplica a empréstimo entre coligadas — nessas a data vem do lançamento bancário.
            </p>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-[10px] font-bold uppercase">
                <input
                  type="radio"
                  name="data-modo-automacao"
                  checked={dataModo === 'ultimo_dia_mes'}
                  onChange={() => setDataModo('ultimo_dia_mes')}
                />
                Último dia do mês (padrão)
              </label>
              <label className="flex items-center gap-2 text-[10px] font-bold uppercase">
                <input
                  type="radio"
                  name="data-modo-automacao"
                  checked={dataModo === 'data_do_dia'}
                  onChange={() => setDataModo('data_do_dia')}
                />
                Data do dia (hoje)
              </label>
              <label className="flex items-center gap-2 text-[10px] font-bold uppercase">
                <input
                  type="radio"
                  name="data-modo-automacao"
                  checked={dataModo === 'data_fixixa'}
                  onChange={() => setDataModo('data_fixixa')}
                />
                Data fixa
              </label>
              {dataModo === 'data_fixixa' && (
                <input
                  type="text"
                  value={draft.dataFixa ?? ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, dataFixa: e.target.value }))}
                  placeholder="DD/MM/AAAA"
                  className={inputClass}
                  aria-label="Data fixa dos lançamentos"
                />
              )}
            </div>
          </div>

          {PAPEIS_AUTOMACAO_UI.map((p) => (
            <PapelEditor
              key={p.id}
              papel={p.id}
              titulo={p.titulo}
              hint={p.hint}
              debHint={p.debHint}
              credHint={p.credHint}
              info={p.info}
              config={draft[p.id]}
              planoRows={planoRows}
              onChange={setPapel}
              contabil={contabil}
            />
          ))}

          <div className={sectionClass}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className={labelTitle}>Empréstimo entre coligadas</p>
                <p className={labelHint}>
                  Escolha a empresa coligada já cadastrada e informe D e C. O sistema confere se bate com a
                  outra empresa; se não bater, busca o lançamento correspondente. A data vem do próprio
                  lançamento do banco (não usa a opção de data acima).
                </p>
              </div>
              <button
                type="button"
                onClick={addColigada}
                className={
                  contabil
                    ? 'technical-button text-[10px] inline-flex items-center gap-1'
                    : 'px-2 py-1 rounded-lg border border-slate-600 text-slate-300 text-[10px] uppercase inline-flex items-center gap-1'
                }
              >
                <Plus size={12} />
                Adicionar
              </button>
            </div>

            {empresasDisponiveis.length === 0 && (
              <p className="text-[9px] opacity-60">
                Nenhuma outra empresa no sistema. Cadastre a coligada no ContábilFácil ou na Inteligência IA.
              </p>
            )}

            {coligadas.map((item) => (
              <ColigadaEmprestimoEditor
                key={item.id}
                item={item}
                empresas={empresasDisponiveis}
                planoRows={planoRows}
                contabil={contabil}
                onChange={(patch) => upsertColigada(item.id, patch)}
                onRemove={() => removeColigada(item.id)}
              />
            ))}
          </div>
        </div>
        <div className={footerClass}>
          <button
            type="button"
            onClick={onClose}
            className={contabil ? 'technical-button text-[10px]' : 'px-4 py-2 rounded-lg border border-slate-600 text-slate-300 text-[11px] font-bold uppercase'}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            className={contabil ? 'technical-button-primary text-[10px] px-6' : 'px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-black uppercase'}
          >
            Salvar contas
          </button>
        </div>
      </div>
    </div>
  );
}
