/**
 * Pastas de extratos conciliados — agrupados por conta banco.
 * Selecionar um extrato restaura lançamentos e ativa o banco (regras).
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FolderOpen, Trash2, X } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  countExtratoPastas,
  downloadExtratoPastaPdf,
  getExtratoPastaById,
  groupExtratoPastasPorBanco,
  listExtratoPastas,
  removeExtratoDaPasta,
  syncExtratoPastasFromServer,
  type ExtratoPastaItem,
} from '../logic/extratoPastasStorage';

export type ExtratoPastasModalProps = {
  open: boolean;
  company: string;
  /** Conta banco ativa (destaque). */
  contaBancoAtiva?: string;
  onClose: () => void;
  /** Usuário escolheu um extrato salvo → carregar na conciliação. */
  onSelect: (item: ExtratoPastaItem) => void;
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default memo(function ExtratoPastasModal({
  open,
  company,
  contaBancoAtiva = '',
  onClose,
  onSelect,
}: ExtratoPastasModalProps) {
  const [items, setItems] = useState<ExtratoPastaItem[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    setItems(listExtratoPastas(company));
    void syncExtratoPastasFromServer(company)
      .then((remote) => setItems(remote))
      .catch(() => {
        /* mantém LS se servidor offline */
      });
  }, [company]);

  useEffect(() => {
    if (!open) return;
    reload();
    setMsg('');
    setError('');
  }, [open, reload]);

  const groups = useMemo(() => groupExtratoPastasPorBanco(items), [items]);
  const total = items.length;

  const handleSelect = (id: string) => {
    const item = getExtratoPastaById(company, id);
    if (!item) {
      setError('Extrato não encontrado.');
      return;
    }
    onSelect(item);
    onClose();
  };

  const handleRemove = (id: string) => {
    if (!window.confirm('Remover este extrato da pasta?')) return;
    setItems(removeExtratoDaPasta(company, id));
    setMsg('Extrato removido da pasta.');
  };

  const handleDownloadPdf = (item: ExtratoPastaItem) => {
    try {
      downloadExtratoPastaPdf(item);
      setMsg('PDF baixado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao baixar PDF.');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[82] flex items-center justify-center p-4 bg-black/40">
      <div
        className="technical-panel bg-brand-bg w-full max-w-3xl max-h-[85vh] flex flex-col shadow-[6px_6px_0_0_#141414]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="extrato-pastas-title"
      >
        <div className="px-4 py-3 border-b border-brand-border flex items-center gap-2 shrink-0 bg-brand-sidebar/30">
          <FolderOpen size={16} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2
              id="extrato-pastas-title"
              className="text-[11px] font-black uppercase tracking-wider"
            >
              Pastas de extratos
            </h2>
            <p className="text-[9px] text-brand-text/55">
              {total} extrato(s) salvos · cada um ligado à conta banco (regras)
              {contaBancoAtiva ? ` · ativo: ${contaBancoAtiva}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="technical-button p-1.5"
            title="Fechar"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {error ? (
            <p className="text-[9px] font-bold uppercase text-red-700">{error}</p>
          ) : null}
          {msg ? (
            <p className="text-[9px] font-bold uppercase text-green-800">{msg}</p>
          ) : null}

          {groups.length === 0 ? (
            <p className="text-[10px] text-brand-text/60 leading-snug p-4 border border-dashed border-brand-border">
              Nenhum extrato salvo ainda. Na conciliação, use{' '}
              <strong>SALVAR EXTRATO</strong> para guardar o PDF conciliado ligado à
              conta banco. Depois selecione aqui para reabrir e puxar as regras desse
              banco.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.contaBanco} className="border border-brand-border bg-white">
                <div className="px-3 py-2 border-b border-brand-border bg-brand-sidebar/20 flex items-center gap-2">
                  <FolderOpen size={13} className="shrink-0 opacity-70" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase truncate">
                      {g.bancoNome || 'Banco'} · conta {g.contaBanco}
                    </p>
                    <p className="text-[8px] text-brand-text/50 uppercase">
                      {g.items.length} extrato(s)
                    </p>
                  </div>
                </div>
                <ul className="divide-y divide-brand-border/60">
                  {g.items.map((it) => (
                    <li
                      key={it.id}
                      className={cn(
                        'px-3 py-2 flex flex-wrap items-center gap-2',
                        contaBancoAtiva &&
                          contaBancoAtiva.replace(/\D/g, '') ===
                            it.contaBanco.replace(/\D/g, '')
                          ? 'bg-amber-50/60'
                          : '',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase truncate">{it.label}</p>
                        <p className="text-[8px] text-brand-text/55">
                          {fmtWhen(it.createdAt)} · {it.total} lanç. ·{' '}
                          {it.conciliadas} conciliadas
                          {it.pdfBase64 ? ' · PDF salvo' : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelect(it.id)}
                        className="technical-button-primary text-[9px] py-1 px-2 uppercase font-black"
                        title="Abrir este extrato e ativar regras do banco"
                      >
                        Selecionar
                      </button>
                      {it.pdfBase64 ? (
                        <button
                          type="button"
                          onClick={() => handleDownloadPdf(it)}
                          className="technical-button text-[9px] py-1 px-2 inline-flex items-center gap-1"
                          title="Baixar PDF conciliado salvo"
                        >
                          <Download size={11} aria-hidden="true" />
                          PDF
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleRemove(it.id)}
                        className="technical-button text-[9px] py-1 px-2 inline-flex items-center gap-1"
                        title="Remover da pasta"
                      >
                        <Trash2 size={11} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-brand-border flex justify-between items-center gap-2 shrink-0 bg-brand-bg">
          <p className="text-[8px] text-brand-text/45 uppercase">
            {countExtratoPastas(company)} na pasta · máx. 40 por empresa
          </p>
          <button type="button" onClick={onClose} className="technical-button text-[10px] py-1 px-3">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
});
