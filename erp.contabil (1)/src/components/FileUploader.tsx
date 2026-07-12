/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import { 
  Upload, 
  FileSpreadsheet, 
  FileText, 
  FileImage, 
  Loader2, 
  AlertCircle,
  HelpCircle,
  FileCheck,
  Sparkles
} from "lucide-react";

interface FileUploaderProps {
  onFileLoaded: (fileBase64: string, mimeType: string, fileName: string) => void;
  isProcessing: boolean;
  processingStep: string;
  error: string | null;
}

export default function FileUploader({ 
  onFileLoaded, 
  isProcessing, 
  processingStep, 
  error 
}: FileUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const processFile = (file: File) => {
    if (!file) return;

    // Allowed mime types
    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv"
    ];

    const isExcelOrCsvExtension = /\.(xlsx|xls|csv)$/i.test(file.name);
    
    if (!allowedTypes.includes(file.type) && !isExcelOrCsvExtension) {
      alert("Formato de arquivo não suportado. Envie PDF, PNG, JPG, WEBP, Excel ou CSV.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Get base64 content
      const base64Data = result.split(",")[1];
      onFileLoaded(base64Data, file.type || getMimeByExt(file.name), file.name);
    };
    reader.readAsDataURL(file);
  };

  const getMimeByExt = (filename: string): string => {
    if (filename.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (filename.endsWith(".xls")) return "application/vnd.ms-excel";
    if (filename.endsWith(".csv")) return "text/csv";
    if (filename.endsWith(".pdf")) return "application/pdf";
    return "application/octet-stream";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <div
        id="drop-zone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={isProcessing ? undefined : triggerFileSelect}
        className={`relative flex flex-col items-center justify-center border-4 rounded-none p-10 h-[340px] transition-all duration-300 cursor-pointer text-center ${
          isProcessing ? "bg-zinc-900/40 border-zinc-700 cursor-not-allowed" :
          isDragOver 
            ? "bg-white/10 border-emerald-500 scale-[1.01] shadow-xl" 
            : "bg-zinc-900 border-white hover:border-emerald-400 hover:bg-zinc-900/80"
        }`}
      >
        {/* Absolute nested border outline like design */}
        <div className="absolute inset-0 border border-white/5 m-2 pointer-events-none"></div>

        <input
          id="file-input"
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileChange}
          disabled={isProcessing}
        />

        {isProcessing ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-6 z-10">
            <div className="relative flex items-center justify-center">
              <Loader2 className="w-12 h-12 text-emerald-400 animate-spin" />
              <Sparkles className="w-5 h-5 text-emerald-400 absolute animate-pulse" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-black tracking-tight text-white uppercase">
                PROCESSANDO DOCUMENTO
              </h3>
              <p className="text-xs font-mono uppercase tracking-widest text-emerald-400 px-3 py-1 bg-emerald-500/10 rounded-none inline-block border border-emerald-500/20">
                {processingStep}
              </p>
              <p className="text-xs text-zinc-400 max-w-sm mt-3 font-mono">
                Surya OCR engine analyzing visual boundaries & structural schema...
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-4 z-10">
            <div className="space-y-2">
              <p className="text-4xl md:text-5xl font-black tracking-tighter text-white uppercase">
                ARRASTE OS ARQUIVOS
              </p>
              <p className="text-zinc-400 text-xs font-bold tracking-[0.2em] uppercase">
                PDF / EXCEL / PNG / SCAN / FOTO
              </p>
            </div>

            <div className="mt-6 flex gap-4">
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerFileSelect();
                }}
                className="px-6 py-3 bg-white text-black font-black text-xs uppercase tracking-widest hover:bg-emerald-400 hover:text-black transition-colors"
              >
                Buscar Arquivo
              </button>
            </div>

            {/* Supported file formats visual bar */}
            <div className="flex items-center justify-center gap-6 pt-6 border-t border-zinc-800 w-full max-w-md text-zinc-400 text-[10px] font-mono tracking-wider uppercase">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                <span>PDF BANCÁRIO</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>EXCEL / CSV</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                <span>FOTO ESCANEADA</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 bg-rose-950/40 border-l-4 border-rose-500 text-rose-200 flex items-start gap-3 text-sm font-mono">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold uppercase tracking-wider text-rose-400 block">Falha no processamento:</span>
            <p className="leading-relaxed text-xs">{error}</p>
          </div>
        </div>
      )}

      {/* Helpful Hint Card */}
      <div className="mt-6 bg-zinc-900 border-l-4 border-zinc-600 p-5 text-xs text-zinc-400">
        <div className="flex gap-3">
          <HelpCircle className="w-5 h-5 text-zinc-400 shrink-0 mt-0.5" />
          <div className="space-y-1 leading-relaxed">
            <p className="font-black text-white uppercase tracking-wider text-xs">COMO FUNCIONA O RECONHECIMENTO SURYA + GEMINI AI</p>
            <p className="text-zinc-400 font-mono text-[11px]">
              O motor multimodal do Gemini atua como um scanner inteligente que lê e interpreta a imagem ou documento, descobrindo as posições e o formato original exato da tabela de despesas. Ele extrai as colunas de data, descrição, valor e tipo diretamente para a estrutura OFX sem a necessidade de templates rígidos de bancos.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
