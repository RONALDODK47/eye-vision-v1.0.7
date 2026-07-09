/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { ColumnRange, DocumentColumns } from '../types';
import { Maximize2, Move, HelpCircle, RefreshCw, Layers, Files, FileSpreadsheet } from 'lucide-react';

interface WorkspaceProps {
  canvasElement: HTMLCanvasElement | null;
  columns: DocumentColumns;
  setColumns: React.Dispatch<React.SetStateAction<DocumentColumns>>;
  detectedRowYs: { y: number; height: number }[];
  isProcessing: boolean;
  onApplyCrop: () => void;
  onApplyCropAll?: () => void;
  docType: 'pdf' | 'image' | 'sample';
  
  // Crop limit lines
  cropStartPct: number;
  setCropStartPct: (pct: number) => void;
  cropEndPct: number;
  setCropEndPct: (pct: number) => void;
  
  // Pages state
  pdfPages?: { pageNumber: number; canvas: HTMLCanvasElement; textItems: any[]; width: number; height: number }[];
  currentPage?: number;
  onSelectPage?: (pageNumber: number) => void;
  cropStartPage: number;
  setCropStartPage: (page: number) => void;
  cropEndPage: number;
  setCropEndPage: (page: number) => void;
}

type DragType = 'move' | 'resize-left' | 'resize-right' | 'drag-h-start' | 'drag-h-end' | null;
type DraggedColumn = 'date' | 'history' | 'value' | 'h-start' | 'h-end' | null;

export default function Workspace({
  canvasElement,
  columns,
  setColumns,
  detectedRowYs,
  isProcessing,
  onApplyCrop,
  onApplyCropAll,
  docType,
  cropStartPct,
  setCropStartPct,
  cropEndPct,
  setCropEndPct,
  pdfPages = [],
  currentPage = 1,
  onSelectPage,
  cropStartPage,
  setCropStartPage,
  cropEndPage,
  setCropEndPage,
}: WorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasDisplayRef = useRef<HTMLCanvasElement>(null);

  const [draggedCol, setDraggedCol] = useState<DraggedColumn>(null);
  const [dragType, setDragType] = useState<DragType>(null);
  const [startX, setStartX] = useState<number>(0);
  const [startY, setStartY] = useState<number>(0);
  const [startColState, setStartColState] = useState<ColumnRange | null>(null);
  const [startHState, setStartHState] = useState<number>(0);
  const [showGuides, setShowGuides] = useState<boolean>(true);

  // Render original canvas onto our display canvas with correct fitting
  useEffect(() => {
    if (!canvasElement || !canvasDisplayRef.current) return;

    const displayCanvas = canvasDisplayRef.current;
    const ctx = displayCanvas.getContext('2d');
    if (!ctx) return;

    // Set internal dimensions equal to the source canvas
    displayCanvas.width = canvasElement.width;
    displayCanvas.height = canvasElement.height;

    // Draw the source canvas content
    ctx.drawImage(canvasElement, 0, 0);
  }, [canvasElement]);

  const handleMouseDown = (
    e: React.MouseEvent | React.TouchEvent,
    columnKey: 'date' | 'history' | 'value' | 'h-start' | 'h-end',
    type: DragType
  ) => {
    e.stopPropagation();
    e.preventDefault();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setDraggedCol(columnKey);
    setDragType(type);
    setStartX(clientX);
    setStartY(clientY);

    if (columnKey === 'h-start') {
      setStartHState(cropStartPct);
    } else if (columnKey === 'h-end') {
      setStartHState(cropEndPct);
    } else {
      setStartColState({ ...columns[columnKey as 'date' | 'history' | 'value'] });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      if (!draggedCol || !dragType || !containerRef.current) return;

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const containerRect = containerRef.current.getBoundingClientRect();

      if (draggedCol === 'h-start' || draggedCol === 'h-end') {
        const deltaYPixels = clientY - startY;
        const deltaYPercent = (deltaYPixels / containerRect.height) * 100;
        
        const isSamePage = cropStartPage === cropEndPage;
        if (draggedCol === 'h-start') {
          const maxLimit = isSamePage ? cropEndPct - 2 : 100;
          const newPct = Math.max(0, Math.min(maxLimit, startHState + deltaYPercent));
          setCropStartPct(Number(newPct.toFixed(2)));
        } else {
          const minLimit = isSamePage ? cropStartPct + 2 : 0;
          const newPct = Math.max(minLimit, Math.min(100, startHState + deltaYPercent));
          setCropEndPct(Number(newPct.toFixed(2)));
        }
      } else {
        if (!startColState) return;
        const deltaXPixels = clientX - startX;
        const deltaXPercent = (deltaXPixels / containerRect.width) * 100;

        setColumns((prev) => {
          const col = prev[draggedCol as 'date' | 'history' | 'value'];
          let newStartX = col.startX;
          let newWidth = col.width;

          if (dragType === 'move') {
            newStartX = Math.max(0, Math.min(100 - col.width, startColState.startX + deltaXPercent));
          } else if (dragType === 'resize-left') {
            const maxLeft = startColState.startX + startColState.width - 2; // minimum width of 2%
            newStartX = Math.max(0, Math.min(maxLeft, startColState.startX + deltaXPercent));
            newWidth = Math.max(2, startColState.width - (newStartX - startColState.startX));
          } else if (dragType === 'resize-right') {
            newWidth = Math.max(2, Math.min(100 - col.startX, startColState.width + deltaXPercent));
          }

          return {
            ...prev,
            [draggedCol]: {
              startX: Number(newStartX.toFixed(2)),
              width: Number(newWidth.toFixed(2)),
            },
          };
        });
      }
    };

    const handleMouseUp = () => {
      setDraggedCol(null);
      setDragType(null);
      setStartColState(null);
    };

    if (draggedCol) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove, { passive: false });
      window.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [draggedCol, dragType, startX, startY, startColState, startHState, cropStartPct, cropEndPct, setColumns, setCropStartPct, setCropEndPct]);

  const columnStyles = {
    date: {
      color: 'border-blue-500 bg-blue-500/15 text-blue-400',
      tag: 'bg-blue-600 text-white border-blue-700',
      bg: 'blue',
    },
    history: {
      color: 'border-purple-500 bg-purple-500/15 text-purple-400',
      tag: 'bg-purple-600 text-white border-purple-700',
      bg: 'purple',
    },
    value: {
      color: 'border-emerald-500 bg-emerald-500/15 text-emerald-400',
      tag: 'bg-emerald-600 text-white border-emerald-700',
      bg: 'emerald',
    },
  };

  return (
    <div id="workspace-card" className="flex flex-col bg-[#0F1117] rounded-2xl border border-slate-800 shadow-xl overflow-hidden h-full">
      {/* Workspace Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-[#0F1117] border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-slate-400" />
          <h2 className="font-semibold text-slate-100 text-base">Alinhador & Recortador</h2>
          <span className="text-xs bg-slate-800 text-slate-400 font-mono px-2 py-0.5 rounded border border-slate-700/50">
            {docType === 'pdf' ? `Pág. ${currentPage} de ${pdfPages.length}` : docType === 'image' ? 'Imagem' : 'Exemplo'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showGuides}
              onChange={(e) => setShowGuides(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
            />
            Guias de Linhas
          </label>

          <div className="flex items-center gap-2">
            {/* Crop All Pages (only if PDF and > 1 page exists) - This is the primary button now! */}
            {pdfPages && pdfPages.length > 1 && onApplyCropAll ? (
              <>
                <button
                  id="apply-crop-all-btn"
                  onClick={onApplyCropAll}
                  disabled={isProcessing}
                  className="flex items-center gap-1.5 px-4.5 py-2.5 bg-indigo-650 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 border border-indigo-500/30 transition-all duration-150 disabled:bg-slate-850 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
                >
                  <Files className="w-3.5 h-3.5" />
                  Recortar Todas as Páginas
                </button>

                {/* Secondary Option: Crop current page only */}
                <button
                  id="apply-crop-btn"
                  onClick={onApplyCrop}
                  disabled={isProcessing || !canvasElement}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-850 hover:bg-slate-800 text-slate-350 rounded-xl text-xs font-semibold border border-slate-750 transition-all duration-150 disabled:bg-slate-900 disabled:text-slate-600 disabled:border-transparent disabled:cursor-not-allowed cursor-pointer"
                  title={`Processar apenas a página atual (Pág. ${currentPage})`}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  Recortar Pág. {currentPage}
                </button>
              </>
            ) : (
              /* For single-page documents */
              <button
                id="apply-crop-btn"
                onClick={onApplyCrop}
                disabled={isProcessing || !canvasElement}
                className="flex items-center gap-1.5 px-4.5 py-2.5 bg-indigo-650 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 border border-indigo-500/30 transition-all duration-150 disabled:bg-slate-850 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5" />
                    Recortar Documento
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Workspace split: sidebar for pages, right for interactive canvas */}
      <div className="flex-1 flex flex-col md:flex-row min-h-[450px] overflow-hidden bg-[#0A0C10]">
        
        {/* PDF Vertical Scrollbar Sidebar */}
        {pdfPages && pdfPages.length > 1 && (
          <div className="w-full md:w-44 border-b md:border-b-0 md:border-r border-slate-850 p-4 flex flex-col gap-3 bg-[#0D0F14] flex-shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Files className="w-3.5 h-3.5" />
                Páginas do PDF
              </span>
              <span className="text-[9px] bg-indigo-950/40 text-indigo-400 font-mono px-1.5 py-0.5 rounded border border-indigo-900/30 font-bold">
                {pdfPages.length} pág.
              </span>
            </div>
            <div className="flex md:flex-col gap-3.5 overflow-x-auto md:overflow-y-auto max-h-[160px] md:max-h-[600px] pr-1 pb-2 md:pb-0 scrollbar-thin">
              {pdfPages.map((page) => (
                <PageThumbnail
                  key={`thumb-${page.pageNumber}`}
                  canvas={page.canvas}
                  pageNumber={page.pageNumber}
                  isActive={currentPage === page.pageNumber}
                  onClick={() => onSelectPage && onSelectPage(page.pageNumber)}
                  cropStartPct={cropStartPct}
                  cropEndPct={cropEndPct}
                  cropStartPage={cropStartPage}
                  cropEndPage={cropEndPage}
                />
              ))}
            </div>
          </div>
        )}

        {/* Central interactive canvas */}
        <div className="flex-1 overflow-auto p-6 flex flex-col items-center justify-start gap-4">
          {pdfPages && pdfPages.length > 1 && (
            <div className="flex flex-col items-center justify-center gap-4 bg-[#0F1117] border border-slate-850 rounded-2xl p-4 w-full max-w-[800px] shadow-lg text-center">
              <div className="flex flex-col items-center gap-1.5 w-full">
                <span className="text-xs font-bold text-slate-200 flex items-center justify-center gap-2">
                  <Files className="w-4 h-4 text-indigo-400" />
                  Mapeamento de Páginas para Extração
                </span>
                <span className="text-[11px] text-slate-400 leading-normal max-w-md">
                  Defina o início (filtra cabeçalho) e o fim (filtra rodapé) digitando ou clicando nas páginas abaixo:
                </span>
                
                {/* Inputs diretos para digitar o número da página */}
                <div className="flex items-center gap-4 mt-1 bg-slate-950/60 p-2.5 rounded-xl border border-slate-900/50 w-fit">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-orange-400 font-bold flex items-center gap-1">
                      📍 Pág. Início:
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={pdfPages.length}
                      value={cropStartPage}
                      onChange={(e) => {
                        let val = parseInt(e.target.value) || 1;
                        if (val < 1) val = 1;
                        if (val > pdfPages.length) val = pdfPages.length;
                        setCropStartPage(val);
                        if (val > cropEndPage) {
                          setCropEndPage(val);
                        }
                      }}
                      className="w-14 h-8 px-1.5 bg-slate-900 border border-slate-800 text-slate-200 rounded-lg text-xs font-mono font-bold focus:outline-none focus:border-orange-500 text-center"
                    />
                  </div>
                  <div className="h-5 w-[1px] bg-slate-800" />
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-rose-400 font-bold flex items-center gap-1">
                      🏁 Pág. Fim:
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={pdfPages.length}
                      value={cropEndPage}
                      onChange={(e) => {
                        let val = parseInt(e.target.value) || 1;
                        if (val < 1) val = 1;
                        if (val > pdfPages.length) val = pdfPages.length;
                        setCropEndPage(val);
                        if (val < cropStartPage) {
                          setCropStartPage(val);
                        }
                      }}
                      className="w-14 h-8 px-1.5 bg-slate-900 border border-slate-800 text-slate-200 rounded-lg text-xs font-mono font-bold focus:outline-none focus:border-rose-500 text-center"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {canvasElement ? (
            <div className="relative shadow-2xl rounded-lg border border-slate-800 bg-[#0F1117] max-w-full select-none" style={{ width: '100%', maxWidth: '800px' }}>
              
              {/* Draggable Bands & Lines Layer */}
              <div
                ref={containerRef}
                className="absolute inset-0 z-20 pointer-events-auto"
              >
                {/* Full dark overlay if page is excluded from the active range */}
                {pdfPages && pdfPages.length > 1 && (currentPage < cropStartPage || currentPage > cropEndPage) && (
                  <div className="absolute inset-0 bg-[#08090C]/90 backdrop-blur-[1.5px] flex flex-col items-center justify-center text-center p-6 z-40 rounded-lg">
                    <span className="text-sm font-extrabold text-slate-400 mb-2 flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 shadow-md">
                      🚫 PÁGINA FORA DO INTERVALO
                    </span>
                    <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                      Esta página está ignorada porque o intervalo do extrato está configurado para ir da <strong>Página {cropStartPage}</strong> até a <strong>Página {cropEndPage}</strong>.
                    </p>
                    <p className="text-[10px] text-indigo-400 mt-3 font-semibold">
                      Use os botões acima para ajustar o intervalo se necessário!
                    </p>
                  </div>
                )}

                {/* Visual shade overlay for Top Inactive Zone (Only on Start Page) */}
                {currentPage === cropStartPage && (
                  <div
                    style={{
                      top: 0,
                      height: `${cropStartPct}%`,
                    }}
                    className="absolute inset-x-0 bg-[#08090C]/80 pointer-events-none border-b border-orange-500/30 backdrop-blur-[0.5px] z-10 transition-all duration-100"
                  />
                )}

                {/* Visual shade overlay for Bottom Inactive Zone (Only on End Page) */}
                {currentPage === cropEndPage && (
                  <div
                    style={{
                      top: `${cropEndPct}%`,
                      bottom: 0,
                    }}
                    className="absolute inset-x-0 bg-[#08090C]/80 pointer-events-none border-t border-rose-500/30 backdrop-blur-[0.5px] z-10 transition-all duration-100"
                  />
                )}

                {/* Horizontal Delimiter - START LINE (Only on Start Page) */}
                {currentPage === cropStartPage && (
                  <div
                    style={{
                      top: `${cropStartPct}%`,
                    }}
                    className="absolute inset-x-0 h-1 bg-orange-500 hover:bg-orange-400 group/hstart z-30 cursor-ns-resize transition-all duration-75 flex items-center justify-start"
                    onMouseDown={(e) => handleMouseDown(e, 'h-start', 'drag-h-start')}
                    onTouchStart={(e) => handleMouseDown(e, 'h-start', 'drag-h-start')}
                  >
                    <div className="absolute left-6 -top-3 px-2 py-0.5 bg-orange-600 border border-orange-500 text-white rounded text-[9px] font-mono font-bold tracking-wider shadow-md flex items-center gap-1 select-none pointer-events-none">
                      <Move className="w-2.5 h-2.5 rotate-90" />
                      DELIMITADOR INÍCIO DO RECORTE ({cropStartPct.toFixed(0)}%)
                    </div>
                  </div>
                )}

                {/* Horizontal Delimiter - END LINE (Only on End Page) */}
                {currentPage === cropEndPage && (
                  <div
                    style={{
                      top: `${cropEndPct}%`,
                    }}
                    className="absolute inset-x-0 h-1 bg-rose-500 hover:bg-rose-400 group/hend z-30 cursor-ns-resize transition-all duration-75 flex items-center justify-end"
                    onMouseDown={(e) => handleMouseDown(e, 'h-end', 'drag-h-end')}
                    onTouchStart={(e) => handleMouseDown(e, 'h-end', 'drag-h-end')}
                  >
                    <div className="absolute right-6 -top-3 px-2 py-0.5 bg-rose-600 border border-rose-500 text-white rounded text-[9px] font-mono font-bold tracking-wider shadow-md flex items-center gap-1 select-none pointer-events-none">
                      <Move className="w-2.5 h-2.5 rotate-90" />
                      DELIMITADOR FIM DO RECORTE ({cropEndPct.toFixed(0)}%)
                    </div>
                  </div>
                )}

                {/* Date Band */}
                <div
                  style={{
                    left: `${columns.date.startX}%`,
                    width: `${columns.date.width}%`,
                  }}
                  className={`absolute inset-y-0 border-x-2 border-dashed ${columnStyles.date.color} flex flex-col justify-between group transition-shadow duration-150 hover:shadow-lg`}
                >
                  {/* Header label */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, 'date', 'move')}
                    onTouchStart={(e) => handleMouseDown(e, 'date', 'move')}
                    className={`absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1 ${columnStyles.date.tag} px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider shadow-md cursor-grab active:cursor-grabbing border whitespace-nowrap z-30`}
                  >
                    <Move className="w-2.5 h-2.5" />
                    DATA
                  </div>

                  {/* Resize Left Handle */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, 'date', 'resize-left')}
                    onTouchStart={(e) => handleMouseDown(e, 'date', 'resize-left')}
                    className="absolute inset-y-0 -left-1 w-2 cursor-ew-resize bg-blue-500/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-30"
                  >
                    <div className="w-1 h-8 bg-blue-500 rounded-full" />
                  </div>

                  {/* Resize Right Handle */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, 'date', 'resize-right')}
                    onTouchStart={(e) => handleMouseDown(e, 'date', 'resize-right')}
                    className="absolute inset-y-0 -right-1 w-2 cursor-ew-resize bg-blue-500/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-30"
                  >
                    <div className="w-1 h-8 bg-blue-500 rounded-full" />
                  </div>
                </div>

                {/* History Band */}
                <div
                  style={{
                    left: `${columns.history.startX}%`,
                    width: `${columns.history.width}%`,
                  }}
                  className={`absolute inset-y-0 border-x-2 border-dashed ${columnStyles.history.color} flex flex-col justify-between group transition-shadow duration-150 hover:shadow-lg`}
                >
                  {/* Header label */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, 'history', 'move')}
                    onTouchStart={(e) => handleMouseDown(e, 'history', 'move')}
                    className={`absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1 ${columnStyles.history.tag} px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider shadow-md cursor-grab active:cursor-grabbing border whitespace-nowrap z-30`}
                  >
                    <Move className="w-2.5 h-2.5" />
                    HISTÓRICO
                  </div>

                  {/* Resize Left Handle */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, 'history', 'resize-left')}
                    onTouchStart={(e) => handleMouseDown(e, 'history', 'resize-left')}
                    className="absolute inset-y-0 -left-1 w-2 cursor-ew-resize bg-purple-500/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-30"
                  >
                    <div className="w-1 h-8 bg-purple-500 rounded-full" />
                  </div>

                  {/* Resize Right Handle */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, 'history', 'resize-right')}
                    onTouchStart={(e) => handleMouseDown(e, 'history', 'resize-right')}
                    className="absolute inset-y-0 -right-1 w-2 cursor-ew-resize bg-purple-500/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-30"
                  >
                    <div className="w-1 h-8 bg-purple-500 rounded-full" />
                  </div>
                </div>

                {/* Value Band */}
                <div
                  style={{
                    left: `${columns.value.startX}%`,
                    width: `${columns.value.width}%`,
                  }}
                  className={`absolute inset-y-0 border-x-2 border-dashed ${columnStyles.value.color} flex flex-col justify-between group transition-shadow duration-150 hover:shadow-lg`}
                >
                  {/* Header label */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, 'value', 'move')}
                    onTouchStart={(e) => handleMouseDown(e, 'value', 'move')}
                    className={`absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1 ${columnStyles.value.tag} px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider shadow-md cursor-grab active:cursor-grabbing border whitespace-nowrap z-30`}
                  >
                    <Move className="w-2.5 h-2.5" />
                    VALOR
                  </div>

                  {/* Resize Left Handle */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, 'value', 'resize-left')}
                    onTouchStart={(e) => handleMouseDown(e, 'value', 'resize-left')}
                    className="absolute inset-y-0 -left-1 w-2 cursor-ew-resize bg-emerald-500/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-30"
                  >
                    <div className="w-1 h-8 bg-emerald-50 rounded-full" />
                  </div>

                  {/* Resize Right Handle */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, 'value', 'resize-right')}
                    onTouchStart={(e) => handleMouseDown(e, 'value', 'resize-right')}
                    className="absolute inset-y-0 -right-1 w-2 cursor-ew-resize bg-emerald-500/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-30"
                  >
                    <div className="w-1 h-8 bg-emerald-550 rounded-full" />
                  </div>
                </div>

                {/* Horizontal Row Guides Overlay */}
                {showGuides && detectedRowYs.map((row, i) => {
                  if (!canvasDisplayRef.current) return null;
                  const rowCenterY = row.y + row.height / 2;
                  const startY = (cropStartPct / 100) * canvasDisplayRef.current.height;
                  const endY = (cropEndPct / 100) * canvasDisplayRef.current.height;
                  const isFilteredOut = rowCenterY < startY || rowCenterY > endY;

                  const pctY = (row.y / canvasDisplayRef.current.height) * 100;
                  const pctH = (row.height / canvasDisplayRef.current.height) * 100;
                  
                  return (
                    <div
                      key={`guide-${i}`}
                      style={{
                        top: `${pctY}%`,
                        height: `${pctH}%`,
                      }}
                      className={`absolute inset-x-0 border-y border-dashed flex items-center justify-end pointer-events-none transition-opacity ${
                        isFilteredOut 
                          ? 'border-slate-600/10 bg-transparent opacity-20' 
                          : 'border-rose-500/25 bg-rose-500/[0.015]'
                      }`}
                    >
                      <span className="text-[7px] bg-slate-800 text-slate-400 font-mono px-1 rounded-l opacity-30">
                        Linha {i + 1} {isFilteredOut && '(Excluída)'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Document display Canvas */}
              <canvas
                ref={canvasDisplayRef}
                className="block w-full h-auto rounded-lg"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-800 rounded-2xl bg-[#0F1117] max-w-md">
              <div className="w-12 h-12 bg-slate-900 text-slate-400 flex items-center justify-center rounded-2xl mb-4 border border-slate-850 shadow-sm">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-slate-200 text-sm mb-1.5">Nenhum Documento Carregado</h3>
              <p className="text-slate-400 text-xs leading-relaxed mb-4">
                Por favor, faça upload de um extrato em PDF ou imagem no painel lateral ou use o nosso extrato de exemplo para testar as ferramentas de recorte.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Workspace Footer instructions */}
      <div className="px-6 py-3.5 bg-[#0F1117] border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <span>
            <strong>Processamento Inteligente:</strong> Os delimitadores (<span className="text-orange-400 font-bold">Início</span> e <span className="text-rose-400 font-semibold">Fim</span>) aplicam-se respectivamente apenas às páginas inicial e final do extrato para filtrar cabeçalhos/rodapés.
          </span>
        </div>
        {pdfPages && pdfPages.length > 1 && (
          <div className="text-[10px] bg-indigo-950/25 text-indigo-400 border border-indigo-900/50 px-2.5 py-1 rounded-lg font-semibold shadow-inner">
            Selecione o intervalo de páginas desejado e clique em <strong>Recortar Todas as Páginas</strong>!
          </div>
        )}
      </div>
    </div>
  );
}

interface PageThumbnailProps {
  key?: string;
  canvas: HTMLCanvasElement;
  pageNumber: number;
  isActive: boolean;
  onClick: () => void;
  cropStartPct: number;
  cropEndPct: number;
  cropStartPage: number;
  cropEndPage: number;
}

function PageThumbnail({ canvas, pageNumber, isActive, onClick, cropStartPct, cropEndPct, cropStartPage, cropEndPage }: PageThumbnailProps) {
  const thumbCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas || !thumbCanvasRef.current) return;
    const thumbCanvas = thumbCanvasRef.current;
    const ctx = thumbCanvas.getContext('2d');
    if (!ctx) return;

    // Fixed thumbnail width for list
    const thumbWidth = 110;
    const scale = thumbWidth / canvas.width;
    thumbCanvas.width = thumbWidth;
    thumbCanvas.height = canvas.height * scale;

    // Draw the clean base page
    ctx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

    // If page is outside active range, darken the entire thumbnail
    if (pageNumber < cropStartPage || pageNumber > cropEndPage) {
      ctx.fillStyle = 'rgba(8, 9, 12, 0.82)';
      ctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
      return;
    }

    // Apply the crop line overlay if it's the start page
    if (pageNumber === cropStartPage) {
      const startY = (cropStartPct / 100) * thumbCanvas.height;
      // Shade top excluded header zone
      ctx.fillStyle = 'rgba(8, 9, 12, 0.72)';
      ctx.fillRect(0, 0, thumbCanvas.width, startY);

      // Draw orange start delimiter line
      ctx.strokeStyle = '#f97316'; // orange-500
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, startY);
      ctx.lineTo(thumbCanvas.width, startY);
      ctx.stroke();
    }

    // Apply the crop line overlay if it's the end page
    if (pageNumber === cropEndPage) {
      const endY = (cropEndPct / 100) * thumbCanvas.height;
      // Shade bottom excluded footer zone
      ctx.fillStyle = 'rgba(8, 9, 12, 0.72)';
      ctx.fillRect(0, endY, thumbCanvas.width, thumbCanvas.height - endY);

      // Draw rose end delimiter line
      ctx.strokeStyle = '#f43f5e'; // rose-500
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, endY);
      ctx.lineTo(thumbCanvas.width, endY);
      ctx.stroke();
    }
  }, [canvas, cropStartPct, cropEndPct, cropStartPage, cropEndPage]);

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all w-[124px] md:w-full text-left group flex-shrink-0 ${
        isActive
          ? 'border-indigo-500 bg-indigo-950/20 text-white shadow-lg shadow-indigo-600/5'
          : 'border-slate-800 bg-[#0F1117] hover:border-slate-750 text-slate-400 hover:text-slate-200'
      }`}
    >
      <div className="relative w-full overflow-hidden rounded-lg border border-slate-850 bg-[#0A0C10] flex items-center justify-center">
        <canvas ref={thumbCanvasRef} className="block w-full h-auto opacity-70 group-hover:opacity-90 transition-opacity" />
        
        {/* Page Badge */}
        <div className={`absolute top-1.5 left-1.5 font-mono text-[9px] px-1.5 py-0.5 rounded border ${
          isActive 
            ? 'bg-indigo-600 text-white border-indigo-500 font-bold' 
            : 'bg-slate-900/85 text-slate-300 border-slate-700/50'
        }`}>
          Pág. {pageNumber}
        </div>

        {/* Start page marker */}
        {pageNumber === cropStartPage && (
          <div className="absolute bottom-1.5 left-1.5 bg-orange-600 text-white border border-orange-500 text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm">
            📍 INÍCIO
          </div>
        )}

        {/* End page marker */}
        {pageNumber === cropEndPage && (
          <div className="absolute bottom-1.5 right-1.5 bg-rose-600 text-white border border-rose-500 text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm">
            🏁 FIM
          </div>
        )}

        {/* Excluded overlay text */}
        {(pageNumber < cropStartPage || pageNumber > cropEndPage) && (
          <div className="absolute inset-0 bg-[#08090C]/50 flex items-center justify-center">
            <span className="bg-slate-900/90 text-slate-500 border border-slate-800 text-[8px] px-1.5 py-0.5 rounded font-bold uppercase">
              Ignorada
            </span>
          </div>
        )}
      </div>
    </button>
  );
}
