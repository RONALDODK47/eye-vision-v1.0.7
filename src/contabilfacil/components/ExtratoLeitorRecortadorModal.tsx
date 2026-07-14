/**
 * Leitor e recortador de extratos — port fiel do software em leitor-e-recortador-de-extratos.
 * Visual: cores e bordas quadradas do ContábilFácil (sem alterar layout/dimensões).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Sliders,
  Columns,
  FileSpreadsheet,
  ShieldAlert,
  CheckCircle2,
  Save,
  FolderOpen,
  Trash2,
  RefreshCw,
  Download,
  FileText,
} from 'lucide-react';
import type { GenericOcrRow } from '../../lib/parcelamentoColunasExtract';
import {
  detectRowsFromText,
  clearExtractedRowPrunePrefs,
  extractDataFromCanvas,
  filterRowsInCropBand,
  loadExtractedRowPrunePrefs,
  pruneExtractedRows,
  propagateExtractedRowDates,
} from '../../lib/leitorRecortador/cropper';
import { exportToCSV } from '../../lib/leitorRecortador/exporter';
import {
  buildFaixaPorPagina,
  leitorColumnsToGenericColumns,
  leitorColumnsToNorm,
  normColumnsToLeitorColumns,
} from '../../lib/leitorRecortador/layoutBridge';
import { exportExtractedRowsToOfx } from '../../lib/leitorRecortador/ofxExport';
import { loadPdfPagesProgressive, parseAndRenderImage } from '../../lib/leitorRecortador/pdfParser';
import {
  detectNubankTransactionRows,
  extractNubankDataFromCanvas,
  getNubankLastDayDate,
  getNubankLastDateAnchor,
  getNubankLastFlowSign,
  isNubankExtratoLayout,
  NUBANK_EXCLUSION_RULES,
  pdfTextItemsToPosicionado,
  suggestNubankExtratoPageLayout,
} from '../../lib/leitorRecortador/nubankExtratoLayout';
import type { DocMetadata, DocumentColumns, ExtractedRow, OcrConfirmMeta } from '../../lib/leitorRecortador/types';
import { mapExtractedRowsToRecorteFielOcr } from '../logic/extratoRecorteFielImport';
import { flushPersistenceAfterCriticalWrite } from '../logic/eyeVisionPersistenceFlush';
import { extractStatementYear } from '../../extratoVision/utils/parser';
import {
  deleteExtratoOcrLayout,
  getActiveExtratoOcrLayout,
  listExtratoOcrLayouts,
  saveExtratoBancoParaImportacao,
  saveExtratoOcrLayout,
  setActiveExtratoOcrLayout,
  type ExtratoOcrLayoutSaved,
} from '../logic/extratoOcrLayoutStorage';
import ExtratoContaPicker, { type ExtratoPlanoContaOption } from './ExtratoContaPicker';

function resolveExtratoYearFromContext(
  textItems: { text: string }[],
  fileName: string,
  extraTextItems: { text: string }[] = [],
): string {
  const blob = [fileName, ...textItems.map((t) => t.text), ...extraTextItems.map((t) => t.text)].join(' ');
  return extractStatementYear(blob) || String(new Date().getFullYear());
}
import { LeitorRecortadorTable } from './leitorRecortador/LeitorRecortadorTable';
import { LeitorRecortadorUploader } from './leitorRecortador/LeitorRecortadorUploader';
import { LeitorRecortadorWorkspace } from './leitorRecortador/LeitorRecortadorWorkspace';

type Props = {
  file: File;
  title: string;
  companyName?: string;
  planoContaOptions?: ExtratoPlanoContaOption[];
  onCancel: () => void;
  onConfirm: (rows: GenericOcrRow[], meta?: any) => void;
};

const DEFAULT_EXCLUSION_RULES = [
  'SALDO ANTERIOR',
  'SALDO DO DIA',
  'SALDO ATUAL',
  'SALDO FINAL',
  'SALDO TOTAL DISPONÍVEL DIA',
];

export function ExtratoLeitorRecortadorModal({
  file,
  title,
  companyName = '',
  planoContaOptions = [],
  onCancel,
  onConfirm,
}: Props) {
  const [activeCanvas, setActiveCanvas] = useState<HTMLCanvasElement | null>(null);
  const [metadata, setMetadata] = useState<DocMetadata | null>(null);
  const [textItems, setTextItems] = useState<import('../../lib/leitorRecortador/types').PDFTextItem[]>([]);
  const [pdfPages, setPdfPages] = useState<
    { pageNumber: number; canvas: HTMLCanvasElement; textItems: typeof textItems; width: number; height: number }[]
  >([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [cropStartPct, setCropStartPct] = useState(10);
  const [cropEndPct, setCropEndPct] = useState(90);
  const [cropStartPage, setCropStartPage] = useState(1);
  const [cropEndPage, setCropEndPage] = useState(1);
  const [columns, setColumns] = useState<DocumentColumns>({
    date: { startX: 5, width: 15 },
    history: { startX: 22, width: 48 },
    value: { startX: 72, width: 23 },
  });
  const [rowMode, setRowMode] = useState<'auto' | 'manual'>('auto');
  const [gridStartY, setGridStartY] = useState(240);
  const [gridRowHeight, setGridRowHeight] = useState(35);
  const [gridRowCount, setGridRowCount] = useState(8);
  const [detectedRows, setDetectedRows] = useState<{ y: number; height: number }[]>([]);
  const [rows, setRows] = useState<ExtractedRow[]>([]);
  const [valorSignHeuristic, setValorSignHeuristic] = useState<'automatic' | 'color_blue_c_red_d' | 'color_blue_d_red_c'>('automatic');
  const [exclusionRules, setExclusionRules] = useState<string[]>(DEFAULT_EXCLUSION_RULES);
  const [activeTab, setActiveTab] = useState<'align' | 'results'>('align');
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bancoNome, setBancoNome] = useState('');
  const [contaBanco, setContaBanco] = useState('');
  const [layoutEditId, setLayoutEditId] = useState<string | null>(null);
  const [savedLayouts, setSavedLayouts] = useState<ExtratoOcrLayoutSaved[]>([]);
  const [sideTab, setSideTab] = useState<'config' | 'layouts'>('config');
  const isNubankLayoutRef = useRef(false);
  const documentIsNubankRef = useRef(false);
  const loadedFileKeyRef = useRef('');
  const pruneStorageKey = `${companyName.trim()}::${file.name}`;

  const applyPersistedPrune = useCallback(
    (extracted: ExtractedRow[]) =>
      pruneExtractedRows(extracted, loadExtractedRowPrunePrefs(pruneStorageKey)),
    [pruneStorageKey],
  );

  const applyAutoLayoutForPage = useCallback(
    (
      page: {
        pageNumber: number;
        textItems: import('../../lib/leitorRecortador/types').PDFTextItem[];
        width: number;
        height: number;
      },
      options?: { setBancoIfEmpty?: boolean },
    ) => {
      const pos = pdfTextItemsToPosicionado(page.textItems);
      const isNu =
        documentIsNubankRef.current ||
        isNubankExtratoLayout(pos, page.width, { documentIsNubank: documentIsNubankRef.current });
      if (isNu) documentIsNubankRef.current = true;
      isNubankLayoutRef.current = isNu;

      if (!isNu) {
        const parsedRows = detectRowsFromText(page.textItems, 10);
        if (parsedRows.length > 0) {
          setRowMode('auto');
          setDetectedRows(parsedRows.map((r) => ({ y: r.y, height: r.height })));
        } else {
          // PDF digitalizado/foto detectado (sem texto nativo)
          setRowMode('manual');
          const startY = Math.round(page.height * 0.22);
          const rowHeight = Math.round(page.height * 0.038) || 35;
          const rowCount = 12;

          setGridStartY(startY);
          setGridRowHeight(rowHeight);
          setGridRowCount(rowCount);

          setDetectedRows(
            Array.from({ length: rowCount }).map((_, i) => ({
              y: startY + i * rowHeight,
              height: rowHeight,
            })),
          );
          setSuccessMessage('Aviso: PDF digitalizado/foto detectado! Grade manual ativada.');
        }
        return;
      }

      const layout = suggestNubankExtratoPageLayout(pos, page.width, page.height, page.pageNumber);
      setColumns(layout.columns);
      setCropStartPct(layout.faixaStartPct);
      setCropEndPct(layout.faixaEndPct);
      setExclusionRules((prev) => [...new Set([...prev, ...NUBANK_EXCLUSION_RULES])]);
      if (options?.setBancoIfEmpty) {
        setBancoNome((prev) => prev.trim() || 'NUBANK');
      }
      setDetectedRows(
        detectNubankTransactionRows(page.textItems, page.width, page.height, page.pageNumber),
      );
    },
    [],
  );

  const refreshSavedLayouts = useCallback(() => {
    if (!companyName.trim()) {
      setSavedLayouts([]);
      return;
    }
    setSavedLayouts(listExtratoOcrLayouts(companyName, 'extrato'));
  }, [companyName]);

  useEffect(() => {
    refreshSavedLayouts();
    const active = companyName.trim() ? getActiveExtratoOcrLayout(companyName) : null;
    if (!active) return;
    setBancoNome(active.bancoNome);
    setContaBanco(active.contaBanco);
    setLayoutEditId(active.id);
    if (active.columnsNorm?.length) {
      const restored = normColumnsToLeitorColumns(active.columnsNorm);
      if (restored) setColumns(restored);
    }
    if (active.faixaStartNorm != null) setCropStartPct(active.faixaStartNorm * 100);
    if (active.faixaEndNorm != null) setCropEndPct(active.faixaEndNorm * 100);
    if (active.faixaInicioPagina) setCropStartPage(active.faixaInicioPagina);
    if (active.faixaFimPagina) setCropEndPage(active.faixaFimPagina);
    if (active.ignoreLineWords?.trim()) {
      setExclusionRules(
        active.ignoreLineWords
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }
    if (active.valorSignHeuristic) {
      setValorSignHeuristic(active.valorSignHeuristic);
    }
  }, [companyName, refreshSavedLayouts]);

  useEffect(() => {
    if (rowMode === 'manual' && activeCanvas) {
      setDetectedRows(
        Array.from({ length: gridRowCount }).map((_, i) => ({
          y: gridStartY + i * gridRowHeight,
          height: gridRowHeight,
        })),
      );
    }
  }, [rowMode, gridStartY, gridRowHeight, gridRowCount, activeCanvas]);

  useEffect(() => {
    if (rowMode === 'auto' && textItems.length > 0 && activeCanvas) {
      applyAutoLayoutForPage({
        pageNumber: currentPage,
        textItems,
        width: activeCanvas.width,
        height: activeCanvas.height,
      });
    }
  }, [rowMode, textItems, activeCanvas, currentPage, applyAutoLayoutForPage]);

  const handleFileLoaded = useCallback(async (loadedFile: File) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setRows([]);
    setActiveTab('align');
    setCropStartPct(10);
    setCropEndPct(90);
    documentIsNubankRef.current = false;
    isNubankLayoutRef.current = false;

    try {
      if (loadedFile.type === 'application/pdf' || loadedFile.name.toLowerCase().endsWith('.pdf')) {
        let totalPages = 1;
        await loadPdfPagesProgressive(loadedFile, {
          onReady: (firstPage, total) => {
            totalPages = total;
            setPdfPages([firstPage]);
            setCurrentPage(1);
            setCropStartPage(1);
            setCropEndPage(total);
            setActiveCanvas(firstPage.canvas);
            setTextItems(firstPage.textItems);
            setMetadata({
              name: loadedFile.name,
              type: 'pdf',
              pageNumber: 1,
              totalPages: total,
              width: firstPage.width,
              height: firstPage.height,
            });
            setRowMode('auto');
            applyAutoLayoutForPage(firstPage, { setBancoIfEmpty: true });
            setSuccessMessage(`Página 1 de ${total} pronta. Carregando demais páginas em segundo plano…`);
            setIsProcessing(false);
          },
          onProgress: (pages, loaded, total) => {
            setPdfPages(pages);
            if (loaded === total) {
              setSuccessMessage(`PDF carregado com sucesso! ${total} páginas disponíveis.`);
            }
          },
        });
        if (totalPages === 0) throw new Error('Não foi possível carregar nenhuma página deste PDF.');
      } else {
        const page = await parseAndRenderImage(loadedFile);
        setActiveCanvas(page.canvas);
        setTextItems([]);
        setMetadata({
          name: loadedFile.name,
          type: 'image',
          pageNumber: 1,
          totalPages: 1,
          width: page.width,
          height: page.height,
        });
        setPdfPages([page]);
        setCurrentPage(1);
        setCropStartPage(1);
        setCropEndPage(1);
        setRowMode('manual');
        setGridStartY(Math.round(page.height * 0.25));
        setGridRowHeight(Math.round(page.height * 0.04) || 35);
        setGridRowCount(10);
        setColumns({
          date: { startX: 5, width: 15 },
          history: { startX: 22, width: 48 },
          value: { startX: 72, width: 23 },
        });
        setSuccessMessage('Imagem carregada! Alinhamento manual de linhas ativado.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Erro ao carregar documento: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  useEffect(() => {
    const key = `${file.name}|${file.size}|${file.lastModified}`;
    if (loadedFileKeyRef.current === key) return;
    loadedFileKeyRef.current = key;
    void handleFileLoaded(file);
  }, [file.name, file.size, file.lastModified, handleFileLoaded]);

  const handlePageChange = async (newPageNumber: number) => {
    const page = pdfPages.find((p) => p.pageNumber === newPageNumber);
    if (!page) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      setCurrentPage(newPageNumber);
      setActiveCanvas(page.canvas);
      setTextItems(page.textItems);
      setMetadata((prev) =>
        prev
          ? { ...prev, pageNumber: newPageNumber, width: page.width, height: page.height }
          : null,
      );
      if (rowMode === 'auto') {
        applyAutoLayoutForPage(page);
      }
      setSuccessMessage(`Visualizando página ${newPageNumber}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Erro ao carregar página do PDF: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyCrop = () => {
    if (!activeCanvas || detectedRows.length === 0) {
      setErrorMessage('Nenhuma linha de transação detectada ou definida para recortar.');
      return;
    }
    setIsProcessing(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      if (currentPage < cropStartPage || currentPage > cropEndPage) {
        setErrorMessage(
          `A página atual (${currentPage}) está fora do intervalo de recorte selecionado (Pág. ${cropStartPage} até Pág. ${cropEndPage}).`,
        );
        setIsProcessing(false);
        return;
      }
      const startY = currentPage === cropStartPage ? (cropStartPct / 100) * activeCanvas.height : 0;
      const endY = currentPage === cropEndPage ? (cropEndPct / 100) * activeCanvas.height : activeCanvas.height;
      const filteredRows = filterRowsInCropBand(detectedRows, startY, endY);
      if (filteredRows.length === 0) {
        setErrorMessage('Nenhuma linha de transação está localizada dentro dos limites de recorte da página atual.');
        setIsProcessing(false);
        return;
      }
      const stmtYear = resolveExtratoYearFromContext(textItems, file.name);
      let nubankCarryDate = '';
      let nubankCarryFlow: import('../../lib/leitorRecortador/nubankExtratoLayout').NubankFlowSign | null = null;
      let nubankCarryDateY = 0;
      let nubankCarryDateH = 0;
      if (isNubankLayoutRef.current && currentPage > 1) {
        for (let p = 1; p < currentPage; p++) {
          const prevPage = pdfPages.find((pp) => pp.pageNumber === p);
          if (!prevPage) continue;
          nubankCarryDate =
            getNubankLastDayDate(prevPage.textItems, prevPage.width, prevPage.height, p) ||
            nubankCarryDate;
          nubankCarryFlow =
            getNubankLastFlowSign(prevPage.textItems, prevPage.width, prevPage.height, p) ??
            nubankCarryFlow;
          const lastAnchor = getNubankLastDateAnchor(
            prevPage.textItems,
            prevPage.width,
            prevPage.height,
            p,
          );
          if (lastAnchor) {
            nubankCarryDate = lastAnchor.text;
            nubankCarryDateY = lastAnchor.y;
            nubankCarryDateH = lastAnchor.h;
          }
        }
      }
      const nubankRows = isNubankLayoutRef.current
        ? filterRowsInCropBand(
          detectNubankTransactionRows(
            textItems,
            activeCanvas.width,
            activeCanvas.height,
            currentPage,
            nubankCarryDate,
            nubankCarryFlow,
            nubankCarryDateY,
            nubankCarryDateH,
          ),
          startY,
          endY,
        )
        : null;
      const filteredForExtract = nubankRows ?? filteredRows;
      const extracted = applyPersistedPrune(
        propagateExtractedRowDates(
          isNubankLayoutRef.current && nubankRows
            ? extractNubankDataFromCanvas(
              activeCanvas,
              textItems,
              columns,
              nubankRows,
              stmtYear,
              currentPage,
            )
            : extractDataFromCanvas(activeCanvas, textItems, columns, filteredForExtract, true, undefined, undefined, { valorSignHeuristic }),
          stmtYear,
        ),
      );
      setRows(extracted);
      setActiveTab('results');
      setSuccessMessage(`Recorte concluído! ${extracted.length} transações extraídas com sucesso da página ${currentPage}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Erro ao recortar colunas: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyCropAll = () => {
    if (pdfPages.length === 0) return;
    setIsProcessing(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      let allExtractedRows: ExtractedRow[] = [];
      let nubankCarryDate = '';
      let nubankCarryFlow: import('../../lib/leitorRecortador/nubankExtratoLayout').NubankFlowSign | null = null;
      let nubankCarryDateY = 0;
      let nubankCarryDateH = 0;
      pdfPages.forEach((page) => {
        const p = page.pageNumber;
        if (p < cropStartPage || p > cropEndPage) return;
        let pageRows: { y: number; height: number }[] = [];
        const pos = pdfTextItemsToPosicionado(page.textItems);
        const pageIsNu =
          documentIsNubankRef.current ||
          isNubankExtratoLayout(pos, page.width, { documentIsNubank: documentIsNubankRef.current });
        if (pageIsNu) documentIsNubankRef.current = true;
        if (rowMode === 'auto') {
          pageRows = pageIsNu
            ? detectNubankTransactionRows(
              page.textItems,
              page.width,
              page.height,
              p,
              nubankCarryDate,
              nubankCarryFlow,
              nubankCarryDateY,
              nubankCarryDateH,
            )
            : detectRowsFromText(page.textItems, 10).map((r) => ({ y: r.y, height: r.height }));
        } else {
          pageRows = Array.from({ length: gridRowCount }).map((_, i) => ({
            y: gridStartY + i * gridRowHeight,
            height: gridRowHeight,
          }));
        }
        const startY = p === cropStartPage ? (cropStartPct / 100) * page.height : 0;
        const endY = p === cropEndPage ? (cropEndPct / 100) * page.height : page.height;
        const filteredRows = filterRowsInCropBand(pageRows, startY, endY);
        if (filteredRows.length > 0) {
          const stmtYearPage = resolveExtratoYearFromContext(page.textItems, file.name);
          const nubankPageRows = pageIsNu
            ? detectNubankTransactionRows(
              page.textItems,
              page.width,
              page.height,
              p,
              nubankCarryDate,
              nubankCarryFlow,
              nubankCarryDateY,
              nubankCarryDateH,
            ).filter((r) => filterRowsInCropBand([r], startY, endY).length > 0)
            : null;
          if (pageIsNu) {
            nubankCarryDate =
              getNubankLastDayDate(page.textItems, page.width, page.height, p) || nubankCarryDate;
            nubankCarryFlow =
              getNubankLastFlowSign(page.textItems, page.width, page.height, p) ?? nubankCarryFlow;
            const lastAnchor = getNubankLastDateAnchor(page.textItems, page.width, page.height, p);
            if (lastAnchor) {
              nubankCarryDate = lastAnchor.text;
              nubankCarryDateY = lastAnchor.y;
              nubankCarryDateH = lastAnchor.h;
            }
          }
          const extracted =
            pageIsNu && nubankPageRows
              ? extractNubankDataFromCanvas(
                page.canvas,
                page.textItems,
                columns,
                nubankPageRows,
                stmtYearPage,
                p,
              )
              : extractDataFromCanvas(page.canvas, page.textItems, columns, filteredRows, true, undefined, undefined, { valorSignHeuristic });
          allExtractedRows = [...allExtractedRows, ...extracted];
        }
      });
      if (allExtractedRows.length === 0) {
        setErrorMessage('Não foi possível extrair dados de nenhuma página utilizando as configurações atuais.');
        setIsProcessing(false);
        return;
      }
      const stmtYear = resolveExtratoYearFromContext(
        textItems,
        file.name,
        pdfPages.flatMap((p) => p.textItems),
      );
      setRows(applyPersistedPrune(propagateExtractedRowDates(allExtractedRows, stmtYear)));
      setActiveTab('results');
      setSuccessMessage(
        `Extração em lote concluída! ${allExtractedRows.length} transações extraídas com sucesso das páginas ${cropStartPage} a ${cropEndPage}.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Erro ao recortar todas as páginas: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportCsv = () => {
    if (rows.length === 0) return;
    try {
      const filteredRows = rows.filter((row) => {
        const textToSearch = [row.dateText || '', row.historyText || '', row.valueText || ''].join(' ').toUpperCase();
        return !exclusionRules.some((rule) => rule.trim() && textToSearch.includes(rule.trim().toUpperCase()));
      });
      exportToCSV(filteredRows, `recortes_${metadata?.name.split('.')[0] || 'extrato'}.csv`);
      setSuccessMessage('Arquivo CSV/Excel exportado com sucesso! Pronto para abrir no Excel.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Erro ao exportar dados: ${msg}`);
    }
  };

  const handleClearAll = () => {
    setRows([]);
    clearExtractedRowPrunePrefs(pruneStorageKey);
    setSuccessMessage('Tabela limpa com sucesso.');
  };

  const persistCurrentLayout = (asNew = false) => {
    if (!companyName.trim()) {
      setErrorMessage('Selecione uma empresa para salvar a configuração do extrato.');
      return;
    }
    if (!bancoNome.trim() || !contaBanco.trim()) {
      setErrorMessage('Informe o nome do banco e a conta contábil antes de salvar.');
      return;
    }
    const isUpdate = !asNew && !!layoutEditId;
    const targetLayoutId = asNew ? undefined : (layoutEditId ?? undefined);
    const existingLayout =
      layoutEditId && !asNew
        ? savedLayouts.find((layout) => layout.id === layoutEditId) ?? null
        : null;
    const refPage = pdfPages[0];
    // Sem documento: ainda salva banco + conta (necessário para a conciliação).
    if (!refPage) {
      const saved = saveExtratoOcrLayout(companyName, {
        id: targetLayoutId ?? existingLayout?.id,
        kind: 'extrato',
        bancoNome: bancoNome.trim(),
        contaBanco: contaBanco.trim(),
        ignoreLineWords: existingLayout?.ignoreLineWords ?? exclusionRules.join(', '),
        semDelimitacaoVertical: existingLayout?.semDelimitacaoVertical ?? true,
        columns: existingLayout?.columns ?? [],
        columnsNorm: existingLayout?.columnsNorm,
        faixaStart: existingLayout?.faixaStart ?? 0,
        faixaEnd: existingLayout?.faixaEnd ?? 1,
        faixaStartNorm: existingLayout?.faixaStartNorm,
        faixaEndNorm: existingLayout?.faixaEndNorm,
        faixaInicioMarcado: existingLayout?.faixaInicioMarcado ?? false,
        faixaFimMarcado: existingLayout?.faixaFimMarcado ?? false,
        faixaPorPagina: existingLayout?.faixaPorPagina,
        faixaInicioPagina: existingLayout?.faixaInicioPagina,
        faixaFimPagina: existingLayout?.faixaFimPagina,
        imgWidth: existingLayout?.imgWidth ?? 1,
        imgHeight: existingLayout?.imgHeight ?? 1,
        valorSignHeuristic: valorSignHeuristic,
      });
      setLayoutEditId(saved.id);
      refreshSavedLayouts();
      window.dispatchEvent(
        new CustomEvent('contabilfacil-extrato-banco-updated', {
          detail: { company: companyName, contaBanco: saved.contaBanco, bancoNome: saved.bancoNome },
        }),
      );
      setSuccessMessage(
        isUpdate
          ? `Layout "${saved.bancoNome}" · conta ${saved.contaBanco} atualizado.`
          : `Novo layout "${saved.bancoNome}" · conta ${saved.contaBanco} salvo para a conciliação.`,
      );
      setSideTab('layouts');
      void flushPersistenceAfterCriticalWrite();
      return;
    }
    const imgW = refPage.width;
    const imgH = refPage.height;
    const faixaPorPagina = buildFaixaPorPagina(
      cropStartPct,
      cropEndPct,
      cropStartPage,
      cropEndPage,
      pdfPages.length,
    );
    const saved = saveExtratoOcrLayout(companyName, {
      id: targetLayoutId,
      kind: 'extrato',
      bancoNome: bancoNome.trim(),
      contaBanco: contaBanco.trim(),
      ignoreLineWords: exclusionRules.join(', '),
      semDelimitacaoVertical: false,
      columns: leitorColumnsToGenericColumns(columns, imgW),
      columnsNorm: leitorColumnsToNorm(columns),
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
      valorSignHeuristic: valorSignHeuristic,
    });
    setLayoutEditId(saved.id);
    setActiveExtratoOcrLayout(companyName, saved.id);
    refreshSavedLayouts();
    window.dispatchEvent(
      new CustomEvent('contabilfacil-extrato-banco-updated', {
        detail: { company: companyName, contaBanco: saved.contaBanco, bancoNome: saved.bancoNome },
      }),
    );
    setSuccessMessage(
      isUpdate
        ? `Layout "${saved.bancoNome}" · conta ${saved.contaBanco} atualizado.`
        : `Novo layout "${saved.bancoNome}" · conta ${saved.contaBanco} salvo. Ao usar o layout, a conciliação usa esta conta banco.`,
    );
    setSideTab('layouts');
    void flushPersistenceAfterCriticalWrite();
  };

  const applyLayout = (layout: ExtratoOcrLayoutSaved) => {
    setBancoNome(layout.bancoNome);
    setContaBanco(layout.contaBanco);
    setLayoutEditId(layout.id);
    if (layout.columnsNorm?.length) {
      const restored = normColumnsToLeitorColumns(layout.columnsNorm);
      if (restored) setColumns(restored);
    } else if (layout.columns?.length && layout.imgWidth > 0) {
      // Fallback: reconstrói % a partir das colunas em pixels salvas
      const restored = normColumnsToLeitorColumns(
        layout.columns.map((c) => ({
          id: c.id,
          startNorm: c.start / layout.imgWidth,
          endNorm: c.end / layout.imgWidth,
        })),
      );
      if (restored) setColumns(restored);
    }
    if (layout.faixaStartNorm != null) setCropStartPct(layout.faixaStartNorm * 100);
    if (layout.faixaEndNorm != null) setCropEndPct(layout.faixaEndNorm * 100);
    if (layout.faixaInicioPagina) setCropStartPage(layout.faixaInicioPagina);
    if (layout.faixaFimPagina) setCropEndPage(layout.faixaFimPagina);
    if (layout.ignoreLineWords?.trim()) {
      setExclusionRules(
        layout.ignoreLineWords
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }
    if (layout.valorSignHeuristic) {
      setValorSignHeuristic(layout.valorSignHeuristic);
    }
    if (companyName.trim()) {
      setActiveExtratoOcrLayout(companyName, layout.id);
      // Garante conta banco ativa na conciliação
      saveExtratoBancoParaImportacao(companyName, layout.bancoNome, layout.contaBanco);
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
    setSideTab('config');
    setSuccessMessage(
      `Layout "${layout.bancoNome}" · conta ${layout.contaBanco} aplicado e ativo na conciliação.`,
    );
  };

  const handleExportOfx = () => {
    const filteredRows = rows.filter((row) => {
      const textToSearch = [row.dateText || '', row.historyText || '', row.valueText || ''].join(' ').toUpperCase();
      return !exclusionRules.some((rule) => rule.trim() && textToSearch.includes(rule.trim().toUpperCase()));
    });
    if (filteredRows.length === 0) {
      setErrorMessage('Nenhuma linha válida para exportar em OFX.');
      return;
    }
    const saldoRaw = localStorage.getItem('saldo_anterior');
    const saldoAnterior = saldoRaw ? parseFloat(saldoRaw) || 0 : 0;
    exportExtractedRowsToOfx({
      rows: filteredRows,
      fileName: metadata?.name || file.name,
      bancoNome: bancoNome || 'BANCO',
      contaBanco: contaBanco || '0000001',
      saldoAnterior,
    });
    setSuccessMessage('Arquivo OFX Money exportado com sucesso.');
  };

  const mapVisibleRowsToGeneric = (): GenericOcrRow[] => {
    const visibleRows = rows.filter((row) => {
      const text = [row.dateText, row.historyText, row.valueText].join(' ').toUpperCase();
      return !exclusionRules.some((rule) => rule.trim() && text.includes(rule.trim().toUpperCase()));
    });
    const stmtYear = resolveExtratoYearFromContext(
      textItems,
      file.name,
      pdfPages.flatMap((p) => p.textItems),
    );
    // Mesmos lançamentos/natureza do placar Entradas/Saídas → conciliação 1:1.
    return mapExtractedRowsToRecorteFielOcr(visibleRows, stmtYear);
  };

  const buildReviewMeta = (): OcrConfirmMeta => {
    const saldoRaw = localStorage.getItem('saldo_anterior');
    const saldoAnterior = saldoRaw ? parseFloat(saldoRaw) || 0 : 0;
    return {
      saldoAnterior: saldoAnterior > 0.0001 ? saldoAnterior : null,
      // Não envia saldo final “esperado” do PDF — OK usa só Anterior + C − D dos lançamentos.
    };
  };

  const handleOkConciliacao = () => {
    const mapped = mapVisibleRowsToGeneric();
    if (mapped.length === 0) {
      setErrorMessage('Nenhuma linha válida para conciliação. Ajuste os recortes ou filtros.');
      return;
    }
    if (companyName.trim() && bancoNome.trim() && contaBanco.trim()) {
      saveExtratoBancoParaImportacao(companyName, bancoNome, contaBanco);
    }
    onConfirm(mapped, buildReviewMeta());
  };

  useEffect(() => {
    if (!successMessage && !errorMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [successMessage, errorMessage]);

  return (
    <div className="fixed inset-0 z-[120] bg-brand-bg font-sans text-brand-text flex flex-col antialiased overflow-hidden">
      <div className="fixed top-5 right-5 z-[130] flex flex-col gap-2.5 max-w-md w-full pointer-events-none">
        {successMessage && (
          <div className="flex items-start gap-3 bg-white border border-emerald-900/40 shadow-[2px_2px_0_0_#141414] p-4 text-emerald-700 pointer-events-auto">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div className="flex-1">
              <h5 className="font-bold text-xs text-brand-text">Sucesso</h5>
              <p className="text-[11px] text-brand-text/60 leading-normal mt-0.5">{successMessage}</p>
            </div>
          </div>
        )}
        {errorMessage && (
          <div className="flex items-start gap-3 bg-white border border-rose-900/40 shadow-[2px_2px_0_0_#141414] p-4 text-rose-700 pointer-events-auto">
            <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <div className="flex-1">
              <h5 className="font-bold text-xs text-brand-text">Erro</h5>
              <p className="text-[11px] text-brand-text/60 leading-normal mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}
      </div>

      <header className="bg-white border-b border-brand-border sticky top-0 z-40 shrink-0">
        <div className="px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-text text-white flex items-center justify-center font-bold text-lg tracking-tight">
              E
            </div>
            <div>
              <h1 className="font-semibold text-brand-text text-base tracking-tight">{title}</h1>
              <p className="text-[9px] text-brand-text/50 font-medium">Extração por recorte visual — texto nativo do PDF</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-brand-sidebar text-brand-text/60 font-mono px-2.5 py-1 border border-brand-border">
              {file.name}
            </span>
            <button type="button" onClick={onCancel} className="technical-button px-3 py-1.5 text-xs font-bold">
              Fechar
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-6 flex flex-col gap-6">
        {activeCanvas && (
          <div className="flex border-b border-brand-border gap-1 select-none mb-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('align')}
              className={`px-6 py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${activeTab === 'align'
                ? 'border-brand-text text-brand-text bg-brand-sidebar/40'
                : 'border-transparent text-brand-text/50 hover:text-brand-text/80 hover:bg-brand-sidebar/10'
                }`}
            >
              <Sliders className="w-4 h-4 text-brand-text" />
              1. Alinhamento & Colunas (Ver PDF)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('results')}
              className={`px-6 py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${activeTab === 'results'
                ? 'border-brand-text text-brand-text bg-brand-sidebar/40'
                : 'border-transparent text-brand-text/50 hover:text-brand-text/80 hover:bg-brand-sidebar/10'
                }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-brand-text" />
              2. Tabela de Resultados (Apenas Recortes)
              {rows.length > 0 && (
                <span className="bg-brand-text text-white text-[10px] font-black px-1.5 py-0.5 ml-1">
                  {rows.length}
                </span>
              )}
            </button>
          </div>
        )}

        {!activeCanvas ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
            <div className="md:col-span-1 technical-panel p-6 shadow-[2px_2px_0_0_#141414]">
              <h3 className="text-xs font-bold text-brand-text/60 uppercase tracking-wider mb-4">Carregando…</h3>
              <p className="text-sm text-brand-text/60">Processando {file.name}</p>
            </div>
          </div>
        ) : activeTab === 'align' ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
            <div className="lg:col-span-1 flex flex-col gap-6">
              <div className="technical-panel p-5 shadow-[2px_2px_0_0_#141414]">
                <h3 className="text-xs font-bold text-brand-text/60 uppercase tracking-wider mb-3">1. Importar Arquivo</h3>
                <LeitorRecortadorUploader
                  onFileLoaded={handleFileLoaded}
                  metadata={metadata}
                  isProcessing={isProcessing}
                  onPageChange={handlePageChange}
                />
              </div>

              <div className="technical-panel shadow-[2px_2px_0_0_#141414] overflow-hidden flex flex-col">
                <div className="flex border-b border-brand-border">
                  <button
                    type="button"
                    onClick={() => setSideTab('config')}
                    className={`flex-1 py-2.5 text-[9px] font-black uppercase tracking-wider border-b-2 transition-all ${sideTab === 'config'
                      ? 'border-brand-text text-brand-text bg-brand-sidebar/40'
                      : 'border-transparent text-brand-text/50 hover:text-brand-text/80'
                      }`}
                  >
                    Configuração
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      refreshSavedLayouts();
                      setSideTab('layouts');
                    }}
                    className={`flex-1 py-2.5 text-[9px] font-black uppercase tracking-wider border-b-2 transition-all ${sideTab === 'layouts'
                      ? 'border-brand-text text-brand-text bg-brand-sidebar/40'
                      : 'border-transparent text-brand-text/50 hover:text-brand-text/80'
                      }`}
                  >
                    Layouts salvos
                  </button>
                </div>

                <div className="p-5 flex flex-col gap-5">
                  {sideTab === 'config' ? (
                    <>
                      <section className="flex flex-col gap-3">
                        <h3 className="text-xs font-bold text-brand-text/60 uppercase tracking-wider">Banco do extrato</h3>
                        <div>
                          <label
                            htmlFor="extrato-banco-nome"
                            className="block text-[10px] font-bold uppercase text-brand-text/60 mb-1"
                          >
                            Nome do banco
                          </label>
                          <input
                            id="extrato-banco-nome"
                            type="text"
                            value={bancoNome}
                            onChange={(e) => setBancoNome(e.target.value)}
                            placeholder="Ex: Itaú"
                            title="Nome do banco do extrato"
                            aria-label="Nome do banco do extrato"
                            className="w-full border border-brand-border bg-white px-2.5 py-1.5 text-xs text-brand-text outline-none focus:border-brand-text"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="extrato-conta-banco"
                            className="block text-[10px] font-bold uppercase text-brand-text/60 mb-1"
                          >
                            Conta contábil do banco
                          </label>
                          {planoContaOptions.length > 0 ? (
                            <ExtratoContaPicker
                              value={contaBanco}
                              onChange={setContaBanco}
                              options={planoContaOptions}
                              placeholder="Selecione a conta banco…"
                            />
                          ) : (
                            <input
                              id="extrato-conta-banco"
                              type="text"
                              value={contaBanco}
                              onChange={(e) => setContaBanco(e.target.value)}
                              placeholder="Código da conta banco"
                              title="Código da conta contábil do banco"
                              aria-label="Código da conta contábil do banco"
                              className="w-full border border-brand-border bg-white px-2.5 py-1.5 text-xs font-mono text-brand-text outline-none focus:border-brand-text"
                            />
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor="valor-sign-heuristic"
                            className="block text-[10px] font-bold uppercase text-brand-text/60 mb-1"
                          >
                            Heurística de Sinais (D/C)
                          </label>
                          <select
                            id="valor-sign-heuristic"
                            value={valorSignHeuristic}
                            onChange={(e) => setValorSignHeuristic(e.target.value as any)}
                            className="w-full border border-brand-border bg-white px-2.5 py-1.5 text-xs text-brand-text outline-none focus:border-brand-text"
                          >
                            <option value="automatic">Automático (Texto: D/C, -/+)</option>
                            <option value="color_blue_c_red_d">Texto Azul é Crédito, Vermelho é Débito</option>
                            <option value="color_blue_d_red_c">Texto Azul é Débito, Vermelho é Crédito</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() => persistCurrentLayout(false)}
                            disabled={!bancoNome.trim() || !contaBanco.trim() || !companyName.trim()}
                            className="technical-button w-full text-[10px] py-2 flex items-center justify-center gap-1.5 disabled:opacity-40"
                          >
                            <Save className="w-3.5 h-3.5" />
                            {layoutEditId ? 'Atualizar layout' : 'Salvar configuração'}
                          </button>
                          {layoutEditId ? (
                            <button
                              type="button"
                              onClick={() => persistCurrentLayout(true)}
                              disabled={!bancoNome.trim() || !contaBanco.trim() || !companyName.trim()}
                              className="technical-button-secondary w-full text-[10px] py-2 disabled:opacity-40"
                            >
                              Salvar como novo
                            </button>
                          ) : null}
                        </div>
                      </section>

                      <section className="flex flex-col gap-4 border-t border-brand-border pt-5">
                        <h3 className="text-xs font-bold text-brand-text/60 uppercase tracking-wider">2. Grade de Linhas</h3>
                        <div className="flex bg-brand-bg p-1 border border-brand-border">
                          <button
                            type="button"
                            disabled={metadata?.type === 'image' && textItems.length === 0}
                            onClick={() => setRowMode('auto')}
                            className={`flex-1 py-1.5 text-xs font-semibold transition-all ${rowMode === 'auto'
                              ? 'bg-brand-sidebar text-brand-text shadow-[2px_2px_0_0_#141414]'
                              : 'text-brand-text/50 hover:text-brand-text/70'
                              }`}
                          >
                            Automático (PDF)
                          </button>
                          <button
                            type="button"
                            onClick={() => setRowMode('manual')}
                            className={`flex-1 py-1.5 text-xs font-semibold transition-all ${rowMode === 'manual'
                              ? 'bg-brand-sidebar text-brand-text shadow-[2px_2px_0_0_#141414]'
                              : 'text-brand-text/60 hover:text-brand-text/80'
                              }`}
                          >
                            Manual (Grid)
                          </button>
                        </div>
                        {rowMode === 'auto' ? (
                          <div className="bg-brand-sidebar/40 border border-brand-border p-3 text-brand-text/80 text-[11px]">
                            Detectadas <strong className="text-brand-text">{detectedRows.length} linhas</strong> de transações.
                          </div>
                        ) : (
                          <div className="flex flex-col gap-4">
                            <div>
                              <label htmlFor="extrato-grid-start-y" className="text-xs font-semibold text-brand-text/80">
                                Início Y: {gridStartY}px
                              </label>
                              <input
                                id="extrato-grid-start-y"
                                type="range"
                                min={0}
                                max={metadata?.height ?? 1000}
                                value={gridStartY}
                                onChange={(e) => setGridStartY(Number(e.target.value))}
                                className="w-full accent-brand-text"
                                aria-label={`Início Y: ${gridStartY} pixels`}
                                title={`Início Y: ${gridStartY}px`}
                              />
                            </div>
                            <div>
                              <label htmlFor="extrato-grid-row-height" className="text-xs font-semibold text-brand-text/80">
                                Altura: {gridRowHeight}px
                              </label>
                              <input
                                id="extrato-grid-row-height"
                                type="range"
                                min={15}
                                max={150}
                                value={gridRowHeight}
                                onChange={(e) => setGridRowHeight(Number(e.target.value))}
                                className="w-full accent-brand-text"
                                aria-label={`Altura da linha: ${gridRowHeight} pixels`}
                                title={`Altura: ${gridRowHeight}px`}
                              />
                            </div>
                            <div>
                              <label htmlFor="extrato-grid-row-count" className="text-xs font-semibold text-brand-text/80">
                                Qtd: {gridRowCount}
                              </label>
                              <input
                                id="extrato-grid-row-count"
                                type="range"
                                min={1}
                                max={40}
                                value={gridRowCount}
                                onChange={(e) => setGridRowCount(Number(e.target.value))}
                                className="w-full accent-brand-text"
                                aria-label={`Quantidade de linhas: ${gridRowCount}`}
                                title={`Quantidade: ${gridRowCount}`}
                              />
                            </div>
                          </div>
                        )}
                      </section>

                      <section className="flex flex-col gap-4 border-t border-brand-border pt-5">
                        <h3 className="text-xs font-bold text-brand-text/60 uppercase tracking-wider">3. Limites de Recorte (%)</h3>
                        <div>
                          <label htmlFor="extrato-crop-start-pct" className="text-xs font-semibold text-brand-text/80">
                            Início: {cropStartPct}%
                          </label>
                          <input
                            id="extrato-crop-start-pct"
                            type="range"
                            min={0}
                            max={cropStartPage === cropEndPage ? Math.max(0, cropEndPct - 2) : 100}
                            value={cropStartPct}
                            onChange={(e) => setCropStartPct(Number(e.target.value))}
                            className="w-full accent-orange-500"
                            aria-label={`Início do recorte: ${cropStartPct}%`}
                            title={`Início do recorte: ${cropStartPct}%`}
                          />
                        </div>
                        <div>
                          <label htmlFor="extrato-crop-end-pct" className="text-xs font-semibold text-brand-text/80">
                            Fim: {cropEndPct}%
                          </label>
                          <input
                            id="extrato-crop-end-pct"
                            type="range"
                            min={cropStartPage === cropEndPage ? Math.min(100, cropStartPct + 2) : 0}
                            max={100}
                            value={cropEndPct}
                            onChange={(e) => setCropEndPct(Number(e.target.value))}
                            className="w-full accent-rose-500"
                            aria-label={`Fim do recorte: ${cropEndPct}%`}
                            title={`Fim do recorte: ${cropEndPct}%`}
                          />
                        </div>
                      </section>

                      <section className="border-t border-brand-border pt-5 text-xs">
                        <h4 className="font-bold text-brand-text/60 uppercase tracking-wider mb-3 flex items-center gap-1">
                          <Columns className="w-3.5 h-3.5 text-brand-text/50" />
                          Mapeamento (%)
                        </h4>
                        <div className="flex flex-col gap-2 font-mono">
                          <div className="flex justify-between bg-blue-50 text-blue-700 px-2.5 py-1.5 border border-blue-200">
                            <span>Data:</span>
                            <span>{columns.date.startX}% – {(columns.date.startX + columns.date.width).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between bg-purple-50 text-purple-700 px-2.5 py-1.5 border border-purple-200">
                            <span>Histórico:</span>
                            <span>{columns.history.startX}% – {(columns.history.startX + columns.history.width).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between bg-emerald-50 text-emerald-700 px-2.5 py-1.5 border border-emerald-200">
                            <span>Valor:</span>
                            <span>{columns.value.startX}% – {(columns.value.startX + columns.value.width).toFixed(1)}%</span>
                          </div>
                        </div>
                      </section>
                    </>
                  ) : (
                    <section className="flex flex-col gap-3">
                      <h3 className="text-xs font-bold text-brand-text/60 uppercase tracking-wider flex items-center gap-1.5">
                        <FolderOpen className="w-3.5 h-3.5" />
                        Layouts salvos
                      </h3>
                      {!companyName.trim() ? (
                        <p className="text-[11px] text-brand-text/60">Selecione uma empresa para salvar layouts.</p>
                      ) : savedLayouts.length === 0 ? (
                        <p className="text-[11px] text-brand-text/60 text-center py-4">Nenhum layout salvo.</p>
                      ) : (
                        <div className="space-y-2 max-h-[520px] overflow-y-auto">
                          {savedLayouts.map((layout) => {
                            const isActive = getActiveExtratoOcrLayout(companyName)?.id === layout.id;
                            return (
                              <div
                                key={layout.id}
                                className={`border border-brand-border p-3 space-y-1.5 ${layoutEditId === layout.id || isActive ? 'bg-brand-sidebar/40' : 'bg-white'
                                  }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-[11px] font-black uppercase truncate text-brand-text">
                                    {layout.bancoNome}
                                  </p>
                                  {isActive ? (
                                    <span className="text-[7px] font-black uppercase tracking-wider opacity-60 shrink-0">
                                      Ativo
                                    </span>
                                  ) : null}
                                </div>
                                <p className="text-[10px] font-mono text-brand-text/70">
                                  Conta banco: {layout.contaBanco}
                                </p>
                                <p className="text-[8px] text-brand-text/45">
                                  {new Date(layout.updatedAt).toLocaleString('pt-BR')}
                                </p>
                                <div className="flex gap-1.5 pt-1">
                                  <button
                                    type="button"
                                    className="technical-button text-[9px] py-1 px-2 flex-1"
                                    onClick={() => applyLayout(layout)}
                                  >
                                    {isActive ? 'Reaplicar' : 'Usar este layout'}
                                  </button>
                                  <button
                                    type="button"
                                    className="technical-button text-[9px] py-1 px-2"
                                    aria-label={`Excluir layout ${layout.bancoNome}`}
                                    onClick={() => {
                                      deleteExtratoOcrLayout(companyName, layout.id);
                                      refreshSavedLayouts();
                                      if (layoutEditId === layout.id) setLayoutEditId(null);
                                      void flushPersistenceAfterCriticalWrite();
                                    }}
                                  >
                                    <Trash2 className="w-3 h-3" />
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
              </div>
            </div>

            <div className="lg:col-span-3">
              <LeitorRecortadorWorkspace
                canvasElement={activeCanvas}
                columns={columns}
                setColumns={setColumns}
                detectedRowYs={detectedRows}
                isProcessing={isProcessing}
                onApplyCrop={handleApplyCrop}
                onApplyCropAll={pdfPages.length > 1 ? handleApplyCropAll : undefined}
                docType={metadata?.type || 'pdf'}
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
          </div>
        ) : (
          <div className="w-full flex flex-col gap-6">
            <div className="flex justify-between items-center bg-white p-4 border border-brand-border shadow-[2px_2px_0_0_#141414]">
              <p className="text-xs font-semibold text-brand-text">{metadata?.name}</p>
              <button
                type="button"
                onClick={() => setActiveTab('align')}
                className="technical-button px-4 py-2 text-xs font-bold"
              >
                Ajustar Alinhamento & Colunas
              </button>
            </div>
            <LeitorRecortadorTable
              rows={rows}
              setRows={setRows}
              onExportCsv={handleExportCsv}
              onExportOfx={handleExportOfx}
              onClearAll={handleClearAll}
              exclusionRules={exclusionRules}
              setExclusionRules={setExclusionRules}
              pruneStorageKey={pruneStorageKey}
            />
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-brand-border py-4 px-6 shrink-0 flex items-center justify-between gap-4">
        <p className="text-xs text-brand-text/50">{rows.length} recorte(s) — verificação visual direta</p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="technical-button px-4 py-2 text-xs font-bold">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleExportOfx}
            disabled={rows.length === 0}
            className="technical-button px-4 py-2 text-xs font-bold disabled:opacity-40"
          >
            Exportar OFX Money
          </button>
          <button
            type="button"
            onClick={handleOkConciliacao}
            disabled={rows.length === 0}
            className="technical-button-primary px-4 py-2 text-xs font-bold disabled:opacity-40"
          >
            OK — Ir para conciliação
          </button>
        </div>
      </footer>
    </div>
  );
}
