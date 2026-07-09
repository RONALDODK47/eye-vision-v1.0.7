/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { Upload, FileText, Image as ImageIcon, Sparkles, Check, AlertCircle } from 'lucide-react';
import { DocMetadata } from '../types';

interface UploaderProps {
  onFileLoaded: (file: File) => void;
  onLoadSample: () => void;
  metadata: DocMetadata | null;
  isProcessing: boolean;
  onPageChange?: (page: number) => void;
}

export default function Uploader({
  onFileLoaded,
  onLoadSample,
  metadata,
  isProcessing,
  onPageChange,
}: UploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    setErrorMsg(null);
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      setErrorMsg('Formato de arquivo não suportado. Por favor, envie um PDF, PNG ou JPG.');
      return;
    }
    onFileLoaded(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Upload Box */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-6 transition-all duration-200 text-center flex flex-col items-center justify-center cursor-pointer ${
          isDragOver
            ? 'border-indigo-500 bg-indigo-950/10'
            : 'border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/80'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/png,image/jpeg,image/jpg"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 border shadow-sm ${
          isDragOver ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900 text-slate-400 border-slate-800'
        }`}>
          <Upload className="w-5 h-5" />
        </div>

        <h3 className="font-semibold text-slate-200 text-xs mb-1">
          Importar Extrato Bancário
        </h3>
        <p className="text-slate-400 text-[10px] leading-normal max-w-[200px] mb-3">
          Arraste e solte seu arquivo PDF, PNG ou JPG aqui, ou clique para navegar.
        </p>
        <span className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-medium border border-slate-700/50">
          PDF, PNG, JPG (Máx. 10MB)
        </span>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="flex items-start gap-2 p-3 bg-rose-950/20 border border-rose-900/30 rounded-xl text-rose-400 text-xs leading-normal">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Quick Play Sample Button */}
      <button
        id="load-sample-btn"
        onClick={(e) => {
          e.stopPropagation();
          onLoadSample();
        }}
        disabled={isProcessing}
        className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-indigo-950/20 hover:bg-indigo-950/40 text-indigo-400 border border-indigo-900/50 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
      >
        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
        Carregar Extrato de Exemplo
      </button>

      {/* File metadata & controls */}
      {metadata && (
        <div className="bg-[#0F1117] border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${
              metadata.type === 'pdf' ? 'bg-rose-950/20 border-rose-900/30 text-rose-400' : 'bg-amber-950/20 border-amber-900/30 text-amber-400'
            }`}>
              {metadata.type === 'pdf' ? (
                <FileText className="w-4 h-4" />
              ) : (
                <ImageIcon className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-semibold text-slate-200 text-xs truncate">
                {metadata.name}
              </h4>
              <p className="text-slate-400 text-[10px] uppercase font-mono">
                {metadata.type} • {metadata.width}x{metadata.height}px
              </p>
            </div>
          </div>

          {/* PDF Page Selection Controls */}
          {metadata.type === 'pdf' && metadata.totalPages > 1 && (
            <div className="border-t border-slate-800 pt-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Página Selecionada ({metadata.pageNumber} de {metadata.totalPages})
              </label>
              <div className="flex items-center gap-2">
                <button
                  disabled={metadata.pageNumber <= 1 || isProcessing}
                  onClick={() => onPageChange && onPageChange(metadata.pageNumber - 1)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold disabled:opacity-50 transition-colors border border-slate-700/50"
                >
                  Anterior
                </button>
                <div className="flex-1 text-center font-mono text-xs font-semibold bg-slate-900 border border-slate-800 py-1 rounded text-slate-200">
                  Pág. {metadata.pageNumber}
                </div>
                <button
                  disabled={metadata.pageNumber >= metadata.totalPages || isProcessing}
                  onClick={() => onPageChange && onPageChange(metadata.pageNumber + 1)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold disabled:opacity-50 transition-colors border border-slate-700/50"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
