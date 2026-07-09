/**
 * Pastas de documentos de inteligência da IA.
 * Só pastas + arquivos salvos — cada upload grava de forma independente.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brain, FolderOpen, Trash2, X } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  PASTA_LABELS,
  addAiInteligenciaDocs,
  extractColigadasFromTexto,
  inferPastaFromFileName,
  loadAiInteligencia,
  loadAiInteligenciaAsync,
  persistAiInteligenciaToFolder,
  removeAiInteligenciaDoc,
  saveAiInteligencia,
  upsertAiColigada,
  upsertColigadasFromExtract,
  type AiInteligenciaDoc,
  type AiInteligenciaPasta,
  type AiInteligenciaStore,
} from '../logic/aiInteligenciaStorage';
import { prepareAnexoForRegrasAi } from '../../lib/aiRegrasAnexos';
import {
  getLocalFolderDbMeta,
  isLocalFolderDbConfigured,
} from '../../lib/localFolderDatabase';

export type AiInteligenciaPastasModalProps = {
  open: boolean;
  company: string;
  onClose: () => void;
  onChanged?: (store: AiInteligenciaStore) => void;
};

const ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.xlsx,.xls,.csv,application/pdf,image/*,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const PASTAS: AiInteligenciaPasta[] = ['coligadas', 'contratos', 'balancetes', 'outros'];

export default memo(function AiInteligenciaPastasModal({
  open,
  company,
  onClose,
  onChanged,
}: AiInteligenciaPastasModalProps) {
  const [store, setStore] = useState<AiInteligenciaStore>(() => loadAiInteligencia(company));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [folderLabel, setFolderLabel] = useState(() => getLocalFolderDbMeta()?.folderLabel || '');
  const uploadPastaRef = useRef<AiInteligenciaPasta | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStore(loadAiInteligencia(company));
    setError('');
    setOkMsg('');
    setFolderLabel(getLocalFolderDbMeta()?.folderLabel || '');
    let cancelled = false;
    void loadAiInteligenciaAsync(company).then((s) => {
      if (cancelled) return;
      // Não sobrescreve se o usuário já adicionou arquivos nesta abertura
      setStore((prev) => (prev.docs.length > s.docs.length ? prev : s));
    });
    return () => {
      cancelled = true;
    };
  }, [open, company]);

  const docsByPasta = useMemo(() => {
    const map: Record<AiInteligenciaPasta, AiInteligenciaDoc[]> = {
      coligadas: [],
      contratos: [],
      balancetes: [],
      outros: [],
    };
    for (const d of store.docs) map[d.pasta].push(d);
    return map;
  }, [store.docs]);

  const refresh = useCallback(
    (next: AiInteligenciaStore) => {
      setStore(next);
      onChanged?.(next);
    },
    [onChanged],
  );

  const openPicker = useCallback((pasta?: AiInteligenciaPasta) => {
    uploadPastaRef.current = pasta ?? null;
    // Reseta o input para permitir escolher o mesmo arquivo de novo
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, []);

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      if (!company?.trim()) {
        setError('Empresa não identificada — abra o módulo CONTABIL com uma empresa selecionada.');
        return;
      }
      const pastaForce = uploadPastaRef.current;
      setBusy(true);
      setError('');
      setOkMsg('');

      // 1) Grava na hora (nome/pasta/tamanho) — não depende de OCR/PDF
      const quickDocs: Array<Omit<AiInteligenciaDoc, 'id' | 'uploadedAt'>> = Array.from(files).map(
        (file) => ({
          nome: file.name,
          pasta: pastaForce || inferPastaFromFileName(file.name),
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          textoExtraido: `[arquivo] ${file.name}`,
        }),
      );

        try {
          const beforeCount = loadAiInteligencia(company).docs.length;
          let next = addAiInteligenciaDocs(company, quickDocs);
          // Atualiza UI imediatamente — o contador sai de (0)
          refresh(next);

          // 2) Em background: tenta extrair texto e enriquecer (sem apagar o doc se falhar)
          const allExtracted: Array<{ nome: string; aliases: string[] }> = [];
          const failed: string[] = [];
          const enriched: Array<Omit<AiInteligenciaDoc, 'id' | 'uploadedAt'>> = [];

          for (const file of Array.from(files)) {
            const pasta = pastaForce || inferPastaFromFileName(file.name);
            let texto = `[arquivo] ${file.name}`;
            try {
              const prepared = await prepareAnexoForRegrasAi(file, { maxPdfPages: 3 });
              if (prepared.text?.trim()) {
                texto = prepared.text;
                allExtracted.push(...extractColigadasFromTexto(prepared.text));
              }
            } catch {
              failed.push(file.name);
            }
            enriched.push({
              nome: file.name,
              pasta,
              mimeType: file.type || 'application/octet-stream',
              size: file.size,
              textoExtraido: texto,
            });
          }

          if (enriched.some((d) => d.textoExtraido && !d.textoExtraido.startsWith('[arquivo]'))) {
            const current = loadAiInteligencia(company);
            const byKey = new Map(
              enriched.map((d) => [`${d.pasta}::${d.nome}::${d.size}`, d.textoExtraido] as const),
            );
            const docsUpdated = current.docs.map((d) => {
              const t = byKey.get(`${d.pasta}::${d.nome}::${d.size}`);
              return t && t !== d.textoExtraido ? { ...d, textoExtraido: t } : d;
            });
            next = saveAiInteligencia(company, { ...current, docs: docsUpdated });
          }

          if (allExtracted.length > 0) {
            next = upsertColigadasFromExtract(company, allExtracted);
          }
          const joined = enriched.map((d) => d.textoExtraido).join('\n');
          if (/\bA[\s.]*J[\s.]*T[\s.]*F\b/i.test(joined) || /\bAJTF\b/i.test(joined)) {
            next = upsertAiColigada(company, {
              nome: 'AJTF',
              aliases: ['AJTF', 'A.J.T.F', 'A J T F', 'A. J. T. F', 'A.J.T.F.'],
              notas: 'Empresa coligada — NÃO é cliente',
            });
          }

          // Flush obrigatório na pasta CONFIGURAR (eye-vision-dados.json)
          const folderResult = await persistAiInteligenciaToFolder(company, next);
          if (folderResult.folderLabel) setFolderLabel(folderResult.folderLabel);

          refresh(next);
          const added = Math.max(0, next.docs.length - beforeCount);
          const byPasta = quickDocs.reduce(
            (acc, d) => {
              acc[d.pasta] = (acc[d.pasta] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          );
          const pastaSummary = Object.entries(byPasta)
            .map(([p, n]) => `${PASTA_LABELS[p as AiInteligenciaPasta] || p}: ${n}`)
            .join(' · ');

          if (added === 0 && quickDocs.length > 0) {
            setOkMsg(
              `Arquivo(s) já estavam salvos (${pastaSummary}). Total: ${next.docs.length} doc(s).`,
            );
          } else if (folderResult.ok) {
            setOkMsg(
              `Salvo na pasta «${folderResult.folderLabel || folderLabel || 'dados'}»: ${added || quickDocs.length} arquivo(s) · ${pastaSummary}`,
            );
          } else {
            setOkMsg(`Salvo no navegador: ${added || quickDocs.length} arquivo(s) · ${pastaSummary}`);
            setError(
              folderResult.error ||
                'Configure a pasta em CONFIGURAR e clique SALVAR para gravar no disco.',
            );
          }
          if (failed.length > 0) {
            setError(
              `Salvos mesmo assim. Texto não extraído de: ${failed.join(', ')} (arquivo permanece na pasta).`,
            );
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Falha ao gravar documentos');
        } finally {
          setBusy(false);
          uploadPastaRef.current = null;
        }
    },
    [company, refresh],
  );

  const handleRemoveDoc = useCallback(
    (id: string) => {
      const next = removeAiInteligenciaDoc(company, id);
      refresh(next);
      void persistAiInteligenciaToFolder(company, next);
      setOkMsg('Documento removido.');
    },
    [company, refresh],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[82] flex items-center justify-center p-3 bg-black/50">
      <div
        className="technical-panel shadow-[6px_6px_0_0_#141414] w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-labelledby="ai-inteligencia-title"
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-brand-border bg-brand-sidebar/40 shrink-0">
          <div className="min-w-0">
            <h2
              id="ai-inteligencia-title"
              className="text-sm font-black uppercase tracking-widest inline-flex items-center gap-2"
            >
              <Brain size={16} aria-hidden="true" />
              Inteligência da IA
            </h2>
            <p className="text-[9px] text-slate-600 mt-0.5 leading-snug">
              Pastas com documentos salvos para a IA. Grava em{' '}
              <code className="text-[8px]">eye-vision-dados.json</code>
              {folderLabel || isLocalFolderDbConfigured() ? (
                <>
                  {' '}
                  na pasta <strong>«{folderLabel || getLocalFolderDbMeta()?.folderLabel}»</strong>
                </>
              ) : (
                <>
                  {' '}
                  — use <strong>CONFIGURAR</strong> + <strong>SALVAR</strong> no seletor de módulos
                </>
              )}
              .
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-red-600"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Um único input — evita bug de vários inputs file no mesmo modal */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          disabled={busy}
          aria-label="Selecionar documentos para Inteligência da IA"
          title="Selecionar documentos"
          onChange={(e) => {
            void handleUpload(e.target.files);
            e.target.value = '';
          }}
        />

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {error ? <p className="text-[9px] text-rose-700 font-bold uppercase">{error}</p> : null}
          {okMsg ? <p className="text-[9px] text-green-800 font-bold uppercase">{okMsg}</p> : null}

          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] font-black uppercase tracking-wider">
              Pastas · {store.docs.length} doc(s)
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => openPicker()}
              className="technical-button text-[9px] py-1 px-2 inline-flex items-center gap-1 disabled:opacity-40"
            >
              <FolderOpen size={12} />
              {busy ? 'Salvando…' : 'Enviar documentos'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PASTAS.map((pasta) => (
              <div
                key={pasta}
                className="border border-brand-border bg-brand-sidebar/10 p-2 min-h-[140px] flex flex-col"
              >
                <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
                  <p className="text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                    <FolderOpen size={12} />
                    {PASTA_LABELS[pasta]}
                    <span className="opacity-50">({docsByPasta[pasta].length})</span>
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openPicker(pasta)}
                    className="text-[8px] font-bold uppercase underline opacity-70 hover:opacity-100 disabled:opacity-40"
                  >
                    + arquivo
                  </button>
                </div>
                {docsByPasta[pasta].length === 0 ? (
                  <p className="text-[8px] text-brand-text/40 italic flex-1">
                    Vazia — clique em + arquivo para salvar documentos aqui
                  </p>
                ) : (
                  <ul className="space-y-1 flex-1 overflow-y-auto">
                    {docsByPasta[pasta].map((d) => (
                      <li
                        key={d.id}
                        className={cn(
                          'flex items-center justify-between gap-1 text-[8px] font-mono',
                          'border border-brand-border/30 bg-white px-1.5 py-1',
                        )}
                      >
                        <span className="truncate" title={d.nome}>
                          {d.nome}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDoc(d.id)}
                          className="shrink-0 text-rose-700 hover:underline"
                          aria-label={`Remover ${d.nome}`}
                          title={`Remover ${d.nome}`}
                        >
                          <Trash2 size={10} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 border-t border-brand-border flex justify-end shrink-0">
          <button type="button" onClick={onClose} className="technical-button text-[10px] py-1 px-3">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
});
