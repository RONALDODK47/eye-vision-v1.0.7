/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ExtractedRow } from '../types';
import { Trash2, TrendingDown, TrendingUp, HelpCircle, FileSpreadsheet, Plus, AlertCircle, Filter, X, Check, EyeOff, Wallet, DollarSign } from 'lucide-react';
import { analyzeValueString } from '../utils/cropper';

interface TableViewerProps {
  rows: ExtractedRow[];
  setRows: React.Dispatch<React.SetStateAction<ExtractedRow[]>>;
  onExportCsv: () => void;
  onClearAll: () => void;
  exclusionRules: string[];
  setExclusionRules: React.Dispatch<React.SetStateAction<string[]>>;
}

export default function TableViewer({
  rows,
  setRows,
  onExportCsv,
  onClearAll,
  exclusionRules,
  setExclusionRules,
}: TableViewerProps) {
  const [invertCrops, setInvertCrops] = React.useState(true);
  const [hoveredRowId, setHoveredRowId] = React.useState<string | null>(null);
  const [newRule, setNewRule] = React.useState('');
  const [saldoAnterior, setSaldoAnterior] = React.useState<number>(() => {
    const saved = localStorage.getItem('saldo_anterior');
    return saved ? parseFloat(saved) || 0 : 0;
  });
  
  // Filter rows based on exclusion rules (case-insensitive substring match on all fields)
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

  const excludedRowsCount = rows.length - filteredRows.length;

  const handleAddRule = (ruleText: string) => {
    const trimmed = ruleText.trim();
    if (!trimmed) return;
    if (exclusionRules.some(r => r.toUpperCase() === trimmed.toUpperCase())) {
      setNewRule('');
      return;
    }
    setExclusionRules(prev => [...prev, trimmed]);
    setNewRule('');
  };

  const handleRemoveRule = (ruleToRemove: string) => {
    setExclusionRules(prev => prev.filter(r => r !== ruleToRemove));
  };

  const handleApplyExclusionPermanently = () => {
    if (excludedRowsCount === 0) return;
    if (window.confirm(`Deseja realmente EXCLUIR DEFINITIVAMENTE as ${excludedRowsCount} linhas que coincidem com os filtros de exclusão? Esta ação não pode ser desfeita.`)) {
      setRows(filteredRows);
    }
  };

  const handleTextChange = (
    rowId: string,
    field: 'dateText' | 'historyText' | 'valueText',
    newVal: string
  ) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;

        const updatedRow = { ...row, [field]: newVal };

        // If editing the value field, re-run our parser automatically
        if (field === 'valueText') {
          const { isNegative, parsedValue } = analyzeValueString(newVal);
          updatedRow.isNegative = isNegative;
          updatedRow.parsedValue = parsedValue;
        }

        return updatedRow;
      })
    );
  };

  const handleToggleSign = (rowId: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        
        const isNegative = !row.isNegative;
        // Flip the sign of the parsed number as well
        const parsedValue = row.parsedValue !== null ? -row.parsedValue : null;

        return {
          ...row,
          isNegative,
          parsedValue,
        };
      })
    );
  };

  const handleDeleteRow = (rowId: string) => {
    setRows((prev) => prev.filter((row) => row.id !== rowId));
  };

  const handleAddRow = () => {
    const newRow: ExtractedRow = {
      id: `manual-row-${Date.now()}`,
      dateText: new Date().toLocaleDateString('pt-BR'),
      historyText: 'LANÇAMENTO MANUAL',
      valueText: '0,00',
      dateCropUrl: '',
      historyCropUrl: '',
      valueCropUrl: '',
      isNegative: false,
      parsedValue: 0,
      y: 0,
      height: 0,
    };
    setRows((prev) => [...prev, newRow]);
  };

  return (
    <div id="table-results-card" className="bg-[#0F1117] rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col h-full min-h-[400px]">
      {/* Table Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-[#0F1117] border-b border-slate-800">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-slate-400" />
            <h2 className="font-semibold text-slate-100 text-base">Dados Recortados & Tabelados</h2>
            {rows.length > 0 && (
              <span className="text-xs bg-indigo-950/40 text-indigo-400 font-semibold px-2.5 py-0.5 rounded-full border border-indigo-900/40 flex items-center">
                {filteredRows.length} {filteredRows.length === 1 ? 'linha' : 'linhas'}
                {excludedRowsCount > 0 && (
                  <span className="text-[10px] text-amber-400 font-medium ml-1.5 border-l border-indigo-900/60 pl-1.5">
                    ({excludedRowsCount} excluída{excludedRowsCount === 1 ? '' : 's'} por texto)
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {rows.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setInvertCrops(!invertCrops)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                invertCrops 
                  ? 'bg-indigo-950/40 text-indigo-400 border-indigo-900/50' 
                  : 'bg-[#0A0C10] text-slate-400 border-slate-850 hover:bg-slate-800'
              }`}
              title="Inverte as cores das imagens recortadas para que textos pretos em fundo branco fiquem brancos em fundo escuro."
            >
              <span className={`w-2 h-2 rounded-full ${invertCrops ? 'bg-indigo-400 animate-pulse' : 'bg-slate-600'}`}></span>
              Inverter cores (Modo Noturno)
            </button>
            <button
              onClick={handleAddRow}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0A0C10] hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold border border-slate-800 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Inserir Linha
            </button>
            <button
              onClick={onClearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-rose-950/30 text-rose-400 rounded-xl text-xs font-semibold border border-transparent hover:border-rose-900/30 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar Tudo
            </button>
            <button
              id="export-csv-btn"
              onClick={onExportCsv}
              className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/15 transition-all"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Exportar para Excel / CSV
            </button>
          </div>
        )}
      </div>

      {/* Bento Grid containing Saldo Anterior, Entradas, Saídas and Saldo Final */}
      {rows.length > 0 && (() => {
        const totalEntradas = filteredRows
          .filter(r => !r.isNegative && r.parsedValue !== null)
          .reduce((sum, r) => sum + (r.parsedValue || 0), 0);

        const totalSaidas = Math.abs(
          filteredRows
            .filter(r => r.isNegative && r.parsedValue !== null)
            .reduce((sum, r) => sum + (r.parsedValue || 0), 0)
        );

        const saldoFinal = (saldoAnterior || 0) + totalEntradas - totalSaidas;

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-6 py-5 bg-[#0F1117] border-b border-slate-800/80 animate-fade-in">
            {/* Card 1: Saldo Anterior */}
            <div className="bg-[#12141F] border border-slate-800/85 rounded-2xl p-4 flex flex-col justify-between gap-2.5 transition-all hover:border-slate-700 shadow-md">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-950/40 border border-indigo-900/40 text-indigo-400 flex items-center justify-center">
                  <Wallet className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Saldo Anterior</span>
              </div>
              <div className="relative flex items-center mt-1">
                <span className="absolute left-3 text-slate-500 font-mono text-xs font-bold">R$</span>
                <input
                  type="number"
                  step="any"
                  value={saldoAnterior || ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                    setSaldoAnterior(val);
                    localStorage.setItem('saldo_anterior', val.toString());
                  }}
                  className="w-full bg-[#0F1117] border border-slate-800 focus:border-indigo-500 hover:border-slate-750 rounded-xl pl-9 pr-3 py-1.5 text-xs font-mono font-bold text-slate-200 outline-none transition-all placeholder-slate-600"
                  placeholder="0,00"
                />
              </div>
            </div>

            {/* Card 2: Entradas */}
            <div className="bg-[#12141F] border border-slate-800/85 rounded-2xl p-4 flex flex-col justify-between gap-2.5 transition-all hover:border-slate-700 shadow-md">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-950/40 border border-emerald-900/40 text-emerald-400 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Entradas</span>
              </div>
              <div className="mt-1">
                <span className="text-lg font-mono font-bold text-emerald-400">
                  R$ {totalEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Card 3: Saídas */}
            <div className="bg-[#12141F] border border-slate-800/85 rounded-2xl p-4 flex flex-col justify-between gap-2.5 transition-all hover:border-slate-700 shadow-md">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-rose-950/40 border border-rose-900/40 text-rose-400 flex items-center justify-center">
                  <TrendingDown className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Saídas</span>
              </div>
              <div className="mt-1">
                <span className="text-lg font-mono font-bold text-rose-400">
                  R$ {totalSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Card 4: Saldo Final */}
            <div className={`border rounded-2xl p-4 flex flex-col justify-between gap-2.5 transition-all shadow-md ${
              saldoFinal >= 0 
                ? 'bg-[#121b18] border-emerald-900/40 hover:border-emerald-700/60' 
                : 'bg-[#1f1416] border-rose-900/40 hover:border-rose-700/60'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    saldoFinal >= 0 ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40' : 'bg-rose-950/40 text-rose-400 border border-rose-900/40'
                  }`}>
                    <DollarSign className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Saldo Final</span>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  saldoFinal >= 0 ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/30' : 'bg-rose-950/40 text-rose-400 border border-rose-900/30'
                }`}>
                  {saldoFinal >= 0 ? 'Positivo' : 'Devedor'}
                </span>
              </div>
              <div className="mt-1">
                <span className={`text-lg font-mono font-bold ${saldoFinal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  R$ {saldoFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Exclusion Rules Management Card */}
      {rows.length > 0 && (
        <div className="px-6 py-5 bg-[#0F1117]/60 border-b border-slate-800/80 flex flex-col gap-4 animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-950/30 text-amber-500 border border-amber-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Filter className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-2">
                  Filtros de Exclusão por Texto (Saldos, Taxas & Metadados)
                </h3>
                <p className="text-[11px] text-slate-400 leading-normal mt-0.5">
                  Digite palavras ou frases contidas nas linhas que você deseja excluir automaticamente. Se a linha contiver a frase digitada (como "SALDO ANTERIOR" ou "SALDO TOTAL"), ela será automaticamente removida da visualização e da exportação final.
                </p>
              </div>
            </div>

            {/* Permanent deletion button */}
            {excludedRowsCount > 0 && (
              <button
                onClick={handleApplyExclusionPermanently}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-950/20 hover:bg-amber-900/30 text-amber-400 border border-amber-900/40 hover:border-amber-700/50 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm ml-auto md:ml-0"
                title="Clique para excluir permanentemente da tabela todas as linhas que estão ocultadas pelos filtros."
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir Fisicamente ({excludedRowsCount} {excludedRowsCount === 1 ? 'linha' : 'linhas'})
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start bg-[#0A0C10] p-4 rounded-xl border border-slate-850">
            {/* Input Form */}
            <div className="lg:col-span-4 flex flex-col gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cadastrar Novo Filtro</span>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddRule(newRule);
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={newRule}
                  onChange={(e) => setNewRule(e.target.value)}
                  placeholder="Ex: SALDO ANTERIOR"
                  className="flex-1 text-xs font-semibold bg-[#0F1117] border border-slate-800 focus:border-indigo-500 hover:border-slate-750 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-500 outline-none transition-all"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer font-sans"
                >
                  Adicionar
                </button>
              </form>
            </div>

            {/* Active Rules List */}
            <div className="lg:col-span-8 flex flex-col gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Filtros Ativos ({exclusionRules.length})</span>
              <div className="flex flex-wrap gap-1.5 items-center max-h-[120px] overflow-y-auto pr-1">
                {exclusionRules.length === 0 ? (
                  <span className="text-xs text-slate-500 italic py-1">Nenhum filtro ativo no momento. Escreva acima para filtrar.</span>
                ) : (
                  exclusionRules.map((rule, idx) => (
                    <div
                      key={rule + '-' + idx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-950/30 text-indigo-300 border border-indigo-900/40 rounded-lg text-xs font-semibold transition-all group hover:bg-indigo-950/50"
                    >
                      <Filter className="w-3 h-3 text-indigo-400 animate-pulse" />
                      <span>{rule}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveRule(rule)}
                        className="p-0.5 hover:bg-rose-950/50 hover:text-rose-400 rounded transition-colors text-indigo-400 cursor-pointer"
                        title="Remover este filtro"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Suggestions */}
              <div className="flex flex-wrap gap-2 items-center text-[10px] text-slate-400 mt-1 border-t border-slate-850/60 pt-2">
                <span className="font-medium text-slate-500">Sugestões rápidas:</span>
                {['SALDO ANTERIOR', 'SALDO DO DIA', 'SALDO ATUAL', 'SALDO DISPONÍVEL', 'TOTAL DISPONÍVEL', 'SDO ANTERIOR', 'TAR COMP'].map((suggest) => {
                  const alreadyActive = exclusionRules.some(r => r.toUpperCase() === suggest.toUpperCase());
                  if (alreadyActive) return null;
                  return (
                    <button
                      key={suggest}
                      type="button"
                      onClick={() => handleAddRule(suggest)}
                      className="px-2 py-0.5 bg-[#0F1117] hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-slate-200 rounded text-[10px] font-medium transition-all cursor-pointer"
                    >
                      + {suggest}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table Workspace */}
      <div className="flex-1 overflow-x-auto bg-[#0A0C10] p-4 lg:p-6">
        {rows.length > 0 ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            
            {/* TABELA DE IMAGENS (ORIGINAL DO EXTRATO) */}
            <div className="flex flex-col gap-2 min-w-[340px]">
              <div className="flex items-center gap-2 px-1 py-1">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  🖼️ Imagens Originais do PDF (Recorte)
                </h3>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-850 bg-[#07080c] shadow-md">
                <table className="w-full text-left border-collapse table-fixed">
                  <thead>
                    <tr className="bg-[#0F1117] border-b border-slate-850 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-3 w-10 text-center border-b border-slate-850">Nº</th>
                      <th className="py-3 px-3 w-1/4 border-b border-slate-850">Data Original</th>
                      <th className="py-3 px-3 w-1/2 border-b border-slate-850">Histórico Original</th>
                      <th className="py-3 px-3 w-1/4 border-b border-slate-855 text-right">Valor Original</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 bg-[#07080c]">
                    {filteredRows.map((row, index) => {
                      const isHovered = hoveredRowId === row.id;
                      return (
                        <tr
                          key={row.id}
                          onMouseEnter={() => setHoveredRowId(row.id)}
                          onMouseLeave={() => setHoveredRowId(null)}
                          className={`h-[78px] transition-colors border-b border-slate-850 ${
                            isHovered ? 'bg-indigo-950/25 border-indigo-900/40' : 'hover:bg-slate-900/20'
                          }`}
                        >
                          {/* index */}
                          <td className="py-3 px-3 text-center text-xs font-mono text-slate-500 font-bold">
                            {index + 1}
                          </td>

                          {/* Date Crop Column */}
                          <td className="py-3 px-3">
                            {row.dateCropUrl ? (
                              <div className="bg-slate-950 p-1 rounded-lg border border-slate-900/60 flex items-center justify-center max-w-full overflow-hidden select-none h-11">
                                <img
                                  src={row.dateCropUrl}
                                  alt="Recorte Data"
                                  className={`max-h-9 object-contain opacity-90 hover:opacity-100 transition-all ${
                                    invertCrops ? 'invert hue-rotate-180 brightness-125' : ''
                                  }`}
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-600 italic h-11 flex items-center justify-center">Sem recorte</div>
                            )}
                          </td>

                          {/* History Crop Column */}
                          <td className="py-3 px-3">
                            {row.historyCropUrl ? (
                              <div className="bg-slate-950 p-1 rounded-lg border border-slate-900/60 flex items-center justify-start max-w-full overflow-hidden select-none h-11">
                                <img
                                  src={row.historyCropUrl}
                                  alt="Recorte Histórico"
                                  className={`max-h-9 object-contain opacity-90 hover:opacity-100 transition-all ${
                                    invertCrops ? 'invert hue-rotate-180 brightness-125' : ''
                                  }`}
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-600 italic h-11 flex items-center">Sem recorte</div>
                            )}
                          </td>

                          {/* Value Crop Column */}
                          <td className="py-3 px-3">
                            {row.valueCropUrl ? (
                              <div className="bg-slate-950 p-1 rounded-lg border border-slate-900/60 flex items-center justify-end max-w-full overflow-hidden select-none h-11">
                                <img
                                  src={row.valueCropUrl}
                                  alt="Recorte Valor"
                                  className={`max-h-9 object-contain opacity-90 hover:opacity-100 transition-all ${
                                    invertCrops ? 'invert hue-rotate-180 brightness-125' : ''
                                  }`}
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-600 italic h-11 flex items-center justify-end">Sem recorte</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* TABELA DE DADOS (EDITÁVEL) */}
            <div className="flex flex-col gap-2 min-w-[340px]">
              <div className="flex items-center gap-2 px-1 py-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  ✍️ Dados Convertidos (Texto Editável)
                </h3>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-850 bg-[#07080c] shadow-md">
                <table className="w-full text-left border-collapse table-fixed">
                  <thead>
                    <tr className="bg-[#0F1117] border-b border-slate-850 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-3 w-10 text-center border-b border-slate-850">Nº</th>
                      <th className="py-3 px-3 w-[100px] border-b border-slate-850">Data</th>
                      <th className="py-3 px-3 border-b border-slate-850">Histórico</th>
                      <th className="py-3 px-3 w-[100px] border-b border-slate-850">Valor (R$)</th>
                      <th className="py-3 px-3 w-[130px] border-b border-slate-850">Sinal / Status</th>
                      <th className="py-3 px-3 w-10 text-center border-b border-slate-850"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 bg-[#07080c]">
                    {filteredRows.map((row, index) => {
                      const isHovered = hoveredRowId === row.id;
                      return (
                        <tr
                          key={row.id}
                          onMouseEnter={() => setHoveredRowId(row.id)}
                          onMouseLeave={() => setHoveredRowId(null)}
                          className={`h-[78px] transition-colors border-b border-slate-850 ${
                            isHovered ? 'bg-indigo-950/25 border-indigo-900/40' : 'hover:bg-slate-900/20'
                          }`}
                        >
                          {/* index */}
                          <td className="py-3 px-3 text-center text-xs font-mono text-slate-500 font-bold">
                            {index + 1}
                          </td>

                          {/* Date Input */}
                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={row.dateText}
                              onChange={(e) => handleTextChange(row.id, 'dateText', e.target.value)}
                              className="text-xs font-mono font-medium text-slate-200 bg-[#0F1117] hover:bg-slate-900 focus:bg-slate-900 border border-slate-800 hover:border-slate-700 focus:border-indigo-500 px-2 py-1.5 rounded-lg outline-none transition-all w-full text-center"
                              placeholder="Data"
                            />
                          </td>

                          {/* History Input */}
                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={row.historyText}
                              onChange={(e) => handleTextChange(row.id, 'historyText', e.target.value)}
                              className="text-xs font-medium text-slate-200 bg-[#0F1117] hover:bg-slate-900 focus:bg-slate-900 border border-slate-800 hover:border-slate-700 focus:border-indigo-500 px-2 py-1.5 rounded-lg outline-none transition-all w-full truncate"
                              placeholder="Histórico"
                            />
                          </td>

                          {/* Value Input */}
                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={row.valueText}
                              onChange={(e) => handleTextChange(row.id, 'valueText', e.target.value)}
                              className={`text-xs font-mono font-bold bg-[#0F1117] hover:bg-slate-900 focus:bg-slate-900 border border-slate-800 hover:border-slate-700 focus:border-indigo-500 px-2 py-1.5 rounded-lg outline-none transition-all w-full text-center ${
                                row.isNegative ? 'text-rose-400' : 'text-emerald-400'
                              }`}
                              placeholder="Valor"
                            />
                          </td>

                          {/* Positive/Negative Status Sign */}
                          <td className="py-3 px-3">
                            <div className="flex flex-col gap-0.5 justify-center">
                              <button
                                onClick={() => handleToggleSign(row.id)}
                                className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] font-bold w-fit cursor-pointer border select-none transition-all active:scale-95 ${
                                  row.isNegative
                                    ? 'bg-rose-950/20 border-rose-900 hover:border-rose-800 text-rose-400'
                                    : 'bg-emerald-950/20 border-emerald-900 hover:border-emerald-800 text-emerald-400'
                                }`}
                                title="Clique para alternar sinal"
                              >
                                {row.isNegative ? (
                                  <>
                                    <TrendingDown className="w-3 h-3 text-rose-400" />
                                    <span>Despesa</span>
                                  </>
                                ) : (
                                  <>
                                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                                    <span>Receita</span>
                                  </>
                                )}
                              </button>
                              
                              {row.parsedValue !== null ? (
                                <span className="text-[9px] font-mono text-slate-500 truncate" title={`R$ ${row.parsedValue}`}>
                                  R$ {row.parsedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              ) : (
                                <span className="text-[9px] font-mono text-rose-400 flex items-center gap-0.5">
                                  <AlertCircle className="w-2.5 h-2.5" /> Ilegível
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => handleDeleteRow(row.id)}
                              className="p-1 text-slate-600 hover:text-rose-400 rounded-lg hover:bg-rose-950/30 transition-colors cursor-pointer"
                              title="Remover linha"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-12 bg-[#0F1117] max-w-lg mx-auto my-8 border border-slate-800 rounded-2xl">
            <div className="w-14 h-14 bg-slate-900 text-slate-500 flex items-center justify-center rounded-2xl mb-4 border border-slate-800 shadow-sm">
              <FileSpreadsheet className="w-7 h-7" />
            </div>
            <h3 className="font-semibold text-slate-200 text-sm mb-1.5">Tabela Vazia</h3>
            <p className="text-slate-400 text-xs leading-relaxed mb-6">
              Nenhuma linha foi recortada ou mapeada ainda. Alinhe as colunas de Data, Histórico e Valor acima e clique no botão <strong>Recortar & Analisar</strong> para iniciar o processamento e preencher a tabela.
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={handleAddRow}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition-colors border border-slate-700/50"
              >
                Inserir Linha Manual
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table Footer Instructions */}
      {rows.length > 0 && (
        <div className="px-6 py-4 bg-[#0F1117] border-t border-slate-800 flex items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-1.5 mx-auto">
            <HelpCircle className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span>Todos os dados e recortes podem ser editados diretamente na tabela antes de exportar.</span>
          </div>
        </div>
      )}
    </div>
  );
}
