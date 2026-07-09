import { useCallback, useEffect, useMemo, useState } from 'react';
import { Columns, FolderOpen, Save, Sliders, Trash2 } from 'lucide-react';
import type { OcrConfirmMeta } from '../../lib/aiExtratoExtractClient';
import type { GenericOcrRow } from '../../lib/parcelamentoColunasExtract';
import type { ParcelamentoPlanilhaImport } from '../../lib/parcelamentoPlanilha';
import { readPersistedLocalStorageJson, writePersistedLocalStorageJson } from '../../lib/persistentLocalStorage';
import {
  buildDefaultColumnMapping,
  extratoLegacyColumnMapping,
  getMappableCampoDefs,
  toLeitorColumnDefs,
} from '../../lib/leitorRecortador/columnDefaults';
import { detectRowsFromText, extractGenericDataFromCanvas } from '../../lib/leitorRecortador/cropper';
import {
  buildFaixaPorPagina,
  mappingToGenericColumns,
  mappingToNorm,
  normToMapping,
} from '../../lib/leitorRecortador/layoutBridge';
import {
  genericToExtratoRow,
  mapGenericRowsToOcrRows,
  mapGenericRowsToParcelamento,
} from '../../lib/leitorRecortador/rowMappers';
import { parseAndRenderAllPDFPages, parseAndRenderImage } from '../../lib/leitorRecortador/pdfParser';
import type { ColumnMapping, GenericExtractedRow, LeitorColumnDef, RenderedPDFPage } from '../../lib/leitorRecortador/types';
import { companyStorageSlug } from '../logic/companyWorkspace';
import type { DataIngestionType, OcrColunaCampoDef } from '../logic/ocrColunasConfig';
import {
  deleteExtratoOcrLayout,
  getActiveExtratoOcrLayout,
  listExtratoOcrLayouts,
  saveExtratoOcrLayout,
  setActiveExtratoOcrLayout,
  saveExtratoBancoParaImportacao,
  type ExtratoOcrLayoutSaved,
} from '../logic/extratoOcrLayoutStorage';
import ExtratoContaPicker, { type ExtratoPlanoContaOption } from './ExtratoContaPicker';
import { GenericLeitorTable } from './leitorRecortador/GenericLeitorTable';
import { GenericLeitorWorkspace } from './leitorRecortador/GenericLeitorWorkspace';

const DEFAULT_EXCLUSION_RULES = [
  'SALDO ANTERIOR',
  'SALDO DO DIA',
  'SALDO ATUAL',
  'SALDO FINAL',
  'SALDO TOTAL DISPONÍVEL DIA',
];

type Props = {
  file: File;
  dataType: DataIngestionType;
  title: string;
  confirmLabel: string;
  campoDefs: OcrColunaCampoDef[];
  dataColIds: string[];
  companyName?: string;
  planoContaOptions?: ExtratoPlanoContaOption[];
  onCancel: () => void;
  onConfirm: (rows: GenericOcrRow[], meta?: OcrConfirmMeta) => void;
  onConfirmParcelamento?: (data: ParcelamentoPlanilhaImport) => void;
};

function filterRowsByExclusion(
  rows: GenericExtractedRow[],
  columnDefs: LeitorColumnDef[],
  exclusionRules: string[],
): GenericExtractedRow[] {
  return rows.filter((row) => {
    const text = columnDefs.map((c) => row.fields[c.id] || '').join(' ').toUpperCase();
    return !exclusionRules.some((rule) => rule.trim() && text.includes(rule.trim().toUpperCase()));
  });
}

export function LeitorRecortadorModal({
  file,
  dataType,
  title,
  confirmLabel,
  campoDefs,
  dataColIds,
  companyName = '',
  planoContaOptions = [],
  onCancel,
  onConfirm,
  onConfirmParcelamento,
}: Props) {
  const isExtrato = dataType === 'extrato';
  const isInstallments = dataType === 'installments';

  const mappableCampoDefs = useMemo(() => getMappableCampoDefs(campoDefs, dataColIds), [campoDefs, dataColIds]);
  const columnIds = useMemo(() => mappableCampoDefs.map((c) => c.id), [mappableCampoDefs]);
  const columnDefs = useMemo<LeitorColumnDef[]>(
    () => toLeitorColumnDefs(campoDefs, dataColIds),
    [campoDefs, dataColIds],
  );

  const [pdfPages, setPdfPages] = useState<RenderedPDFPage[]>([]);
  const [activeCanvas, setActiveCanvas] = useState<HTMLCanvasElement | null>(null);
  const [textItems, setTextItems] = useState<RenderedPDFPage['textItems']>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [docType, setDocType] = useState<'pdf' | 'image'>('pdf');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [rows, setRows] = useState<GenericExtractedRow[]>([]);
  const [activeTab, setActiveTab] = useState<'align' | 'results'>('align');
  const [cropStartPct, setCropStartPct] = useState(10);
  const [cropEndPct, setCropEndPct] = useState(90);
  const [cropStartPage, setCropStartPage] = useState(1);
  const [cropEndPage, setCropEndPage] = useState(1);
  const [columns, setColumns] = useState<ColumnMapping>(() =>
    isExtrato ? extratoLegacyColumnMapping() : buildDefaultColumnMapping(columnIds),
  );
  const [rowMode, setRowMode] = useState<'auto' | 'manual'>('auto');
  const [gridStartY, setGridStartY] = useState(240);
  const [gridRowHeight, setGridRowHeight] = useState(35);
  const [gridRowCount, setGridRowCount] = useState(12);
  const [detectedRows, setDetectedRows] = useState<{ y: number; height: number }[]>([]);
  const [exclusionRules, setExclusionRules] = useState<string[]>(isExtrato ? DEFAULT_EXCLUSION_RULES : []);
  const [sideTab, setSideTab] = useState<'config' | 'layouts'>('config');
  const [bancoNome, setBancoNome] = useState('');
  const [contaBanco, setContaBanco] = useState(isExtrato ? '' : dataType);
  const [layoutEditId, setLayoutEditId] = useState<string | null>(null);
  const [savedLayouts, setSavedLayouts] = useState<ExtratoOcrLayoutSaved[]>([]);
  const [saldoAnterior, setSaldoAnterior] = useState(0);

  const saldoStorageKey = useMemo(
    () => (companyName.trim() ? `contabilfacil_${companyStorageSlug(companyName)}_extrato_saldo_anterior` : ''),
    [companyName],
  );

  const refreshSavedLayouts = useCallback(() => {
    if (!companyName.trim()) {
      setSavedLayouts([]);
      return;
    }
    setSavedLayouts(listExtratoOcrLayouts(companyName));
  }, [companyName]);

  useEffect(() => {
    refreshSavedLayouts();
    const active = companyName.trim() ? getActiveExtratoOcrLayout(companyName) : null;
    if (active) {
      setBancoNome(active.bancoNome);
      setContaBanco(active.contaBanco || (isExtrato ? '' : dataType));
      setLayoutEditId(active.id);
      if (active.columnsNorm?.length) {
        const restored = normToMapping(active.columnsNorm);
        if (restored) setColumns(restored);
      }
      if (isExtrato && active.ignoreLineWords?.trim()) {
        setExclusionRules(
          active.ignoreLineWords
            .split(/[,;\n]+/)
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }
    }
    if (isExtrato && saldoStorageKey) {
      const raw = readPersistedLocalStorageJson<string | number | null>(saldoStorageKey, null);
      if (raw != null) {
        const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
        if (Number.isFinite(n)) setSaldoAnterior(n);
      }
    }
  }, [companyName, dataType, isExtrato, refreshSavedLayouts, saldoStorageKey]);

  const runCropAll = useCallback(
    (
      pages: RenderedPDFPage[],
      cols: ColumnMapping,
      mode: 'auto' | 'manual',
      pageRange?: { start: number; end: number },
    ) => {
      const startPage = pageRange?.start ?? cropStartPage;
      const endPage = pageRange?.end ?? cropEndPage;
      let allRows: GenericExtractedRow[] = [];
      pages.forEach((page) => {
        if (page.pageNumber < startPage || page.pageNumber > endPage) return;
        const pageRows =
          mode === 'auto'
            ? detectRowsFromText(page.textItems, 10).map((r) => ({ y: r.y, height: r.height }))
            : Array.from({ length: gridRowCount }).map((_, i) => ({
                y: gridStartY + i * gridRowHeight,
                height: gridRowHeight,
              }));
        const startY = page.pageNumber === startPage ? (cropStartPct / 100) * page.height : 0;
        const endY = page.pageNumber === endPage ? (cropEndPct / 100) * page.height : page.height;
        const filtered = pageRows.filter((r) => {
          const center = r.y + r.height / 2;
          return center >= startY && center <= endY;
        });
        if (filtered.length === 0) return;
        const extracted = extractGenericDataFromCanvas(
          page.canvas,
          page.textItems,
          columnIds,
          cols,
          filtered,
          page.pageNumber,
        );
        allRows = [...allRows, ...extracted];
      });
      return allRows;
    },
    [columnIds, cropStartPage, cropEndPage, cropStartPct, cropEndPct, gridRowCount, gridStartY, gridRowHeight],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      setRows([]);
      setActiveTab('align');
      try {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          const pages = await parseAndRenderAllPDFPages(file);
          if (cancelled) return;
          if (pages.length === 0) throw new Error('Nenhuma página encontrada no PDF.');
          setPdfPages(pages);
          setDocType('pdf');
          setCurrentPage(1);
          setCropStartPage(1);
          setCropEndPage(pages.length);
          setActiveCanvas(pages[0]!.canvas);
          setTextItems(pages[0]!.textItems);
          setRowMode('auto');
          const autoRows = detectRowsFromText(pages[0]!.textItems, 10).map((r) => ({ y: r.y, height: r.height }));
          setDetectedRows(autoRows);
          const provisional = runCropAll(pages, columns, 'auto', { start: 1, end: pages.length });
          if (provisional.length > 0) {
            setRows(provisional);
            setSuccess(`${provisional.length} recorte(s) provisório(s) gerado(s). Ajuste as colunas se necessário.`);
          }
        } else {
          const page = await parseAndRenderImage(file);
          if (cancelled) return;
          setPdfPages([page]);
          setDocType('image');
          setCurrentPage(1);
          setCropStartPage(1);
          setCropEndPage(1);
          setActiveCanvas(page.canvas);
          setTextItems([]);
          setRowMode('manual');
          setGridStartY(Math.round(page.height * 0.25));
          setGridRowHeight(Math.round(page.height * 0.04) || 35);
          setGridRowCount(12);
          const manualRows = Array.from({ length: 12 }).map((_, i) => ({
            y: Math.round(page.height * 0.25) + i * (Math.round(page.height * 0.04) || 35),
            height: Math.round(page.height * 0.04) || 35,
          }));
          setDetectedRows(manualRows);
          const provisional = extractGenericDataFromCanvas(page.canvas, [], columnIds, columns, manualRows, 1);
          if (provisional.length > 0) {
            setRows(provisional);
            setSuccess(`${provisional.length} recorte(s) provisório(s) — ajuste a grade manual.`);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carrega uma vez por arquivo
  }, [file]);

  useEffect(() => {
    if (!activeCanvas) return;
    if (rowMode === 'auto') {
      const autoRows = detectRowsFromText(textItems, 10).map((r) => ({ y: r.y, height: r.height }));
      setDetectedRows(autoRows);
      return;
    }
    setDetectedRows(
      Array.from({ length: gridRowCount }).map((_, i) => ({
        y: gridStartY + i * gridRowHeight,
        height: gridRowHeight,
      })),
    );
  }, [activeCanvas, rowMode, textItems, gridStartY, gridRowHeight, gridRowCount]);

  const handlePageChange = (pageNumber: number) => {
    const page = pdfPages.find((p) => p.pageNumber === pageNumber);
    if (!page) return;
    setCurrentPage(pageNumber);
    setActiveCanvas(page.canvas);
    setTextItems(page.textItems);
    if (rowMode === 'auto') {
      setDetectedRows(detectRowsFromText(page.textItems, 10).map((r) => ({ y: r.y, height: r.height })));
    }
  };

  const handleApplyCrop = () => {
    if (!activeCanvas || detectedRows.length === 0) {
      setError('Nenhuma linha detectada para recortar.');
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      if (currentPage < cropStartPage || currentPage > cropEndPage) {
        setError(`Página ${currentPage} fora do intervalo ${cropStartPage}–${cropEndPage}.`);
        return;
      }
      const startY = currentPage === cropStartPage ? (cropStartPct / 100) * activeCanvas.height : 0;
      const endY = currentPage === cropEndPage ? (cropEndPct / 100) * activeCanvas.height : activeCanvas.height;
      const filtered = detectedRows.filter((r) => {
        const center = r.y + r.height / 2;
        return center >= startY && center <= endY;
      });
      if (filtered.length === 0) {
        setError('Nenhuma linha dentro dos delimitadores desta página.');
        return;
      }
      const extracted = extractGenericDataFromCanvas(
        activeCanvas,
        textItems,
        columnIds,
        columns,
        filtered,
        currentPage,
      );
      setRows(extracted);
      setActiveTab('results');
      setSuccess(`${extracted.length} linha(s) recortada(s) da página ${currentPage}.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyCropAll = () => {
    setIsProcessing(true);
    setError(null);
    try {
      const allRows = runCropAll(pdfPages, columns, rowMode);
      if (allRows.length === 0) {
        setError('Nenhum dado extraído com as configurações atuais.');
        return;
      }
      setRows(allRows);
      setActiveTab('results');
      setSuccess(`${allRows.length} linha(s) recortada(s) das páginas ${cropStartPage} a ${cropEndPage}.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const getFilteredRows = useCallback(
    () => filterRowsByExclusion(rows, columnDefs, exclusionRules),
    [rows, columnDefs, exclusionRules],
  );

  const buildReviewMeta = useCallback((): OcrConfirmMeta => {
    return {
      saldoAnterior: saldoAnterior > 0.0001 ? saldoAnterior : null,
      // Não envia saldo final “esperado” do PDF — OK usa só Anterior + C − D dos lançamentos.
    };
  }, [saldoAnterior]);

  const persistCurrentLayout = useCallback(() => {
    if (!companyName.trim() || !bancoNome.trim() || !contaBanco.trim()) {
      setError(
        isExtrato
          ? 'Informe o nome do banco e a conta contábil antes de salvar o layout.'
          : 'Informe o nome do modelo e o código antes de salvar o layout.',
      );
      return;
    }
    const refPage = pdfPages[0];
    if (!refPage) {
      if (isExtrato) {
        const saved = saveExtratoBancoParaImportacao(
          companyName,
          bancoNome.trim(),
          contaBanco.trim(),
        );
        setLayoutEditId(saved.id);
        refreshSavedLayouts();
        window.dispatchEvent(
          new CustomEvent('contabilfacil-extrato-banco-updated', {
            detail: {
              company: companyName,
              contaBanco: saved.contaBanco,
              bancoNome: saved.bancoNome,
            },
          }),
        );
        setSuccess(`Banco "${saved.bancoNome}" · conta ${saved.contaBanco} salvos.`);
        return;
      }
      return;
    }
    const imgW = refPage.width;
    const imgH = refPage.height;
    const faixaPorPagina = buildFaixaPorPagina(cropStartPct, cropEndPct, cropStartPage, cropEndPage, pdfPages.length);
    const saved = saveExtratoOcrLayout(companyName, {
      id: layoutEditId ?? undefined,
      bancoNome: bancoNome.trim(),
      contaBanco: contaBanco.trim(),
      ignoreLineWords: isExtrato ? exclusionRules.join(', ') : '',
      semDelimitacaoVertical: false,
      columns: mappingToGenericColumns(columns, columnIds, imgW),
      columnsNorm: mappingToNorm(columns, columnIds),
      faixaStart: (cropStartPct / 100) * imgH,
      faixaEnd: (cropEndPct / 100) * imgH,
      faixaStartNorm: cropStartPct / 100,
      faixaEndNorm: cropEndPct / 100,
      faixaInicioMarcado: true,
      faixaFimMarcado: true,
      faixaPorPagina,
      faixaInicioPagina: cropStartPage,
      faixaFimPagina: cropEndPage,
      imgWidth: imgW,
      imgHeight: imgH,
    });
    setLayoutEditId(saved.id);
    setActiveExtratoOcrLayout(companyName, saved.id);
    refreshSavedLayouts();
    window.dispatchEvent(
      new CustomEvent('contabilfacil-extrato-banco-updated', {
        detail: { company: companyName, contaBanco: saved.contaBanco, bancoNome: saved.bancoNome },
      }),
    );
    setSuccess(`Layout "${saved.bancoNome}" · conta ${saved.contaBanco} salvo.`);
  }, [
    bancoNome,
    columnIds,
    columns,
    companyName,
    contaBanco,
    cropEndPage,
    cropEndPct,
    cropStartPage,
    cropStartPct,
    exclusionRules,
    isExtrato,
    layoutEditId,
    pdfPages,
    refreshSavedLayouts,
  ]);

  const applyLayout = useCallback(
    (layout: ExtratoOcrLayoutSaved) => {
      setBancoNome(layout.bancoNome);
      setContaBanco(layout.contaBanco || (isExtrato ? '' : dataType));
      setLayoutEditId(layout.id);
      if (layout.columnsNorm?.length) {
        const restored = normToMapping(layout.columnsNorm);
        if (restored) setColumns(restored);
      }
      if (layout.faixaStartNorm != null) setCropStartPct(layout.faixaStartNorm * 100);
      if (layout.faixaEndNorm != null) setCropEndPct(layout.faixaEndNorm * 100);
      if (layout.faixaInicioPagina) setCropStartPage(layout.faixaInicioPagina);
      if (layout.faixaFimPagina) setCropEndPage(layout.faixaFimPagina);
      if (isExtrato && layout.ignoreLineWords?.trim()) {
        setExclusionRules(
          layout.ignoreLineWords
            .split(/[,;\n]+/)
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }
      if (companyName.trim()) {
        setActiveExtratoOcrLayout(companyName, layout.id);
        if (isExtrato) {
          saveExtratoBancoParaImportacao(companyName, layout.bancoNome, layout.contaBanco);
        }
        window.dispatchEvent(
          new CustomEvent('contabilfacil-extrato-banco-updated', {
            detail: {
              company: companyName,
              contaBanco: layout.contaBanco,
              bancoNome: layout.bancoNome,
            },
          }),
        );
      }
      refreshSavedLayouts();
      setSuccess(`Layout "${layout.bancoNome}" · conta ${layout.contaBanco} aplicado.`);
    },
    [companyName, dataType, isExtrato, refreshSavedLayouts],
  );

  const handleSaldoAnteriorChange = useCallback(
    (value: number) => {
      setSaldoAnterior(value);
      if (saldoStorageKey) writePersistedLocalStorageJson(saldoStorageKey, String(value));
    },
    [saldoStorageKey],
  );

  const handleOk = () => {
    const filtered = getFilteredRows();
    if (filtered.length === 0) {
      setError(
        isExtrato
          ? 'Nenhuma linha válida para conciliação. Ajuste os recortes ou filtros.'
          : 'Nenhuma linha válida. Ajuste os recortes ou filtros.',
      );
      return;
    }
    if (isInstallments) {
      onConfirmParcelamento?.(mapGenericRowsToParcelamento(filtered));
      return;
    }
    if (isExtrato && companyName.trim() && bancoNome.trim() && contaBanco.trim()) {
      saveExtratoBancoParaImportacao(companyName, bancoNome, contaBanco);
    }
    onConfirm(
      mapGenericRowsToOcrRows(filtered, columnIds),
      isExtrato ? buildReviewMeta() : undefined,
    );
  };

  useEffect(() => {
    if (!success && !error) return;
    const t = setTimeout(() => {
      setSuccess(null);
      setError(null);
    }, 5000);
    return () => clearTimeout(t);
  }, [success, error]);

  const configSidebar = (
    <aside className="w-[280px] border-l border-brand-border bg-white flex flex-col shrink-0 h-full min-h-0 overflow-hidden">
      <div className="flex border-b border-brand-border shrink-0">
        <button
          type="button"
          onClick={() => setSideTab('config')}
          className={`flex-1 py-2 text-[9px] font-black uppercase ${sideTab === 'config' ? 'bg-brand-border text-white' : 'opacity-60'}`}
        >
          Parametrizar
        </button>
        <button
          type="button"
          onClick={() => {
            refreshSavedLayouts();
            setSideTab('layouts');
          }}
          className={`flex-1 py-2 text-[9px] font-black uppercase ${sideTab === 'layouts' ? 'bg-brand-border text-white' : 'opacity-60'}`}
        >
          Layouts salvos
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 overscroll-contain">
        {sideTab === 'config' ? (
          <>
            <section className="technical-panel p-3 space-y-2">
              <h3 className="text-[9px] font-black uppercase">
                {isExtrato ? 'Banco do extrato' : 'Modelo de importação'}
              </h3>
              <label className="block text-[9px] font-bold uppercase opacity-60">
                {isExtrato ? 'Nome do banco' : 'Nome do modelo'}
              </label>
              <input
                type="text"
                value={bancoNome}
                onChange={(e) => setBancoNome(e.target.value)}
                placeholder={isExtrato ? 'Ex: Itaú' : 'Ex: Cronograma padrão'}
                className="w-full border border-brand-border px-2 py-1.5 text-[10px]"
              />
              <label className="block text-[9px] font-bold uppercase opacity-60">
                {isExtrato ? 'Conta contábil do banco' : 'Código / tag do modelo'}
              </label>
              {isExtrato && planoContaOptions.length > 0 ? (
                <ExtratoContaPicker
                  value={contaBanco}
                  onChange={setContaBanco}
                  options={planoContaOptions}
                  placeholder="Selecione a conta banco…"
                />
              ) : (
                <input
                  type="text"
                  value={contaBanco}
                  onChange={(e) => setContaBanco(e.target.value)}
                  placeholder={isExtrato ? 'Código da conta banco' : dataType}
                  className="w-full border border-brand-border px-2 py-1.5 text-[10px] font-mono"
                />
              )}
              <button
                type="button"
                onClick={persistCurrentLayout}
                disabled={!bancoNome.trim() || !contaBanco.trim() || !companyName.trim()}
                className="technical-button w-full text-[9px] py-1.5 flex items-center justify-center gap-1 disabled:opacity-40"
              >
                <Save size={11} />
                {layoutEditId ? 'Atualizar layout' : 'Salvar novo layout'}
              </button>
            </section>
            <section className="technical-panel p-3 space-y-2">
              <h3 className="text-[9px] font-black uppercase">Modo de linhas</h3>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setRowMode('auto')}
                  className={`technical-button flex-1 py-1 text-[9px] ${rowMode === 'auto' ? 'bg-brand-border text-white' : ''}`}
                >
                  Automático
                </button>
                <button
                  type="button"
                  onClick={() => setRowMode('manual')}
                  className={`technical-button flex-1 py-1 text-[9px] ${rowMode === 'manual' ? 'bg-brand-border text-white' : ''}`}
                >
                  Manual
                </button>
              </div>
              {rowMode === 'manual' && activeCanvas ? (
                <div className="space-y-2">
                  <label className="text-[9px] font-bold uppercase block">Início Y: {gridStartY}</label>
                  <input
                    type="range"
                    min={0}
                    max={activeCanvas.height}
                    value={gridStartY}
                    onChange={(e) => setGridStartY(Number(e.target.value))}
                    className="w-full"
                    aria-label="Início Y da grade manual"
                  />
                  <label className="text-[9px] font-bold uppercase block">Altura: {gridRowHeight}</label>
                  <input
                    type="range"
                    min={12}
                    max={120}
                    value={gridRowHeight}
                    onChange={(e) => setGridRowHeight(Number(e.target.value))}
                    className="w-full"
                    aria-label="Altura da linha da grade manual"
                  />
                  <label className="text-[9px] font-bold uppercase block">Qtd: {gridRowCount}</label>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={gridRowCount}
                    onChange={(e) => setGridRowCount(Number(e.target.value))}
                    className="w-full"
                    aria-label="Quantidade de linhas da grade manual"
                  />
                </div>
              ) : null}
            </section>
            {isExtrato ? (
              <p className="text-[9px] opacity-70 leading-relaxed">
                As regras de exclusão (SALDO ANTERIOR, etc.) ficam na aba Tabela. Após OK, os lançamentos vão
                direto para a conciliação.
              </p>
            ) : (
              <p className="text-[9px] opacity-70 leading-relaxed">
                Alinhe as colunas sobre o documento e recorte as linhas. Após OK, os dados serão importados diretamente.
              </p>
            )}
          </>
        ) : (
          <section className="technical-panel p-3 space-y-2">
            <h3 className="text-[9px] font-black uppercase flex items-center gap-1">
              <FolderOpen size={12} />
              Layouts salvos
            </h3>
            {!companyName.trim() ? (
              <p className="text-[9px] opacity-60">Selecione uma empresa para salvar layouts.</p>
            ) : savedLayouts.length === 0 ? (
              <p className="text-[9px] opacity-60 text-center py-4">Nenhum layout salvo.</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {savedLayouts.map((layout) => {
                  const isActive = getActiveExtratoOcrLayout(companyName)?.id === layout.id;
                  return (
                    <div
                      key={layout.id}
                      className={`border border-brand-border p-2 space-y-1 ${layoutEditId === layout.id || isActive ? 'bg-brand-sidebar/30' : ''}`}
                    >
                      <p className="text-[10px] font-black uppercase truncate">{layout.bancoNome}</p>
                      <p className="text-[9px] font-mono opacity-70">{layout.contaBanco}</p>
                      <div className="flex gap-1 pt-1">
                        <button
                          type="button"
                          className="technical-button text-[8px] py-0.5 px-2 flex-1"
                          onClick={() => {
                            applyLayout(layout);
                          }}
                        >
                          {isActive ? 'Reaplicar' : 'Usar'}
                        </button>
                        <button
                          type="button"
                          className="technical-button text-[8px] py-0.5 px-2"
                          aria-label={`Excluir layout ${layout.bancoNome}`}
                          onClick={() => {
                            deleteExtratoOcrLayout(companyName, layout.id);
                            refreshSavedLayouts();
                            if (layoutEditId === layout.id) setLayoutEditId(null);
                          }}
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </aside>
  );

  return (
    <div className="fixed inset-0 z-[120] bg-brand-bg text-brand-text flex flex-col">
      <header className="border-b border-brand-border bg-white px-4 py-3 flex items-center justify-between shrink-0">
        <div>
          <p className="text-[9px] uppercase font-black tracking-wider opacity-60">Leitor e recortador de documentos</p>
          <h2 className="text-sm font-black uppercase">{title}</h2>
          <p className="text-[9px] opacity-60 mt-0.5">{file.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] border border-green-600 bg-green-50 text-green-800 px-2 py-1 font-bold uppercase">
            Texto nativo do PDF — sem OCR
          </span>
          <button type="button" onClick={onCancel} className="technical-button px-3 py-1 text-[10px]">
            Fechar
          </button>
        </div>
      </header>

      {(error || success) && (
        <div
          className={`mx-4 mt-2 border px-3 py-2 text-[10px] font-bold uppercase ${
            error ? 'border-red-400 bg-red-50 text-red-900' : 'border-green-500 bg-green-50 text-green-900'
          }`}
        >
          {error || success}
        </div>
      )}

      {isLoading ? (
        <div className="m-4 technical-panel px-4 py-3 text-xs font-bold uppercase">Carregando documento...</div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="px-4 pt-2 border-b border-brand-border bg-white flex gap-0 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('align')}
              className={`px-4 py-2 text-[10px] font-black uppercase border border-brand-border flex items-center gap-1.5 ${
                activeTab === 'align' ? 'bg-brand-border text-white' : 'bg-white'
              }`}
            >
              <Sliders size={12} />
              1. Alinhamento & colunas
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('results')}
              className={`px-4 py-2 text-[10px] font-black uppercase border border-brand-border border-l-0 flex items-center gap-1.5 ${
                activeTab === 'results' ? 'bg-brand-border text-white' : 'bg-white'
              }`}
            >
              <Columns size={12} />
              2. Tabela de recortes ({rows.length})
            </button>
          </div>

          <main className="flex-1 min-h-0 flex overflow-hidden bg-brand-bg">
            {activeTab === 'align' ? (
              <div className="flex-1 min-h-0 flex overflow-hidden h-full">
                <div className="flex-1 min-h-0 h-full p-2 overflow-hidden flex flex-col">
                  <GenericLeitorWorkspace
                    canvasElement={activeCanvas}
                    columnDefs={columnDefs}
                    columns={columns}
                    setColumns={setColumns}
                    detectedRowYs={detectedRows}
                    isProcessing={isProcessing}
                    onApplyCrop={handleApplyCrop}
                    onApplyCropAll={pdfPages.length > 1 ? handleApplyCropAll : undefined}
                    docType={docType}
                    cropStartPct={cropStartPct}
                    setCropStartPct={setCropStartPct}
                    cropEndPct={cropEndPct}
                    setCropEndPct={setCropEndPct}
                    pdfPages={pdfPages}
                    currentPage={currentPage}
                    onSelectPage={handlePageChange}
                    cropStartPage={cropStartPage}
                    setCropStartPage={setCropStartPage}
                    cropEndPage={cropEndPage}
                    setCropEndPage={setCropEndPage}
                  />
                </div>
                {configSidebar}
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex overflow-hidden h-full">
                <div className="flex-1 min-h-0 h-full p-2 overflow-hidden flex flex-col">
                  <GenericLeitorTable
                    rows={rows}
                    setRows={setRows}
                    columnDefs={columnDefs}
                    exclusionRules={exclusionRules}
                    setExclusionRules={setExclusionRules}
                    fileName={file.name}
                  />
                </div>
                {configSidebar}
              </div>
            )}
          </main>
        </div>
      )}

      <footer className="border-t border-brand-border bg-white px-4 py-2.5 flex items-center justify-between shrink-0">
        <span className="text-[10px] font-bold uppercase opacity-70">
          {rows.length} recorte(s) — motor: texto nativo + recorte visual
        </span>
        <div className="flex gap-2">
          <button type="button" className="technical-button px-4 py-2 text-[10px]" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="technical-button-primary px-4 py-2 text-[10px] disabled:opacity-40"
            onClick={handleOk}
            disabled={rows.length === 0 || isLoading}
          >
            {isExtrato ? 'OK — Ir para conciliação' : confirmLabel}
          </button>
        </div>
      </footer>
    </div>
  );
}
