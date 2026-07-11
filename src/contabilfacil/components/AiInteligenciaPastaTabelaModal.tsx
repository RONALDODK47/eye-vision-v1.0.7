import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Table2, X } from 'lucide-react';
import {
  PASTA_LABELS,
  loadAiInteligenciaAsync,
  type AiInteligenciaDoc,
  type AiInteligenciaPasta,
  type AiInteligenciaPastaConfig,
  type AiInteligenciaStore,
} from '../logic/aiInteligenciaStorage';
import {
  buildPastaGrupoTableRows,
  buildPastaTableRows,
  getPastaGrupoTableColumns,
  getPastaTableColumns,
  type PastaTableRow,
} from '../logic/aiInteligenciaPastaTable';
import { buildPastasGruposContasParaIa } from '../logic/aiInteligenciaPastaGrupos';
import { extrairDadosPastaInteligenciaIa } from '../logic/aiInteligenciaPastaExtract';

export type AiInteligenciaPastaTabelaModalProps = {
  open: boolean;
  company: string;
  pasta: AiInteligenciaPasta | null;
  docs: AiInteligenciaDoc[];
  pastaConfig?: AiInteligenciaPastaConfig;
  onClose: () => void;
  onStoreRefresh?: (store: AiInteligenciaStore) => void;
};

export default memo(function AiInteligenciaPastaTabelaModal({
  open,
  company,
  pasta,
  docs,
  pastaConfig,
  onClose,
  onStoreRefresh,
}: AiInteligenciaPastaTabelaModalProps) {
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [hydratedDocs, setHydratedDocs] = useState<AiInteligenciaDoc[]>(docs);
  const [storeExtras, setStoreExtras] = useState<{
    coligadas: AiInteligenciaStore['coligadas'];
    socios: AiInteligenciaStore['socios'];
  }>({ coligadas: [], socios: [] });

  const reloadDocs = useCallback(async () => {
    if (!pasta) return;
    setLoading(true);
    const store = await loadAiInteligenciaAsync(company);
    const byId = new Map(store.docs.map((d) => [d.id, d]));
    setHydratedDocs(docs.map((d) => byId.get(d.id) ?? d));
    setStoreExtras({ coligadas: store.coligadas, socios: store.socios ?? [] });
    setLoading(false);
    return store;
  }, [company, docs, pasta]);

  useEffect(() => {
    if (!open || !pasta) return;
    setHydratedDocs(docs);
    setStatusMsg('');
    let cancelled = false;
    void (async () => {
      await reloadDocs();
      if (cancelled) return;
      try {
        const result = await extrairDadosPastaInteligenciaIa(company, pasta);
        if (cancelled) return;
        onStoreRefresh?.(result.store);
        const byId = new Map(result.store.docs.map((d) => [d.id, d]));
        setHydratedDocs(docs.map((d) => byId.get(d.id) ?? d));
        setStoreExtras({
          coligadas: result.store.coligadas,
          socios: result.store.socios ?? [],
        });
        if (result.message && result.message !== 'Nada a extrair.') {
          setStatusMsg(result.message);
        }
      } catch (err) {
        if (!cancelled) {
          setStatusMsg(err instanceof Error ? err.message : 'Falha na extração automática');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, pasta, docs, company, reloadDocs, onStoreRefresh]);

  const columns = useMemo(
    () => (pasta ? getPastaTableColumns(pasta) : []),
    [pasta],
  );
  const grupoColumns = useMemo(() => getPastaGrupoTableColumns(), []);

  const grupoRows: PastaTableRow[] = useMemo(
    () => buildPastaGrupoTableRows(pastaConfig),
    [pastaConfig],
  );

  const rows: PastaTableRow[] = useMemo(() => {
    if (!pasta) return [];
    return buildPastaTableRows(pasta, hydratedDocs, storeExtras);
  }, [pasta, hydratedDocs, storeExtras]);

  const analiticasPreview = useMemo(() => {
    if (!pasta || !pastaConfig) return '';
    return buildPastasGruposContasParaIa(company, { [pasta]: pastaConfig });
  }, [company, pasta, pastaConfig]);

  if (!open || !pasta) return null;

  const temConteudo = grupoRows.length > 0 || rows.length > 0;

  return (
    <div className="fixed inset-0 z-[83] flex items-center justify-center p-3 bg-black/55">
      <div
        className="technical-panel shadow-[6px_6px_0_0_#141414] w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-labelledby="ai-pasta-tabela-title"
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-brand-border bg-brand-sidebar/40 shrink-0">
          <div className="min-w-0">
            <h2
              id="ai-pasta-tabela-title"
              className="text-sm font-black uppercase tracking-widest inline-flex items-center gap-2"
            >
              <Table2 size={16} aria-hidden="true" />
              Dados extraídos — {PASTA_LABELS[pasta]}
            </h2>
            <p className="text-[9px] text-slate-600 mt-0.5">
              A IA processa os documentos automaticamente ao abrir esta tabela.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-red-600"
            aria-label="Fechar tabela"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-3 space-y-4">
          {statusMsg ? (
            <p className="text-[9px] font-bold uppercase text-green-800">{statusMsg}</p>
          ) : null}
          {loading ? (
            <p className="text-[10px] font-bold uppercase text-brand-text/60">Carregando textos…</p>
          ) : !temConteudo ? (
            <p className="text-[10px] text-brand-text/60 leading-relaxed">
              Configure os grupos de contas (entrada/saída) ou envie documentos — a extração é automática.
            </p>
          ) : (
            <>
              {grupoRows.length > 0 ? (
                <section>
                  <p className="text-[9px] font-black uppercase tracking-wide mb-1.5">
                    Grupos de contas configurados
                  </p>
                  <table className="w-full text-[9px] font-mono border-collapse mb-2">
                    <thead>
                      <tr className="border-b border-brand-border bg-brand-sidebar/30">
                        {grupoColumns.map((col) => (
                          <th
                            key={col.key}
                            className="text-left px-2 py-1.5 font-black uppercase tracking-wide whitespace-nowrap"
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grupoRows.map((row, idx) => (
                        <tr key={idx} className="border-b border-brand-border/20">
                          {grupoColumns.map((col) => (
                            <td key={col.key} className="px-2 py-1 align-top">
                              {row[col.key] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {analiticasPreview ? (
                    <pre className="text-[8px] font-mono whitespace-pre-wrap bg-brand-sidebar/10 border border-brand-border/30 p-2 max-h-40 overflow-auto">
                      {analiticasPreview}
                    </pre>
                  ) : null}
                </section>
              ) : null}

              {rows.length > 0 ? (
                <section>
                  <p className="text-[9px] font-black uppercase tracking-wide mb-1.5">
                    Dados extraídos dos documentos
                  </p>
                  <table className="w-full text-[9px] font-mono border-collapse">
                    <thead>
                      <tr className="border-b border-brand-border bg-brand-sidebar/30">
                        {columns.map((col) => (
                          <th
                            key={col.key}
                            className="text-left px-2 py-1.5 font-black uppercase tracking-wide whitespace-nowrap"
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => (
                        <tr key={idx} className="border-b border-brand-border/20 hover:bg-brand-sidebar/10">
                          {columns.map((col) => (
                            <td key={col.key} className="px-2 py-1 align-top break-words max-w-[14rem]">
                              {row[col.key] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ) : null}
            </>
          )}
        </div>

        <div className="p-3 border-t border-brand-border flex justify-between items-center shrink-0">
          <span className="text-[9px] font-mono opacity-60">
            {grupoRows.length} grupo(s) · {rows.length} linha(s) · {docs.length} documento(s)
          </span>
          <button type="button" onClick={onClose} className="technical-button text-[10px] py-1 px-3">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
});
