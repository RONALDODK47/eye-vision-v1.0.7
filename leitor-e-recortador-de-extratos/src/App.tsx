/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { DocMetadata, DocumentColumns, ExtractedRow } from './types';
import { parseAndRenderPDFPage, parseAndRenderAllPDFPages, PDFTextItem } from './utils/pdfParser';
import { generateMockStatement } from './utils/mockStatement';
import { detectRowsFromText, extractDataFromCanvas } from './utils/cropper';
import { exportToCSV } from './utils/exporter';
import Uploader from './components/Uploader';
import Workspace from './components/Workspace';
import TableViewer from './components/TableViewer';
import { Sliders, Columns, Sparkles, FileSpreadsheet, RefreshCw, AlertCircle, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function App() {
  // Document state
  const [activeCanvas, setActiveCanvas] = useState<HTMLCanvasElement | null>(null);
  const [metadata, setMetadata] = useState<DocMetadata | null>(null);
  const [textItems, setTextItems] = useState<PDFTextItem[]>([]);
  const [originalFile, setOriginalFile] = useState<File | null>(null);

  // Multi-page state
  const [pdfPages, setPdfPages] = useState<{ pageNumber: number; canvas: HTMLCanvasElement; textItems: PDFTextItem[]; width: number; height: number }[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Crop limit lines (percentages 0 to 100)
  const [cropStartPct, setCropStartPct] = useState<number>(10);
  const [cropEndPct, setCropEndPct] = useState<number>(90);

  // Pages containing delimiters (for multi-page cropping)
  const [cropStartPage, setCropStartPage] = useState<number>(1);
  const [cropEndPage, setCropEndPage] = useState<number>(1);

  // Column crop configurations
  const [columns, setColumns] = useState<DocumentColumns>({
    date: { startX: 5, width: 15 },
    history: { startX: 22, width: 48 },
    value: { startX: 72, width: 23 },
  });

  // Row extraction settings
  const [rowMode, setRowMode] = useState<'auto' | 'manual'>('auto');
  const [gridStartY, setGridStartY] = useState<number>(240);
  const [gridRowHeight, setGridRowHeight] = useState<number>(35);
  const [gridRowCount, setGridRowCount] = useState<number>(8);

  // Detected rows for guides and cropping
  const [detectedRows, setDetectedRows] = useState<{ y: number; height: number }[]>([]);

  // Extracted rows shown in the table
  const [rows, setRows] = useState<ExtractedRow[]>([]);

  // Active text exclusion filters (keywords/phrases to automatically exclude rows)
  const [exclusionRules, setExclusionRules] = useState<string[]>([
    'SALDO ANTERIOR',
    'SALDO DO DIA',
    'SALDO ATUAL',
    'SALDO FINAL',
    'SALDO TOTAL DISPONÍVEL DIA'
  ]);
  
  // Navigation active tab: 'align' (PDF editor) | 'results' (tabela de recortes)
  const [activeTab, setActiveTab] = useState<'align' | 'results'>('align');
  
  // App states
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Automatically update grid rows if mode is manual or if dimensions change
  useEffect(() => {
    if (rowMode === 'manual' && activeCanvas) {
      const manualRows = Array.from({ length: gridRowCount }).map((_, i) => ({
        y: gridStartY + i * gridRowHeight,
        height: gridRowHeight,
      }));
      setDetectedRows(manualRows);
    }
  }, [rowMode, gridStartY, gridRowHeight, gridRowCount, activeCanvas]);

  // If in auto-mode and we have parsed text, update rows automatically
  useEffect(() => {
    if (rowMode === 'auto' && textItems.length > 0) {
      const parsedRows = detectRowsFromText(textItems, 10);
      setDetectedRows(parsedRows.map(r => ({ y: r.y, height: r.height })));
    }
  }, [rowMode, textItems]);

  // Handle loading a file (PDF or Image)
  const handleFileLoaded = async (file: File) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setOriginalFile(file);
    setRows([]);
    setActiveTab('align');
    setCropStartPct(10);
    setCropEndPct(90);

    try {
      if (file.type === 'application/pdf') {
        const allPages = await parseAndRenderAllPDFPages(file);
        
        if (allPages.length === 0) {
          throw new Error("Não foi possível carregar nenhuma página deste PDF.");
        }

        setPdfPages(allPages);
        setCurrentPage(1);
        setCropStartPage(1);
        setCropEndPage(allPages.length);

        const firstPage = allPages[0];
        setActiveCanvas(firstPage.canvas);
        setTextItems(firstPage.textItems);
        setMetadata({
          name: file.name,
          type: 'pdf',
          pageNumber: 1,
          totalPages: allPages.length,
          width: firstPage.width,
          height: firstPage.height,
        });
        setRowMode('auto');
        
        // Find if we have text rows
        const parsedRows = detectRowsFromText(firstPage.textItems, 10);
        setDetectedRows(parsedRows.map(r => ({ y: r.y, height: r.height })));

        // Set reasonable default column bounds in %
        setColumns({
          date: { startX: 5, width: 15 },
          history: { startX: 22, width: 48 },
          value: { startX: 72, width: 23 },
        });

        setSuccessMessage(`PDF carregado com sucesso! ${allPages.length} páginas disponíveis.`);
      } else {
        // Image loading
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              setActiveCanvas(canvas);
              setTextItems([]); // No text nodes for images
              setMetadata({
                name: file.name,
                type: 'image',
                pageNumber: 1,
                totalPages: 1,
                width: img.width,
                height: img.height,
              });

              setPdfPages([{
                pageNumber: 1,
                canvas,
                textItems: [],
                width: img.width,
                height: img.height
              }]);
              setCurrentPage(1);
              setCropStartPage(1);
              setCropEndPage(1);
              
              // Force manual grid mode since images have no direct text nodes
              setRowMode('manual');
              // Initialize reasonable starting coordinates for standard images
              setGridStartY(Math.round(img.height * 0.25));
              setGridRowHeight(Math.round(img.height * 0.04) || 35);
              setGridRowCount(10);

              setColumns({
                date: { startX: 5, width: 15 },
                history: { startX: 22, width: 48 },
                value: { startX: 72, width: 23 },
              });

              setSuccessMessage('Imagem carregada! Alinhamento manual de linhas ativado.');
            }
          };
          img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Erro ao carregar documento: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle changing PDF page (instantaneous from cached states)
  const handlePageChange = async (newPageNumber: number) => {
    const page = pdfPages.find(p => p.pageNumber === newPageNumber);
    if (!page) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    
    try {
      setCurrentPage(newPageNumber);
      setActiveCanvas(page.canvas);
      setTextItems(page.textItems);
      setMetadata(prev => prev ? {
        ...prev,
        pageNumber: newPageNumber,
        width: page.width,
        height: page.height,
      } : null);

      if (rowMode === 'auto') {
        const parsedRows = detectRowsFromText(page.textItems, 10);
        setDetectedRows(parsedRows.map(r => ({ y: r.y, height: r.height })));
      }
      setSuccessMessage(`Visualizando página ${newPageNumber}`);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Erro ao carregar página do PDF: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle loading sample document
  const handleLoadSample = () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setRows([]);
    setCropStartPct(10);
    setCropEndPct(90);

    try {
      const sample = generateMockStatement();
      setActiveCanvas(sample.canvas);
      setTextItems(sample.textElements);
      setColumns(sample.defaultColumns);
      setMetadata({
        name: 'extrato_exemplo_comercial.png',
        type: 'image', // Treated as an image canvas with virtual text
        pageNumber: 1,
        totalPages: 1,
        width: sample.canvas.width,
        height: sample.canvas.height,
      });

      const samplePage = {
        pageNumber: 1,
        canvas: sample.canvas,
        textItems: sample.textElements,
        width: sample.canvas.width,
        height: sample.canvas.height,
      };
      setPdfPages([samplePage]);
      setCurrentPage(1);
      setCropStartPage(1);
      setCropEndPage(1);

      setRowMode('auto');
      const parsedRows = detectRowsFromText(sample.textElements, 10);
      const rowCoords = parsedRows.map(r => ({ y: r.y, height: r.height }));
      setDetectedRows(rowCoords);

      // Auto crop immediately for sample so user sees results instantly!
      setTimeout(() => {
        // Filter rows by crop limits
        const startY = (10 / 100) * sample.canvas.height;
        const endY = (90 / 100) * sample.canvas.height;
        const filteredRows = rowCoords.filter(row => {
          const rowCenterY = row.y + row.height / 2;
          return rowCenterY >= startY && rowCenterY <= endY;
        });

        const extracted = extractDataFromCanvas(
          sample.canvas,
          sample.textElements,
          sample.defaultColumns,
          filteredRows,
          true
        );
        setRows(extracted);
        setActiveTab('results');
        setIsProcessing(false);
        setSuccessMessage('Extrato de exemplo carregado e recortado automaticamente!');
      }, 300);

    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Erro ao carregar exemplo: ${err.message || err}`);
      setIsProcessing(false);
    }
  };

  // Trigger the visual and textual cropping of rows (for current page)
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
        setErrorMessage(`A página atual (${currentPage}) está fora do intervalo de recorte selecionado (Pág. ${cropStartPage} até Pág. ${cropEndPage}).`);
        setIsProcessing(false);
        return;
      }

      // Filter rows that are within the crop boundaries (only applying delimiters to designated start/end pages)
      const startY = (currentPage === cropStartPage) ? (cropStartPct / 100) * activeCanvas.height : 0;
      const endY = (currentPage === cropEndPage) ? (cropEndPct / 100) * activeCanvas.height : activeCanvas.height;

      const filteredRows = detectedRows.filter(row => {
        const rowCenterY = row.y + row.height / 2;
        return rowCenterY >= startY && rowCenterY <= endY;
      });

      if (filteredRows.length === 0) {
        setErrorMessage('Nenhuma linha de transação está localizada dentro dos limites de recorte da página atual.');
        setIsProcessing(false);
        return;
      }

      const extracted = extractDataFromCanvas(
        activeCanvas,
        textItems, // empty if image
        columns,
        filteredRows,
        true
      );
      setRows(extracted);
      setActiveTab('results');
      setSuccessMessage(`Recorte concluído! ${extracted.length} transações extraídas com sucesso da página ${currentPage}.`);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Erro ao recortar colunas: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Apply crop to ALL rendered PDF pages
  const handleApplyCropAll = () => {
    if (pdfPages.length === 0) return;

    setIsProcessing(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      let allExtractedRows: ExtractedRow[] = [];

      pdfPages.forEach((page) => {
        const p = page.pageNumber;
        // Skip pages outside of active range
        if (p < cropStartPage || p > cropEndPage) {
          return;
        }

        // 1. Detect rows for this page
        let pageRows: { y: number; height: number }[] = [];
        if (rowMode === 'auto') {
          const parsed = detectRowsFromText(page.textItems, 10);
          pageRows = parsed.map(r => ({ y: r.y, height: r.height }));
        } else {
          // Manual grid coordinates (relative to height of first vs page? Let's use the current page heights)
          pageRows = Array.from({ length: gridRowCount }).map((_, i) => ({
            y: gridStartY + i * gridRowHeight,
            height: gridRowHeight,
          }));
        }

        // 2. Filter rows by crop boundaries
        const startY = (p === cropStartPage) ? (cropStartPct / 100) * page.height : 0;
        const endY = (p === cropEndPage) ? (cropEndPct / 100) * page.height : page.height;

        const filteredRows = pageRows.filter(row => {
          const rowCenterY = row.y + row.height / 2;
          return rowCenterY >= startY && rowCenterY <= endY;
        });

        // 3. Extract columns from page
        if (filteredRows.length > 0) {
          const extracted = extractDataFromCanvas(
            page.canvas,
            page.textItems,
            columns,
            filteredRows,
            true
          );
          allExtractedRows = [...allExtractedRows, ...extracted];
        }
      });

      if (allExtractedRows.length === 0) {
        setErrorMessage('Não foi possível extrair dados de nenhuma página utilizando as configurações atuais.');
        setIsProcessing(false);
        return;
      }

      setRows(allExtractedRows);
      setActiveTab('results');
      setSuccessMessage(`Extração em lote concluída! ${allExtractedRows.length} transações extraídas com sucesso das páginas ${cropStartPage} a ${cropEndPage}.`);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Erro ao recortar todas as páginas: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportCsv = () => {
    if (rows.length === 0) return;
    try {
      // Filter out rows matching the active exclusion rules
      const filteredRows = rows.filter(row => {
        const textToSearch = [
          row.dateText || '',
          row.historyText || '',
          row.valueText || ''
        ].join(' ').toUpperCase();
        
        return !exclusionRules.some(rule => {
          if (!rule.trim()) return false;
          return textToSearch.includes(rule.trim().toUpperCase());
        });
      });

      exportToCSV(filteredRows, `recortes_${metadata?.name.split('.')[0] || 'extrato'}.csv`);
      setSuccessMessage('Arquivo CSV/Excel exportado com sucesso! Pronto para abrir no Excel.');
    } catch (err: any) {
      setErrorMessage(`Erro ao exportar dados: ${err.message}`);
    }
  };

  const handleClearAll = () => {
    setRows([]);
    setSuccessMessage('Tabela limpa com sucesso.');
  };

  // Dismiss message banners
  useEffect(() => {
    if (successMessage || errorMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage, errorMessage]);

  return (
    <div className="min-h-screen bg-[#0A0C10] font-sans text-slate-300 flex flex-col antialiased selection:bg-indigo-500/15">
      {/* Dynamic Notifications */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full">
        {successMessage && (
          <div className="flex items-start gap-3 bg-[#0F1117] border border-emerald-900/40 shadow-2xl rounded-2xl p-4 text-emerald-400 animate-slide-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div className="flex-1">
              <h5 className="font-bold text-xs text-white">Sucesso</h5>
              <p className="text-[11px] text-slate-400 leading-normal mt-0.5">{successMessage}</p>
            </div>
          </div>
        )}
        {errorMessage && (
          <div className="flex items-start gap-3 bg-[#0F1117] border border-rose-900/40 shadow-2xl rounded-2xl p-4 text-rose-400 animate-slide-in">
            <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <div className="flex-1">
              <h5 className="font-bold text-xs text-white">Erro</h5>
              <p className="text-[11px] text-slate-400 leading-normal mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}
      </div>

      {/* Main Header */}
      <header className="bg-[#0F1117] border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 text-white flex items-center justify-center rounded font-bold text-lg tracking-tight">
              P
            </div>
            <div>
              <h1 className="font-semibold text-white text-base tracking-tight">ExtractFlow <span className="text-indigo-400 font-normal">v2.4</span></h1>
              <p className="text-[9px] text-slate-500 font-medium">Extração de colunas por recorte visual sem uso de IA</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-slate-800 text-slate-400 font-mono px-2.5 py-1 rounded-md border border-slate-700/50">
              Offline-Safe • 100% Determinístico
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 flex flex-col gap-6">
        
        {/* Navigation Tabs */}
        {activeCanvas && (
          <div className="flex border-b border-slate-850 gap-1 select-none mb-2">
            <button
              onClick={() => setActiveTab('align')}
              className={`px-6 py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'align'
                  ? 'border-indigo-500 text-white bg-indigo-950/15'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900/10'
              }`}
            >
              <Sliders className="w-4 h-4 text-indigo-400" />
              1. Alinhamento & Colunas (Ver PDF)
            </button>
            <button
              onClick={() => setActiveTab('results')}
              className={`px-6 py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'results'
                  ? 'border-indigo-500 text-white bg-indigo-950/15'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900/10'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-indigo-400" />
              2. Tabela de Resultados (Apenas Recortes)
              {rows.length > 0 && (
                <span className="bg-indigo-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full ml-1 animate-pulse">
                  {rows.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* If NO document is loaded, show step 1 on full width or left column */}
        {!activeCanvas ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start animate-fade-in">
            <div className="md:col-span-1 bg-[#0F1117] border border-slate-800 rounded-2xl p-6 shadow-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">1</span>
                Importar Arquivo
              </h3>
              <Uploader
                onFileLoaded={handleFileLoaded}
                onLoadSample={handleLoadSample}
                metadata={metadata}
                isProcessing={isProcessing}
                onPageChange={handlePageChange}
              />
            </div>
            <div className="md:col-span-2 bg-[#0F1117]/50 border border-slate-800/80 rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
              <div className="w-16 h-16 bg-[#0A0C10] text-indigo-500 border border-slate-800 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">Primeiro Passo: Carregar Extrato</h2>
              <p className="text-slate-400 text-sm max-w-md leading-relaxed mb-6">
                Carregue um arquivo de extrato bancário em formato PDF ou imagem para iniciar. Você também pode testar usando um extrato comercial clicando no botão abaixo.
              </p>
              <button
                onClick={handleLoadSample}
                disabled={isProcessing}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                Iniciar com Extrato de Exemplo
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tab 1: Alinhador & PDF */}
            {activeTab === 'align' && (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start animate-fade-in">
                {/* Left Controls Sidebar */}
                <div className="lg:col-span-1 flex flex-col gap-6">
                  {/* Step 1: Upload */}
                  <div className="bg-[#0F1117] border border-slate-800 rounded-2xl p-5 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">1</span>
                      Importar Arquivo
                    </h3>
                    <Uploader
                      onFileLoaded={handleFileLoaded}
                      onLoadSample={handleLoadSample}
                      metadata={metadata}
                      isProcessing={isProcessing}
                      onPageChange={handlePageChange}
                    />
                  </div>

                  {/* Step 2: Line Adjustments */}
                  <div className="bg-[#0F1117] border border-slate-800 rounded-2xl p-5 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                      <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">2</span>
                      Grade de Linhas
                    </h3>

                    <div className="flex flex-col gap-4">
                      {/* Mode Selector */}
                      <div className="flex bg-[#0A0C10] p-1 rounded-xl border border-slate-800">
                        <button
                          disabled={metadata?.type === 'image' && textItems.length === 0}
                          onClick={() => setRowMode('auto')}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            rowMode === 'auto'
                              ? 'bg-slate-800 text-white shadow-sm'
                              : 'text-slate-500 hover:text-slate-350 disabled:opacity-40 disabled:hover:text-slate-500'
                          }`}
                        >
                          Automático (PDF)
                        </button>
                        <button
                          onClick={() => setRowMode('manual')}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            rowMode === 'manual'
                              ? 'bg-slate-800 text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-300'
                          }`}
                        >
                          Manual (Grid)
                        </button>
                      </div>

                      {rowMode === 'auto' ? (
                        <div className="bg-indigo-950/25 border border-indigo-900/30 rounded-xl p-3 text-slate-300 text-[11px] leading-relaxed">
                          O sistema leu a estrutura de texto nativa do arquivo e detectou automaticamente <strong className="text-indigo-400 font-semibold">{detectedRows.length} linhas</strong> de transações.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4">
                          {/* Grid Start Y */}
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <label className="font-semibold text-slate-300">Início do Extrato (Y)</label>
                              <span className="font-mono text-slate-500 font-semibold">{gridStartY}px</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max={metadata ? metadata.height : 1000}
                              value={gridStartY}
                              onChange={(e) => setGridStartY(Number(e.target.value))}
                              className="w-full accent-indigo-500 cursor-ew-resize bg-slate-800 h-1.5 rounded-lg appearance-none"
                            />
                          </div>

                          {/* Row Height */}
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <label className="font-semibold text-slate-300">Altura das Linhas</label>
                              <span className="font-mono text-slate-500 font-semibold">{gridRowHeight}px</span>
                            </div>
                            <input
                              type="range"
                              min="15"
                              max="150"
                              value={gridRowHeight}
                              onChange={(e) => setGridRowHeight(Number(e.target.value))}
                              className="w-full accent-indigo-500 cursor-ew-resize bg-slate-800 h-1.5 rounded-lg appearance-none"
                            />
                          </div>

                          {/* Row Count */}
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <label className="font-semibold text-slate-300">Quantidade de Linhas</label>
                              <span className="font-mono text-slate-500 font-semibold">{gridRowCount} linhas</span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="40"
                              value={gridRowCount}
                              onChange={(e) => setGridRowCount(Number(e.target.value))}
                              className="w-full accent-indigo-500 cursor-ew-resize bg-slate-800 h-1.5 rounded-lg appearance-none"
                            />
                          </div>
                        </div>
                      )}

                      {/* Helpers */}
                      <div className="flex items-start gap-1.5 p-2.5 bg-[#0A0C10] border border-slate-800 rounded-xl text-[10px] text-slate-400 leading-normal">
                        <Sliders className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                        <span>Os recortes visuais serão gerados aplicando estas linhas de grade sobre as faixas de colunas definidas.</span>
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Cropping Delimiters */}
                  <div className="bg-[#0F1117] border border-slate-800 rounded-2xl p-5 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                      <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">3</span>
                      Limites de Recorte (%)
                    </h3>

                    <div className="flex flex-col gap-4">
                      {/* Crop Start Slider */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <label className="font-semibold text-slate-300 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                            Início (Corte Superior)
                          </label>
                          <span className="font-mono text-orange-400 font-semibold">{cropStartPct}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max={cropStartPage === cropEndPage ? Math.max(0, cropEndPct - 2) : 100}
                          value={cropStartPct}
                          onChange={(e) => setCropStartPct(Number(e.target.value))}
                          className="w-full accent-orange-500 cursor-ew-resize bg-slate-800 h-1.5 rounded-lg appearance-none"
                        />
                      </div>

                      {/* Crop End Slider */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <label className="font-semibold text-slate-300 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                            Fim (Corte Inferior)
                          </label>
                          <span className="font-mono text-rose-400 font-semibold">{cropEndPct}%</span>
                        </div>
                        <input
                          type="range"
                          min={cropStartPage === cropEndPage ? Math.min(100, cropStartPct + 2) : 0}
                          max="100"
                          value={cropEndPct}
                          onChange={(e) => setCropEndPct(Number(e.target.value))}
                          className="w-full accent-rose-500 cursor-ew-resize bg-slate-800 h-1.5 rounded-lg appearance-none"
                        />
                      </div>

                      <div className="text-[10px] text-slate-400 leading-normal bg-[#0A0C10] p-2.5 border border-slate-850 rounded-xl">
                        Todas as linhas localizadas nas áreas escurecidas (cabeçalhos ou rodapés) serão excluídas do processamento automático.
                      </div>
                    </div>
                  </div>

                  {/* Column Width Status Panel */}
                  <div className="bg-[#0F1117] border border-slate-800 rounded-2xl p-5 shadow-sm text-xs">
                    <h4 className="font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                      <Columns className="w-3.5 h-3.5 text-slate-500" />
                      Mapeamento (%)
                    </h4>
                    <div className="flex flex-col gap-2 font-mono">
                      <div className="flex justify-between items-center bg-blue-950/20 text-blue-400 px-2.5 py-1.5 rounded-lg border border-blue-900/30">
                        <span className="font-semibold">Data:</span>
                        <span>De {columns.date.startX}% até {(columns.date.startX + columns.date.width).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between items-center bg-purple-950/20 text-purple-400 px-2.5 py-1.5 rounded-lg border border-purple-900/30">
                        <span className="font-semibold">Histórico:</span>
                        <span>De {columns.history.startX}% até {(columns.history.startX + columns.history.width).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between items-center bg-emerald-950/20 text-emerald-400 px-2.5 py-1.5 rounded-lg border border-emerald-900/30">
                        <span className="font-semibold">Valor:</span>
                        <span>De {columns.value.startX}% até {(columns.value.startX + columns.value.width).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Central Workspace (The Interactive Canvas / Aligner) */}
                <div className="lg:col-span-3 h-full flex flex-col gap-6">
                  <Workspace
                    canvasElement={activeCanvas}
                    columns={columns}
                    setColumns={setColumns}
                    detectedRowYs={detectedRows}
                    isProcessing={isProcessing}
                    onApplyCrop={handleApplyCrop}
                    onApplyCropAll={handleApplyCropAll}
                    docType={metadata?.type || 'sample'}
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
            )}

            {/* Tab 2: Tabela de Resultados (Foco nos Recortes) */}
            {activeTab === 'results' && (
              <div className="w-full animate-fade-in flex flex-col gap-6">
                <div className="flex justify-between items-center bg-[#0F1117] p-4 border border-slate-850 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Arquivo em Análise</p>
                      <p className="text-xs font-semibold text-white">{metadata?.name} ({metadata?.type === 'pdf' ? 'Nativo PDF' : 'Imagem'})</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab('align')}
                      className="px-4 py-2 bg-[#0A0C10] hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-bold text-slate-300 transition-colors cursor-pointer"
                    >
                      Ajustar Alinhamento & Colunas
                    </button>
                  </div>
                </div>

                <div id="results-section" className="w-full">
                  <TableViewer
                    rows={rows}
                    setRows={setRows}
                    onExportCsv={handleExportCsv}
                    onClearAll={handleClearAll}
                    exclusionRules={exclusionRules}
                    setExclusionRules={setExclusionRules}
                  />
                </div>
              </div>
            )}
          </>
        )}

      </main>

      {/* Footer credit */}
      <footer className="bg-[#0F1117] border-t border-slate-800 py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap justify-between items-center gap-4">
          <p>© 2026 ExtractFlow. Execução 100% cliente-side e segura.</p>
          <div className="flex items-center gap-4 font-medium text-slate-400">
            <span>Desenvolvido sem IA</span>
            <span>•</span>
            <span>Suporte a PDF e Imagem</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
