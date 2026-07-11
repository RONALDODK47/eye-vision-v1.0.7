/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { ExtractedRow } from '../../../lib/leitorRecortador/types';
import { Trash2, TrendingDown, TrendingUp, HelpCircle, FileSpreadsheet, Plus, AlertCircle, Filter, X, Check, EyeOff, Wallet, DollarSign, Image, PencilLine } from 'lucide-react';
import { analyzeValueString } from '../../../lib/leitorRecortador/cropper';
import { FreeNumericInput } from '../FreeNumericInput';
import { parseLocaleNumber } from '../../../lib/localeNumber';

interface TableViewerProps {
  rows: ExtractedRow[];
  setRows: React.Dispatch<React.SetStateAction<ExtractedRow[]>>;
  onExportCsv: () => void;
  onExportOfx?: () => void;
  onClearAll: () => void;
  exclusionRules: string[];
  setExclusionRules: React.Dispatch<React.SetStateAction<string[]>>;
}

export function LeitorRecortadorTable({
  rows,
  setRows,
  onExportCsv,
  onExportOfx,
  onClearAll,
  exclusionRules,
  setExclusionRules,
}: TableViewerProps) {
  const [invertCrops, setInvertCrops] = React.useState(false);
  const [hoveredRowId, setHoveredRowId] = React.useState<string | null>(null);
  const [newRule, setNewRule] = React.useState('');
  const [saldoAnterior, setSaldoAnterior] = React.useState<number>(() => {
    const saved = localStorage.getItem('saldo_anterior');
    return saved ? parseLocaleNumber(saved, 0) : 0;
  });
  
  // Filter rows based on exclusion rules (case-insensitive substring match on all fields)
  const filteredRows = React.useMemo(() => {
    const rules = exclusionRules
      .map((rule) => rule.trim().toUpperCase())
      .filter(Boolean);
    if (rules.length === 0) return rows;
    return rows.filter((row) => {
      const textToSearch = [
        row.dateText || '',
        row.historyText || '',
        row.valueText || '',
      ]
        .join(' ')
        .toUpperCase();
      return !rules.some((rule) => textToSearch.includes(rule));
    });
  }, [rows, exclusionRules]);

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

  const handleDeleteRowsWithoutValue = () => {
    setRows((prev) =>
      prev.filter((row) => {
        const v = (row.valueText || '').trim();
        return v.length > 0;
      }),
    );
  };

  const handleDeleteRowsWithoutHistory = () => {
    setRows((prev) => prev.filter((row) => (row.historyText || '').trim().length > 0));
  };

  const handleDeleteRowsWithoutDate = () => {
    setRows((prev) => prev.filter((row) => (row.dateText || '').trim().length > 0));
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
    <div id="table-results-card" className="bg-white border border-brand-border shadow-[2px_2px_0_0_#141414] overflow-hidden flex flex-col h-full min-h-[400px]">
      {/* Table Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-white border-b border-brand-border">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-brand-text/60" />
            <h2 className="font-semibold text-brand-text text-base">Dados Recortados & Tabelados</h2>
            {rows.length > 0 && (
              <span className="text-xs bg-brand-sidebar text-brand-text font-semibold px-2.5 py-0.5 border border-brand-border flex items-center">
                {filteredRows.length} {filteredRows.length === 1 ? 'linha' : 'linhas'}
                {excludedRowsCount > 0 && (
                  <span className="text-[10px] text-amber-400 font-medium ml-1.5 border-l border-brand-border pl-1.5">
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
              className={`technical-button flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold cursor-pointer ${invertCrops ? 'bg-brand-sidebar text-brand-text' : 'text-brand-text/60'}`}
              title="Inverte as cores das imagens recortadas para que textos pretos em fundo branco fiquem brancos em fundo escuro."
            >
              <span className={`w-2 h-2 ${invertCrops ? 'bg-brand-text animate-pulse' : 'bg-brand-text/40'}`}></span>
              Inverter cores (Modo Noturno)
            </button>
            <button
              onClick={handleAddRow}
              className="technical-button flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              Inserir Linha
            </button>
            <button
              type="button"
              onClick={handleDeleteRowsWithoutValue}
              className="technical-button flex items-center gap-1.5 px-3 py-1.5 text-rose-600 text-xs font-semibold hover:bg-rose-50"
              title="Remove linhas com coluna Valor vazia"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir sem valor
            </button>
            <button
              type="button"
              onClick={handleDeleteRowsWithoutHistory}
              className="technical-button flex items-center gap-1.5 px-3 py-1.5 text-rose-600 text-xs font-semibold hover:bg-rose-50"
              title="Remove linhas com coluna Histórico vazia"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir sem histórico
            </button>
            <button
              type="button"
              onClick={handleDeleteRowsWithoutDate}
              className="technical-button flex items-center gap-1.5 px-3 py-1.5 text-rose-600 text-xs font-semibold hover:bg-rose-50"
              title="Remove linhas com coluna Data vazia"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir sem data
            </button>
            <button
              onClick={onClearAll}
              className="technical-button flex items-center gap-1.5 px-3 py-1.5 text-rose-600 text-xs font-semibold hover:bg-rose-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar Tudo
            </button>
            <button
              id="export-csv-btn"
              onClick={onExportCsv}
              className="technical-button flex items-center gap-2 px-4 py-1.5 text-xs font-semibold"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Exportar para Excel / CSV
            </button>
            {onExportOfx && (
              <button
                type="button"
                onClick={onExportOfx}
                className="technical-button flex items-center gap-2 px-4 py-1.5 text-xs font-semibold"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Exportar OFX Money
              </button>
            )}
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

        const saldoFinalRaw = (saldoAnterior || 0) + totalEntradas - totalSaidas;
        // Evita -0,00 por ponto flutuante quando entradas = saídas.
        const saldoFinal =
          Math.abs(saldoFinalRaw) < 0.005 ? 0 : Math.round(saldoFinalRaw * 100) / 100;
        const saldoZerado = Math.abs(saldoFinal) < 0.005;
        const saldoPositivo = saldoFinal > 0.005;

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-6 py-5 bg-white border-b border-brand-border animate-fade-in">
            {/* Card 1: Saldo Anterior */}
            <div className="bg-brand-sidebar/20 border border-brand-border p-4 flex flex-col justify-between gap-2.5 transition-all hover:border-brand-border shadow-[2px_2px_0_0_#141414]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-brand-sidebar border border-brand-border text-brand-text flex items-center justify-center">
                  <Wallet className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] font-bold text-brand-text/60 uppercase tracking-wider">Saldo Anterior</span>
              </div>
              <div className="relative flex items-center mt-1">
                <span className="absolute left-3 text-brand-text/50 font-mono text-xs font-bold z-[1]">R$</span>
                <FreeNumericInput
                  aria-label="Saldo anterior"
                  value={saldoAnterior}
                  onChange={(val) => {
                    setSaldoAnterior(val);
                    localStorage.setItem('saldo_anterior', String(val));
                  }}
                  displayDecimals={2}
                  hideZeroWhenBlurred={false}
                  placeholder="0,00"
                  className="w-full bg-white border border-brand-border focus:border-brand-border hover:border-brand-border pl-9 pr-3 py-1.5 text-xs font-mono font-bold text-brand-text outline-none transition-all placeholder-brand-text/40"
                />
              </div>
            </div>

            {/* Card 2: Entradas */}
            <div className="bg-brand-sidebar/20 border border-brand-border p-4 flex flex-col justify-between gap-2.5 transition-all hover:border-brand-border shadow-[2px_2px_0_0_#141414]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] font-bold text-brand-text/60 uppercase tracking-wider">Entradas</span>
              </div>
              <div className="mt-1">
                <span className="text-lg font-mono font-bold text-emerald-700">
                  R$ {totalEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Card 3: Saídas */}
            <div className="bg-brand-sidebar/20 border border-brand-border p-4 flex flex-col justify-between gap-2.5 transition-all hover:border-brand-border shadow-[2px_2px_0_0_#141414]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
                  <TrendingDown className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] font-bold text-brand-text/60 uppercase tracking-wider">Saídas</span>
              </div>
              <div className="mt-1">
                <span className="text-lg font-mono font-bold text-rose-600">
                  R$ {totalSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Card 4: Saldo Final */}
            <div className={`border p-4 flex flex-col justify-between gap-2.5 transition-all shadow-[2px_2px_0_0_#141414] ${ saldoZerado || saldoPositivo ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200' }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 flex items-center justify-center border ${ saldoZerado || saldoPositivo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200' }`}>
                    <DollarSign className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] font-bold text-brand-text/80 uppercase tracking-wider">Saldo Final</span>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 border ${ saldoZerado || saldoPositivo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200' }`}>
                  {saldoZerado ? 'Zerado' : saldoPositivo ? 'Positivo' : 'Devedor'}
                </span>
              </div>
              <div className="mt-1">
                <span className={`text-lg font-mono font-bold ${saldoZerado || saldoPositivo ? 'text-emerald-700' : 'text-rose-600'}`}>
                  R$ {saldoFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Exclusion Rules Management Card */}
      {rows.length > 0 && (
        <div className="px-6 py-5 bg-white/60 border-b border-brand-border flex flex-col gap-4 animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 bg-amber-950/30 text-amber-500 border border-amber-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Filter className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-xs text-brand-text uppercase tracking-wider flex items-center gap-2">
                  Filtros de Exclusão por Texto (Saldos, Taxas & Metadados)
                </h3>
                <p className="text-[11px] text-brand-text/60 leading-normal mt-0.5">
                  Digite palavras ou frases contidas nas linhas que você deseja excluir automaticamente. Se a linha contiver a frase digitada (como "SALDO ANTERIOR" ou "SALDO TOTAL"), ela será automaticamente removida da visualização e da exportação final.
                </p>
              </div>
            </div>

          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start bg-brand-bg p-4 border border-brand-border">
            {/* Input Form */}
            <div className="lg:col-span-4 flex flex-col gap-2">
              <span className="text-[10px] font-bold text-brand-text/60 uppercase tracking-wider block">Cadastrar Novo Filtro</span>
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
                  className="flex-1 text-xs font-semibold bg-white border border-brand-border focus:border-brand-border hover:border-brand-border px-3 py-2 text-brand-text placeholder-brand-text/40 outline-none transition-all"
                />
                <button
                  type="submit"
                  className="technical-button-primary px-3.5 py-2 text-xs font-bold cursor-pointer font-sans"
                >
                  Adicionar
                </button>
              </form>
            </div>

            {/* Active Rules List */}
            <div className="lg:col-span-8 flex flex-col gap-2">
              <span className="text-[10px] font-bold text-brand-text/60 uppercase tracking-wider block">Filtros Ativos ({exclusionRules.length})</span>
              <div className="flex flex-wrap gap-1.5 items-center max-h-[120px] overflow-y-auto pr-1">
                {exclusionRules.length === 0 ? (
                  <span className="text-xs text-brand-text/50 italic py-1">Nenhum filtro ativo no momento. Escreva acima para filtrar.</span>
                ) : (
                  exclusionRules.map((rule, idx) => (
                    <div
                      key={rule + '-' + idx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand-sidebar/50 text-brand-text border border-brand-border text-xs font-semibold transition-all group hover:bg-brand-sidebar"
                    >
                      <Filter className="w-3 h-3 text-brand-text animate-pulse" />
                      <span>{rule}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveRule(rule)}
                        className="p-0.5 hover:bg-rose-50 hover:text-rose-600 transition-colors text-brand-text cursor-pointer"
                        title="Remover este filtro"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Suggestions */}
              <div className="flex flex-wrap gap-2 items-center text-[10px] text-brand-text/60 mt-1 border-t border-brand-border/60 pt-2">
                <span className="font-medium text-brand-text/50">Sugestões rápidas:</span>
                {['SALDO ANTERIOR', 'SALDO DO DIA', 'SALDO ATUAL', 'SALDO DISPONÍVEL', 'TOTAL DISPONÍVEL', 'SDO ANTERIOR', 'TAR COMP'].map((suggest) => {
                  const alreadyActive = exclusionRules.some(r => r.toUpperCase() === suggest.toUpperCase());
                  if (alreadyActive) return null;
                  return (
                    <button
                      key={suggest}
                      type="button"
                      onClick={() => handleAddRule(suggest)}
                      className="px-2 py-0.5 bg-white hover:bg-brand-sidebar border border-brand-border text-brand-text/60 hover:text-brand-text text-[10px] font-medium transition-all cursor-pointer"
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
      <div className="flex-1 overflow-x-auto bg-brand-bg p-4 lg:p-6">
        {rows.length > 0 ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            
            {/* TABELA DE IMAGENS (ORIGINAL DO EXTRATO) */}
            <div className="flex flex-col gap-2 min-w-[340px]">
              <div className="flex items-center gap-2 px-1 py-1">
                <span className="w-2.5 h-2.5 bg-brand-text"></span>
                <h3 className="text-xs font-bold text-brand-text uppercase tracking-wider flex items-center gap-1.5">
                  <Image className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  Imagens Originais do PDF (Recorte)
                </h3>
              </div>
              <div className="overflow-x-auto border border-brand-border bg-brand-sidebar/30 shadow-[2px_2px_0_0_#141414]">
                <table className="w-full text-left border-collapse table-fixed">
                  <thead>
                    <tr className="bg-white border-b border-brand-border text-[10px] font-bold text-brand-text/60 uppercase tracking-wider">
                      <th className="py-3 px-3 w-10 text-center border-b border-brand-border">Nº</th>
                      <th className="py-3 px-3 w-1/4 border-b border-brand-border">Data Original</th>
                      <th className="py-3 px-3 w-1/2 border-b border-brand-border">Histórico Original</th>
                      <th className="py-3 px-3 w-1/4 border-b border-brand-border text-right">Valor Original</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border bg-brand-sidebar/30">
                    {filteredRows.map((row, index) => {
                      const isHovered = hoveredRowId === row.id;
                      return (
                        <tr
                          key={row.id}
                          onMouseEnter={() => setHoveredRowId(row.id)}
                          onMouseLeave={() => setHoveredRowId(null)}
                          className={`h-[78px] transition-colors border-b border-brand-border ${ isHovered ? 'bg-brand-sidebar/40 border-brand-border' : 'hover:bg-brand-sidebar/20' }`}
                        >
                          {/* index */}
                          <td className="py-3 px-3 text-center text-xs font-mono text-brand-text/50 font-bold">
                            {index + 1}
                          </td>

                          {/* Date Crop Column */}
                          <td className="py-3 px-3">
                            {row.dateCropUrl ? (
                              <div className="bg-white p-1 border border-brand-border flex items-center justify-center max-w-full overflow-hidden select-none h-11">
                                <img
                                  src={row.dateCropUrl}
                                  alt="Recorte Data"
                                  className={`max-h-9 object-contain opacity-90 hover:opacity-100 transition-all ${ invertCrops ? 'invert hue-rotate-180 brightness-125' : '' }`}
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            ) : (
                              <div className="text-[10px] text-brand-text/40 italic h-11 flex items-center justify-center">Sem recorte</div>
                            )}
                          </td>

                          {/* History Crop Column */}
                          <td className="py-3 px-3">
                            {row.historyCropUrl ? (
                              <div className="bg-white p-1 border border-brand-border flex items-center justify-start max-w-full overflow-hidden select-none h-11">
                                <img
                                  src={row.historyCropUrl}
                                  alt="Recorte Histórico"
                                  className={`max-h-9 object-contain opacity-90 hover:opacity-100 transition-all ${ invertCrops ? 'invert hue-rotate-180 brightness-125' : '' }`}
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            ) : (
                              <div className="text-[10px] text-brand-text/40 italic h-11 flex items-center">Sem recorte</div>
                            )}
                          </td>

                          {/* Value Crop Column */}
                          <td className="py-3 px-3">
                            {row.valueCropUrl ? (
                              <div className="bg-white p-1 border border-brand-border flex items-center justify-end max-w-full overflow-hidden select-none h-11">
                                <img
                                  src={row.valueCropUrl}
                                  alt="Recorte Valor"
                                  className={`max-h-9 object-contain opacity-90 hover:opacity-100 transition-all ${ invertCrops ? 'invert hue-rotate-180 brightness-125' : '' }`}
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            ) : (
                              <div className="text-[10px] text-brand-text/40 italic h-11 flex items-center justify-end">Sem recorte</div>
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
                <span className="w-2.5 h-2.5 bg-emerald-500"></span>
                <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                  <PencilLine className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  Dados Convertidos (Texto Editável)
                </h3>
              </div>
              <div className="overflow-x-auto border border-brand-border bg-brand-sidebar/30 shadow-[2px_2px_0_0_#141414]">
                <table className="w-full text-left border-collapse table-fixed">
                  <thead>
                    <tr className="bg-white border-b border-brand-border text-[10px] font-bold text-brand-text/60 uppercase tracking-wider">
                      <th className="py-3 px-3 w-10 text-center border-b border-brand-border">Nº</th>
                      <th className="py-3 px-3 w-[100px] border-b border-brand-border">Data</th>
                      <th className="py-3 px-3 border-b border-brand-border">Histórico</th>
                      <th className="py-3 px-3 w-[100px] border-b border-brand-border">Valor (R$)</th>
                      <th className="py-3 px-3 w-[130px] border-b border-brand-border">Sinal / Status</th>
                      <th className="py-3 px-3 w-10 text-center border-b border-brand-border"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border bg-brand-sidebar/30">
                    {filteredRows.map((row, index) => {
                      const isHovered = hoveredRowId === row.id;
                      return (
                        <tr
                          key={row.id}
                          onMouseEnter={() => setHoveredRowId(row.id)}
                          onMouseLeave={() => setHoveredRowId(null)}
                          className={`h-[78px] transition-colors border-b border-brand-border ${ isHovered ? 'bg-brand-sidebar/40 border-brand-border' : 'hover:bg-brand-sidebar/20' }`}
                        >
                          {/* index */}
                          <td className="py-3 px-3 text-center text-xs font-mono text-brand-text/50 font-bold">
                            {index + 1}
                          </td>

                          {/* Date Input */}
                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={row.dateText}
                              onChange={(e) => handleTextChange(row.id, 'dateText', e.target.value)}
                              className="text-xs font-mono font-medium text-brand-text bg-white hover:bg-brand-sidebar focus:bg-brand-sidebar border border-brand-border hover:border-brand-border focus:border-brand-border px-2 py-1.5 outline-none transition-all w-full text-center"
                              placeholder="Data"
                            />
                          </td>

                          {/* History Input */}
                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={row.historyText}
                              onChange={(e) => handleTextChange(row.id, 'historyText', e.target.value)}
                              className="text-xs font-medium text-brand-text bg-white hover:bg-brand-sidebar focus:bg-brand-sidebar border border-brand-border hover:border-brand-border focus:border-brand-border px-2 py-1.5 outline-none transition-all w-full truncate"
                              placeholder="Histórico"
                            />
                          </td>

                          {/* Value Input */}
                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={row.valueText}
                              onChange={(e) => handleTextChange(row.id, 'valueText', e.target.value)}
                              className={`text-xs font-mono font-bold bg-white hover:bg-brand-sidebar focus:bg-brand-sidebar border border-brand-border hover:border-brand-border focus:border-brand-border px-2 py-1.5 outline-none transition-all w-full text-center ${ row.isNegative ? 'text-rose-600' : 'text-emerald-700' }`}
                              placeholder="Valor"
                            />
                          </td>

                          {/* Positive/Negative Status Sign */}
                          <td className="py-3 px-3">
                            <div className="flex flex-col gap-0.5 justify-center">
                              <button
                                onClick={() => handleToggleSign(row.id)}
                                className={`inline-flex items-center gap-1 px-1.5 py-1 text-[10px] font-bold w-fit cursor-pointer border select-none transition-all active:scale-95 ${ row.isNegative ? 'bg-rose-50 border-rose-300 hover:border-rose-400 text-rose-600' : 'bg-emerald-50 border-emerald-300 hover:border-emerald-400 text-emerald-700' }`}
                                title="Clique para alternar sinal"
                              >
                                {row.isNegative ? (
                                  <>
                                    <TrendingDown className="w-3 h-3 text-rose-600" />
                                    <span>Despesa</span>
                                  </>
                                ) : (
                                  <>
                                    <TrendingUp className="w-3 h-3 text-emerald-700" />
                                    <span>Receita</span>
                                  </>
                                )}
                              </button>
                              
                              {row.parsedValue !== null ? (
                                <span className="text-[9px] font-mono text-brand-text/50 truncate" title={`R$ ${row.parsedValue}`}>
                                  R$ {row.parsedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              ) : (
                                <span className="text-[9px] font-mono text-rose-600 flex items-center gap-0.5">
                                  <AlertCircle className="w-2.5 h-2.5" /> Ilegível
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => handleDeleteRow(row.id)}
                              className="p-1 text-brand-text/40 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
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
          <div className="flex flex-col items-center justify-center text-center p-12 bg-white max-w-lg mx-auto my-8 border border-brand-border">
            <div className="w-14 h-14 bg-brand-sidebar text-brand-text/50 flex items-center justify-center mb-4 border border-brand-border shadow-[2px_2px_0_0_#141414]">
              <FileSpreadsheet className="w-7 h-7" />
            </div>
            <h3 className="font-semibold text-brand-text text-sm mb-1.5">Tabela Vazia</h3>
            <p className="text-brand-text/60 text-xs leading-relaxed mb-6">
              Nenhuma linha foi recortada ou mapeada ainda. Alinhe as colunas de Data, Histórico e Valor acima e clique no botão <strong>Recortar & Analisar</strong> para iniciar o processamento e preencher a tabela.
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={handleAddRow}
                className="technical-button px-4 py-2 font-semibold text-xs"
              >
                Inserir Linha Manual
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table Footer Instructions */}
      {rows.length > 0 && (
        <div className="px-6 py-4 bg-white border-t border-brand-border flex items-center justify-between gap-4 text-xs text-brand-text/60">
          <div className="flex items-center gap-1.5 mx-auto">
            <HelpCircle className="w-3.5 h-3.5 text-brand-text animate-pulse" />
            <span>Todos os dados e recortes podem ser editados diretamente na tabela antes de exportar.</span>
          </div>
        </div>
      )}
    </div>
  );
}
