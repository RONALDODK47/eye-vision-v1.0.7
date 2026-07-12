/**
 * AiScannerPreviewPanel.tsx
 *
 * Painel de seleção de arquivo (scanner/imagem) + tabela de revisão dos lançamentos
 * extraídos pela IA — antes de ir para a tabela final de conciliação.
 *
 * Interface baseada no erp.contabil com cores e bordas do sistema atual.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  FileImage,
  FileText,
  Loader2,
  Sparkles,
  AlertCircle,
  HelpCircle,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Grid,
  CheckCircle2,
  History,
  ArrowRight,
} from 'lucide-react';

/* ── Tipos ─────────────────────────────────────────────────────────────── */

export interface AiScannerTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  category: string;
}

interface AiScannerPreviewPanelProps {
  /** Chamado quando o usuário confirma os lançamentos para enviá-los à tabela de conciliação */
  onConfirm: (transactions: AiScannerTransaction[], saldoAnterior: number, saldoFinal: number) => void;
  /** Chamado ao clicar em cancelar/fechar */
  onCancel?: () => void;
  /** Ano base para datas sem ano */
  statementYear?: string;
}

const COMMON_CATEGORIES = [
  'Alimentação', 'Transporte', 'Lazer', 'Saúde', 'Salário',
  'Serviços', 'Investimentos', 'Transferência', 'Impostos',
  'Educação', 'Habitação', 'Outros',
];

/* ── Helpers ────────────────────────────────────────────────────────────── */

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function getMimeByExt(filename: string): string {
  if (/\.xlsx$/i.test(filename)) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (/\.pdf$/i.test(filename)) return 'application/pdf';
  return 'application/octet-stream';
}

/* ── Componente principal ───────────────────────────────────────────────── */

export default function AiScannerPreviewPanel({
  onConfirm,
  onCancel,
  statementYear = String(new Date().getFullYear()),
}: AiScannerPreviewPanelProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [transactions, setTransactions] = useState<AiScannerTransaction[]>([]);
  const [saldoAnterior, setSaldoAnterior] = useState<number>(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hasExtracted, setHasExtracted] = useState(false);

  /* ── Upload ─────────────────────────────────────────────────────────── */

  const processFile = useCallback(async (file: File) => {
    const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    const isImage = /\.(pdf|png|jpg|jpeg|webp)$/i.test(file.name);
    if (!ALLOWED.includes(file.type) && !isImage) {
      setError('Formato não suportado. Envie PDF, PNG, JPG ou WEBP do extrato escaneado.');
      return;
    }

    setError(null);
    setIsProcessing(true);
    setTransactions([]);
    setHasExtracted(false);

    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res((reader.result as string).split(',')[1]);
        reader.onerror = () => rej(new Error('Falha ao ler o arquivo.'));
        reader.readAsDataURL(file);
      });

      const mimeType = file.type || getMimeByExt(file.name);
      const isPdf = mimeType === 'application/pdf';
      let images: { base64: string; mimeType: string }[] = [];

      if (!isPdf) {
        images = [{ base64, mimeType }];
      } else {
        setProcessingStep('Convertendo PDF para imagens…');
        const pdfData = atob(base64);
        const pdfBytes = new Uint8Array(pdfData.length);
        for (let i = 0; i < pdfData.length; i++) pdfBytes[i] = pdfData.charCodeAt(i);

        const pdfjs = (window as any).pdfjsLib;
        if (!pdfjs) throw new Error('PDF.js não carregado. Recarregue a página.');

        const pdfDoc = await pdfjs.getDocument({ data: pdfBytes }).promise;
        for (let p = 1; p <= Math.min(pdfDoc.numPages, 15); p++) {
          setProcessingStep(`Rasterizando página ${p} de ${pdfDoc.numPages}…`);
          const page = await pdfDoc.getPage(p);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(viewport.width, 1600);
          canvas.height = Math.round(viewport.height * (canvas.width / viewport.width));
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport: page.getViewport({ scale: canvas.width / viewport.width }) }).promise;
          images.push({ base64: canvas.toDataURL('image/jpeg', 0.88).split(',')[1], mimeType: 'image/jpeg' });
        }
      }

      setProcessingStep('IA analisando o documento linha a linha…');

      const res = await fetch('/api/ai-extract-extrato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images, fileName: file.name, statementYear, perPage: false }),
        signal: AbortSignal.timeout(120_000),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.detail || json.reason || 'Erro na extração pela IA.');

      const rows: AiScannerTransaction[] = (json.rows ?? []).map((r: any, idx: number) => {
        const credRaw = parseFloat(String(r.valorCredito ?? '').replace(/\./g, '').replace(',', '.')) || 0;
        const debRaw  = parseFloat(String(r.valorDebito  ?? '').replace(/\./g, '').replace(',', '.')) || 0;
        const isCredit = credRaw > debRaw;
        const amount = isCredit ? credRaw : -debRaw;

        const dateParts = String(r.data ?? '').split('/');
        const isoDate = dateParts.length === 3
          ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`
          : String(r.data ?? '').slice(0, 10);

        return { id: `ai_${idx}_${Date.now()}`, date: isoDate, description: String(r.descricao ?? '').trim(), amount, type: isCredit ? 'CREDIT' : 'DEBIT', category: 'Outros' };
      });

      if (json.saldoAnterior != null && Number.isFinite(json.saldoAnterior)) setSaldoAnterior(json.saldoAnterior);
      setTransactions(rows);
      setHasExtracted(true);
    } catch (err: any) {
      const msg = err?.message || 'Falha na extração.';
      setError(msg.includes('aborted') || msg.includes('timeout')
        ? 'Tempo esgotado. O documento tem muitas páginas ou a conexão está lenta. Tente novamente.'
        : msg);
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  }, [statementYear]);

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) processFile(e.target.files[0]); };

  /* ── Tabela ─────────────────────────────────────────────────────────── */

  const handleCellChange = (id: string, field: keyof AiScannerTransaction, value: any) => {
    setTransactions(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (field === 'amount') {
        const num = parseFloat(value) || 0;
        return { ...t, amount: t.type === 'DEBIT' && num > 0 ? -num : t.type === 'CREDIT' && num < 0 ? Math.abs(num) : num };
      }
      if (field === 'type') {
        const abs = Math.abs(t.amount);
        return { ...t, type: value, amount: value === 'DEBIT' ? -abs : abs };
      }
      return { ...t, [field]: value };
    }));
  };

  const handleDeleteRow = (id: string) => { setTransactions(p => p.filter(t => t.id !== id)); setSelectedIds(p => p.filter(s => s !== id)); };
  const handleDeleteSelected = () => { setTransactions(p => p.filter(t => !selectedIds.includes(t.id))); setSelectedIds([]); };
  const handleAddRow = () => setTransactions(p => [{ id: `manual_${Date.now()}`, date: new Date().toISOString().slice(0, 10), description: 'NOVO LANÇAMENTO MANUAL', amount: -10, type: 'DEBIT', category: 'Outros' }, ...p]);
  const toggleSelect = (id: string) => setSelectedIds(p => p.includes(id) ? p.filter(s => s !== id) : [...p, id]);
  const toggleSelectAll = () => setSelectedIds(p => p.length === transactions.length ? [] : transactions.map(t => t.id));

  const incomes  = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses = transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const saldoFinal = saldoAnterior + incomes + expenses;

  const allCategories = Array.from(new Set([...COMMON_CATEGORIES, ...transactions.map(t => t.category).filter(Boolean)]));

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col gap-6 w-full text-brand-text">

      {/* ZONA DE UPLOAD */}
      <div className="w-full">
        <div
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={isProcessing ? undefined : () => fileInputRef.current?.click()}
          className={[
            'relative flex flex-col items-center justify-center border border-brand-border p-10 h-[240px]',
            'transition-all duration-200 cursor-pointer text-center select-none bg-white',
            isProcessing ? 'opacity-60 cursor-not-allowed'
              : isDragOver ? 'bg-brand-sidebar scale-[1.01]'
              : 'hover:bg-brand-sidebar/40',
          ].join(' ')}
        >
          <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleFileChange} disabled={isProcessing} />

          {isProcessing ? (
            <div className="flex flex-col items-center gap-4 z-10">
              <div className="relative"><Loader2 className="w-12 h-12 text-brand-text animate-spin" /><Sparkles className="w-5 h-5 text-brand-text absolute inset-0 m-auto animate-pulse" /></div>
              <div className="text-center">
                <h3 className="text-lg font-black text-brand-text uppercase">Processando Documento</h3>
                <p className="text-xs font-mono uppercase tracking-widest text-brand-text px-3 py-1 bg-brand-sidebar border border-brand-border inline-block mt-1">{processingStep || 'Aguarde…'}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 z-10">
              <div className="flex gap-4 text-zinc-500"><FileImage className="w-9 h-9" /><FileText className="w-9 h-9" /></div>
              <div>
                <p className="text-3xl font-black tracking-tighter text-brand-text uppercase">{hasExtracted ? 'Enviar Novo Arquivo' : 'Arraste o Extrato Aqui'}</p>
                <p className="text-zinc-500 text-xs font-bold tracking-[0.2em] uppercase mt-1">PDF Escaneado / PNG / JPG / FOTO</p>
              </div>
              <button type="button" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }} className="technical-button-primary">
                Buscar Arquivo
              </button>
              <div className="flex items-center gap-6 pt-3 border-t border-brand-border/20 w-full max-w-md text-zinc-500 text-[10px] font-mono tracking-wider uppercase">
                <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" /><span>PDF Bancário</span></div>
                <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-sky-500" /><span>Foto / Scanner</span></div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 p-4 bg-red-50 border border-red-400 text-red-900 flex items-start gap-3 text-xs font-mono">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div><span className="font-bold uppercase tracking-wider text-red-700 block mb-1">Falha no processamento:</span><p>{error}</p></div>
          </div>
        )}

        <div className="mt-4 bg-brand-sidebar/30 border border-brand-border p-4 text-xs text-brand-text/80 flex gap-3">
          <HelpCircle className="w-5 h-5 text-brand-text/60 shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-brand-text uppercase tracking-wider text-xs mb-1">Como funciona a extração IA</p>
            <p className="text-zinc-650 font-mono text-[11px] leading-relaxed">O motor Gemini Vision lê o documento linha a linha, extrai todas as datas, descrições e valores — incluindo anotações manuais feitas à caneta — e monta a tabela abaixo para revisão antes da conciliação.</p>
          </div>
        </div>
      </div>

      {/* TABELA DE REVISÃO */}
      {hasExtracted && (
        <div className="space-y-5">

          {/* Título */}
          <div className="flex items-center justify-between border-b border-brand-border pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h2 className="font-black text-brand-text text-sm uppercase tracking-wider">Revise os Lançamentos Antes de Confirmar</h2>
            </div>
            <span className="text-xs font-mono text-brand-text/60 bg-brand-sidebar px-2 py-1">{transactions.length} lançamentos</span>
          </div>

          {/* Cards de resumo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-brand-border border-t-4 border-t-emerald-500 p-4 flex items-center gap-3">
              <div className="bg-emerald-500/10 p-2 text-emerald-600"><TrendingUp className="w-5 h-5" /></div>
              <div><span className="text-[10px] uppercase font-bold text-zinc-550 tracking-wider block">Entradas</span><span className="text-xl font-black text-emerald-600">{formatCurrency(incomes)}</span></div>
            </div>
            <div className="bg-white border border-brand-border border-t-4 border-t-rose-500 p-4 flex items-center gap-3">
              <div className="bg-rose-500/10 p-2 text-rose-600"><TrendingDown className="w-5 h-5" /></div>
              <div><span className="text-[10px] uppercase font-bold text-zinc-550 tracking-wider block">Saídas</span><span className="text-xl font-black text-rose-600">{formatCurrency(Math.abs(expenses))}</span></div>
            </div>
            <div className="bg-white border border-brand-border border-t-4 border-t-zinc-500 p-4 flex items-center gap-3">
              <div className="bg-zinc-500/10 p-2 text-zinc-600"><History className="w-5 h-5" /></div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] uppercase font-bold text-zinc-550 tracking-wider block">Saldo Anterior</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-xs font-mono text-zinc-500">R$</span>
                  <input type="number" step="0.01" value={saldoAnterior || ''} onChange={e => setSaldoAnterior(parseFloat(e.target.value) || 0)} placeholder="0,00"
                    className="w-full bg-brand-bg/20 border border-brand-border focus:border-brand-border text-brand-text font-mono font-black text-base px-2 py-0.5 outline-none" />
                </div>
              </div>
            </div>
            <div className="bg-white border border-brand-border border-t-4 border-t-brand-border p-4 flex items-center gap-3">
              <div className="bg-brand-sidebar p-2 text-brand-text"><DollarSign className="w-5 h-5" /></div>
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-550 tracking-wider block">Saldo Final</span>
                <span className={`text-xl font-black ${saldoFinal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(saldoFinal)}</span>
              </div>
            </div>
          </div>

          {/* Barra controle */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-brand-sidebar border border-brand-border p-4">
            <div className="flex items-center gap-2"><Grid className="w-5 h-5 text-brand-text" /><h3 className="font-black text-brand-text text-sm uppercase tracking-wider">Tabela de Lançamentos ({transactions.length})</h3></div>
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              {selectedIds.length > 0 && (
                <button onClick={handleDeleteSelected} className="flex items-center gap-1.5 px-4 py-2 border border-rose-500 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-black uppercase tracking-widest transition-colors">
                  <Trash2 className="w-4 h-4" /><span>Excluir ({selectedIds.length})</span>
                </button>
              )}
              <button onClick={handleAddRow} className="technical-button bg-white">
                <Plus className="w-4 h-4" /><span>Adicionar Linha</span>
              </button>
            </div>
          </div>

          {/* Tabela */}
          <div className="bg-white border border-brand-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-brand-sidebar border-b border-brand-border text-brand-text text-[10px] font-black uppercase tracking-wider">
                    <th className="py-3 px-3 w-10 text-center"><input type="checkbox" checked={transactions.length > 0 && selectedIds.length === transactions.length} onChange={toggleSelectAll} className="accent-brand-border" /></th>
                    <th className="py-3 px-3 w-36">Data</th>
                    <th className="py-3 px-3 min-w-[200px]">Descrição / Histórico</th>
                    <th className="py-3 px-3 w-28">Tipo</th>
                    <th className="py-3 px-3 w-36">Categoria</th>
                    <th className="py-3 px-3 w-32 text-right">Valor (R$)</th>
                    <th className="py-3 px-3 w-10 text-center">—</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/10 text-sm text-brand-text">
                  {transactions.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-zinc-500"><div className="flex flex-col items-center gap-2"><AlertCircle className="w-7 h-7 text-zinc-400 animate-bounce" /><p className="font-mono text-xs">Nenhuma transação extraída.</p></div></td></tr>
                  ) : transactions.map(t => {
                    const isDebit = t.type === 'DEBIT';
                    return (
                      <tr key={t.id} className={`hover:bg-brand-sidebar/20 transition-colors ${selectedIds.includes(t.id) ? 'bg-brand-sidebar/40' : ''}`}>
                        <td className="py-1.5 px-3 text-center"><input type="checkbox" checked={selectedIds.includes(t.id)} onChange={() => toggleSelect(t.id)} className="accent-brand-border" /></td>
                        <td className="py-1.5 px-2">
                          <input type="date" value={t.date} onChange={e => handleCellChange(t.id, 'date', e.target.value)}
                            className="w-full bg-brand-bg/10 border border-brand-border/25 hover:border-brand-border focus:border-brand-border text-brand-text font-mono text-xs px-2 py-1 outline-none" />
                        </td>
                        <td className="py-1.5 px-2">
                          <input type="text" value={t.description} onChange={e => handleCellChange(t.id, 'description', e.target.value)}
                            className="w-full bg-brand-bg/10 border border-brand-border/25 hover:border-brand-border focus:border-brand-border text-brand-text text-xs px-2 py-1 outline-none font-medium uppercase tracking-wide" />
                        </td>
                        <td className="py-1.5 px-2">
                          <select value={t.type} onChange={e => handleCellChange(t.id, 'type', e.target.value)}
                            className={`w-full border px-1.5 py-1 text-xs font-black outline-none bg-white ${isDebit ? 'text-rose-600 border-rose-900/10 focus:border-rose-500' : 'text-emerald-600 border-emerald-900/10 focus:border-emerald-500'}`}>
                            <option value="DEBIT">DÉBITO</option>
                            <option value="CREDIT">CRÉDITO</option>
                          </select>
                        </td>
                        <td className="py-1.5 px-2">
                          <select value={t.category} onChange={e => handleCellChange(t.id, 'category', e.target.value)}
                            className="w-full bg-white border border-brand-border/25 hover:border-brand-border focus:border-brand-border text-brand-text text-xs px-1.5 py-1 outline-none">
                            {allCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <div className="relative inline-flex items-center w-full justify-end">
                            <span className={`text-xs absolute left-2 font-black ${isDebit ? 'text-rose-600' : 'text-emerald-600'}`}>{isDebit ? '−' : '+'}</span>
                            <input type="number" step="0.01" value={Math.abs(t.amount) || ''} onChange={e => handleCellChange(t.id, 'amount', e.target.value)}
                              className={`w-28 text-right bg-white border pl-5 pr-2 py-1 text-xs font-mono font-black outline-none ${isDebit ? 'text-rose-600 border-rose-900/20 focus:border-rose-500' : 'text-emerald-600 border-emerald-900/20 focus:border-emerald-500'}`} />
                          </div>
                        </td>
                        <td className="py-1.5 px-3 text-center">
                          <button onClick={() => handleDeleteRow(t.id)} className="text-zinc-550 hover:text-rose-600 p-1 hover:bg-rose-500/10 transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="bg-brand-sidebar border-t border-brand-border py-3 px-5 flex flex-col sm:flex-row items-center justify-between text-xs text-brand-text/70 gap-2 font-mono">
              <span>Edite data, descrição e valor diretamente antes de confirmar para a conciliação.</span>
              <span className="bg-white border border-brand-border px-2 py-0.5 font-bold">ANO BASE: {statementYear}</span>
            </div>
          </div>

          {/* Botões */}
          <div className="flex items-center justify-between gap-4 pt-2 border-t border-brand-border">
            {onCancel && (
              <button onClick={onCancel} className="technical-button bg-white">
                Cancelar
              </button>
            )}
            <button
              onClick={() => onConfirm(transactions, saldoAnterior, saldoFinal)}
              disabled={transactions.length === 0}
              className="technical-button-primary flex items-center gap-2 ml-auto"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirmar {transactions.length} Lançamentos</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </div>
      )}
    </div>
  );
}

