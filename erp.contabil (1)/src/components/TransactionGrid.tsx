/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Transaction } from "../types";
import { 
  Plus, 
  Trash2, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Grid, 
  RefreshCw,
  AlertCircle,
  History
} from "lucide-react";

interface TransactionGridProps {
  transactions: Transaction[];
  onUpdateTransactions: (updated: Transaction[]) => void;
  currency: string;
}

const COMMON_CATEGORIES = [
  "Alimentação",
  "Transporte",
  "Lazer",
  "Saúde",
  "Salário",
  "Serviços",
  "Investimentos",
  "Transferência",
  "Impostos",
  "Educação",
  "Habitação",
  "Outros"
];

export default function TransactionGrid({ 
  transactions, 
  onUpdateTransactions,
  currency 
}: TransactionGridProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saldoAnterior, setSaldoAnterior] = useState<number>(() => {
    const saved = localStorage.getItem("surya_saldo_anterior");
    return saved ? parseFloat(saved) || 0 : 0;
  });

  const handleSaldoAnteriorChange = (val: number) => {
    setSaldoAnterior(val);
    localStorage.setItem("surya_saldo_anterior", val.toString());
  };

  // Format currency value helpers
  const formatValue = (amount: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency || "BRL"
    }).format(amount);
  };

  // Change individual field
  const handleCellChange = (id: string, field: keyof Transaction, value: any) => {
    const updated = transactions.map(t => {
      if (t.id === id) {
        let finalVal = value;
        
        // Handle numerical values
        if (field === "amount") {
          finalVal = parseFloat(value) || 0;
          // Ensure correct sign based on type
          if (t.type === "DEBIT" && finalVal > 0) {
            finalVal = -finalVal;
          } else if (t.type === "CREDIT" && finalVal < 0) {
            finalVal = Math.abs(finalVal);
          }
        }
        
        // Handle type change
        if (field === "type") {
          const currentAmountAbs = Math.abs(t.amount);
          t.amount = finalVal === "DEBIT" ? -currentAmountAbs : currentAmountAbs;
        }

        return { ...t, [field]: finalVal };
      }
      return t;
    });
    onUpdateTransactions(updated);
  };

  // Delete transaction
  const handleDeleteRow = (id: string) => {
    const updated = transactions.filter(t => t.id !== id);
    onUpdateTransactions(updated);
    setSelectedIds(selectedIds.filter(sid => sid !== id));
  };

  // Delete selected transactions
  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    const updated = transactions.filter(t => !selectedIds.includes(t.id));
    onUpdateTransactions(updated);
    setSelectedIds([]);
  };

  // Toggle selection
  const toggleSelectRow = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === transactions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(transactions.map(t => t.id));
    }
  };

  // Add manual transaction
  const handleAddRow = () => {
    const newRow: Transaction = {
      id: `manual_${Date.now()}`,
      date: new Date().toISOString().substring(0, 10),
      description: "NOVO LANÇAMENTO MANUAL",
      amount: -10.00,
      type: "DEBIT",
      category: "Outros"
    };
    onUpdateTransactions([newRow, ...transactions]);
  };

  // Calculations
  const incomes = transactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
  const expenses = transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0);
  const totalBalance = incomes + expenses;

  // Merge default categories with any custom ones actually present in transactions
  const allCategories = Array.from(new Set([
    ...COMMON_CATEGORIES,
    ...transactions.map(t => t.category).filter(Boolean)
  ]));

  return (
    <div className="space-y-6">
      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Incomes */}
        <div className="bg-zinc-900 border-t-4 border-emerald-500 rounded-none p-5 shadow-md flex items-center gap-4">
          <div className="bg-emerald-500/10 p-3 rounded-none text-emerald-400">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-1">Entradas (Créditos)</span>
            <h4 className="text-2xl font-black text-emerald-400 mt-1">{formatValue(incomes)}</h4>
          </div>
        </div>

        {/* Total Expenses */}
        <div className="bg-zinc-900 border-t-4 border-rose-500 rounded-none p-5 shadow-md flex items-center gap-4">
          <div className="bg-rose-500/10 p-3 rounded-none text-rose-400">
            <TrendingDown className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-1">Saídas (Débitos)</span>
            <h4 className="text-2xl font-black text-rose-400 mt-1">{formatValue(Math.abs(expenses))}</h4>
          </div>
        </div>

        {/* Saldo Anterior Input Card */}
        <div className="bg-zinc-900 border-t-4 border-zinc-500 rounded-none p-5 shadow-md flex items-center gap-4">
          <div className="bg-zinc-500/10 p-3 rounded-none text-zinc-400">
            <History className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-1">Saldo Anterior</span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs font-mono text-zinc-500 font-bold">R$</span>
              <input
                type="number"
                step="0.01"
                value={saldoAnterior || ""}
                onChange={(e) => handleSaldoAnteriorChange(parseFloat(e.target.value) || 0)}
                placeholder="0,00"
                className="w-full bg-zinc-950 border border-zinc-850 hover:border-zinc-700 focus:border-white text-white font-mono font-black text-lg px-2 py-1 outline-none focus:ring-1 focus:ring-white rounded-none"
              />
            </div>
          </div>
        </div>

        {/* Net Balance with Final Balance display */}
        <div className="bg-zinc-900 border-t-4 border-white rounded-none p-5 shadow-md flex items-center gap-4">
          <div className="bg-white/10 p-3 rounded-none text-white">
            <DollarSign className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-1">Resultado Líquido</span>
            <h4 className={`text-2xl font-black mt-1 ${totalBalance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {formatValue(totalBalance)}
            </h4>
            <div className="text-[9px] text-zinc-500 font-mono uppercase mt-1">
              Saldo Final: <span className="font-bold text-zinc-300">{formatValue(saldoAnterior + totalBalance)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Control Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 p-5 rounded-none">
        <div className="flex items-center gap-2">
          <Grid className="w-5 h-5 text-emerald-400" />
          <h3 className="font-black text-white text-sm uppercase tracking-wider">
            Lançamentos Identificados ({transactions.length})
          </h3>
        </div>

        <div className="flex items-center gap-3.5 w-full sm:w-auto justify-end">
          {selectedIds.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1.5 px-4 py-2 border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-400 text-xs font-black uppercase tracking-widest rounded-none transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Excluir ({selectedIds.length})</span>
            </button>
          )}

          <button
            onClick={handleAddRow}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-white text-black text-xs font-black uppercase tracking-widest rounded-none hover:bg-emerald-400 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Linha</span>
          </button>
        </div>
      </div>

      {/* Responsive Transaction Table Wrapper */}
      <div className="bg-zinc-900 border-4 border-zinc-800 rounded-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-850/80 border-b border-zinc-800 text-zinc-400 text-[10px] font-black uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={transactions.length > 0 && selectedIds.length === transactions.length}
                    onChange={toggleSelectAll}
                    className="rounded-none border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-emerald-500"
                  />
                </th>
                <th className="py-3 px-4 w-36">Data</th>
                <th className="py-3 px-4 min-w-[200px]">Descrição / Histórico</th>
                <th className="py-3 px-4 w-32">Tipo</th>
                <th className="py-3 px-4 w-40">Categoria</th>
                <th className="py-3 px-4 w-36 text-right">Valor</th>
                <th className="py-3 px-4 w-12 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850 text-sm text-zinc-300">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-zinc-500">
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="w-8 h-8 text-zinc-600 animate-bounce" />
                      <p className="font-mono text-xs">Nenhuma transação extraída. Insira transações manuais ou envie um arquivo para processar.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                transactions.map((t) => {
                  const isDebit = t.type === "DEBIT";
                  return (
                    <tr 
                      key={t.id} 
                      className={`hover:bg-zinc-800/40 transition-colors ${
                        selectedIds.includes(t.id) ? "bg-zinc-800/80" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(t.id)}
                          onChange={() => toggleSelectRow(t.id)}
                          className="rounded-none border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-emerald-500"
                        />
                      </td>

                      {/* Date */}
                      <td className="py-2 px-3">
                        <input
                          type="date"
                          value={t.date}
                          onChange={(e) => handleCellChange(t.id, "date", e.target.value)}
                          className="w-full bg-zinc-950 hover:bg-zinc-900 focus:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:border-white rounded-none px-2 py-1 text-xs text-white focus:ring-1 focus:ring-white outline-none font-mono"
                        />
                      </td>

                      {/* Description */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={t.description}
                          onChange={(e) => handleCellChange(t.id, "description", e.target.value)}
                          className="w-full bg-zinc-950 hover:bg-zinc-900 focus:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:border-white rounded-none px-2.5 py-1 text-xs text-white focus:ring-1 focus:ring-white outline-none font-bold uppercase tracking-wide"
                        />
                      </td>

                      {/* Type (Debit/Credit) */}
                      <td className="py-2 px-3">
                        <select
                          value={t.type}
                          onChange={(e) => handleCellChange(t.id, "type", e.target.value)}
                          className={`w-full border rounded-none px-1.5 py-1 text-xs font-black outline-none focus:ring-1 focus:ring-white bg-zinc-950 hover:bg-zinc-900 ${
                            isDebit 
                              ? "text-rose-400 border-rose-950/40 focus:border-rose-400" 
                              : "text-emerald-400 border-emerald-950/40 focus:border-emerald-400"
                          }`}
                        >
                          <option value="DEBIT">DÉBITO</option>
                          <option value="CREDIT">CRÉDITO</option>
                        </select>
                      </td>

                      {/* Category */}
                      <td className="py-2 px-3">
                        <select
                          value={t.category}
                          onChange={(e) => handleCellChange(t.id, "category", e.target.value)}
                          className="w-full bg-zinc-950 hover:bg-zinc-900 focus:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:border-white rounded-none px-1.5 py-1 text-xs text-white focus:ring-1 focus:ring-white outline-none"
                        >
                          {allCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </td>

                      {/* Amount */}
                      <td className="py-2 px-3 text-right">
                        <div className="relative inline-flex items-center w-full justify-end">
                          <span className={`text-xs absolute left-2 font-black ${isDebit ? "text-rose-400" : "text-emerald-400"}`}>
                            {isDebit ? "-" : "+"}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            value={Math.abs(t.amount) || ""}
                            onChange={(e) => handleCellChange(t.id, "amount", e.target.value)}
                            className={`w-28 text-right bg-zinc-950 hover:bg-zinc-900 focus:bg-zinc-900 border rounded-none pl-6 pr-2 py-1 text-xs font-mono font-black outline-none focus:ring-1 focus:ring-white ${
                              isDebit 
                                ? "text-rose-400 border-rose-950/40 focus:border-rose-400" 
                                : "text-emerald-400 border-emerald-950/40 focus:border-emerald-400"
                            }`}
                          />
                        </div>
                      </td>

                      {/* Action Delete */}
                      <td className="py-2 px-4 text-center">
                        <button
                          onClick={() => handleDeleteRow(t.id)}
                          className="text-zinc-500 hover:text-rose-400 p-1 rounded-none hover:bg-rose-500/10 transition-colors"
                          title="Excluir Lançamento"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Foot Stats indicator */}
        <div className="bg-zinc-950 border-t border-zinc-800 py-3.5 px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-2 font-mono">
          <span>Dica: Edite as datas, textos e valores diretamente para ajustar as transações antes da exportação para o OFX.</span>
          <span className="font-mono bg-zinc-900 px-2.5 py-1 text-zinc-400">
            PADRÃO: YYYY-MM-DD
          </span>
        </div>
      </div>
    </div>
  );
}
