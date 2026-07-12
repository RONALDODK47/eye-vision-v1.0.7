/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Transaction } from "../types";
import { 
  PieChart, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Calendar, 
  Tags,
  Percent
} from "lucide-react";

interface DashboardInsightsProps {
  transactions: Transaction[];
  currency: string;
}

export default function DashboardInsights({ transactions, currency }: DashboardInsightsProps) {
  const formatValue = (amount: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency || "BRL"
    }).format(amount);
  };

  // Group by category
  const categoriesMap: { [key: string]: number } = {};
  let totalExpenses = 0;

  transactions.forEach(t => {
    if (t.amount < 0) {
      const cat = t.category || "Outros";
      categoriesMap[cat] = (categoriesMap[cat] || 0) + Math.abs(t.amount);
      totalExpenses += Math.abs(t.amount);
    }
  });

  const categoryBreakdown = Object.keys(categoriesMap).map(name => ({
    name,
    value: categoriesMap[name],
    percentage: totalExpenses > 0 ? (categoriesMap[name] / totalExpenses) * 100 : 0
  })).sort((a, b) => b.value - a.value);

  // Group by date
  const datesMap: { [key: string]: { debits: number; credits: number } } = {};
  transactions.forEach(t => {
    if (!datesMap[t.date]) {
      datesMap[t.date] = { debits: 0, credits: 0 };
    }
    if (t.amount < 0) {
      datesMap[t.date].debits += Math.abs(t.amount);
    } else {
      datesMap[t.date].credits += t.amount;
    }
  });

  const chronologicalDates = Object.keys(datesMap).map(date => ({
    date,
    ...datesMap[date]
  })).sort((a, b) => a.date.localeCompare(b.date));

  // Determine top expense category
  const topCategory = categoryBreakdown[0]?.name || "Nenhuma";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Category Spending Breakdown */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-none p-6 shadow-md flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-5">
            <div className="flex items-center gap-2">
              <Tags className="w-5 h-5 text-emerald-400" />
              <h3 className="font-black text-white text-sm uppercase tracking-wider">Distribuição de Gastos por Categoria</h3>
            </div>
            {categoryBreakdown.length > 0 && (
              <span className="text-[9px] bg-emerald-500/10 text-emerald-400 font-black tracking-widest px-2.5 py-1 rounded-none uppercase border border-emerald-500/20">
                Foco: {topCategory}
              </span>
            )}
          </div>

          {categoryBreakdown.length === 0 ? (
            <p className="text-center text-zinc-500 font-mono text-xs py-12">
              Nenhuma despesa identificada para categorizar.
            </p>
          ) : (
            <div className="space-y-4">
              {categoryBreakdown.map((item, index) => {
                // High contrast blocky colors
                const colors = [
                  "bg-white",
                  "bg-emerald-400",
                  "bg-zinc-400",
                  "bg-rose-500",
                  "bg-amber-400",
                  "bg-sky-400",
                  "bg-purple-400"
                ];
                const color = colors[index % colors.length];

                return (
                  <div key={item.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-black text-white uppercase tracking-wide text-[11px]">{item.name}</span>
                      <div className="space-x-1.5 font-mono text-zinc-400">
                        <span className="font-black text-white">{formatValue(item.value)}</span>
                        <span>({item.percentage.toFixed(1)}%)</span>
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full h-2 bg-zinc-950 rounded-none overflow-hidden border border-zinc-850">
                      <div 
                        className={`h-full ${color} rounded-none transition-all duration-500`}
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        <div className="mt-6 pt-4 border-t border-zinc-800 text-center text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
          Proporção calculada sobre o total de saídas ({formatValue(totalExpenses)}).
        </div>
      </div>

      {/* Daily Inflow & Outflow Activity */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-none p-6 shadow-md">
        <div className="flex items-center gap-2 pb-4 border-b border-zinc-800 mb-5">
          <Calendar className="w-5 h-5 text-emerald-400" />
          <h3 className="font-black text-white text-sm uppercase tracking-wider">Resumo Cronológico Diário</h3>
        </div>

        {chronologicalDates.length === 0 ? (
          <p className="text-center text-zinc-500 font-mono text-xs py-12">
            Nenhuma transação disponível para mapear no calendário.
          </p>
        ) : (
          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {chronologicalDates.map((day) => {
              // Convert date format "2026-07-06" to "06 Jul"
              let formattedDay = day.date;
              try {
                const parts = day.date.split("-");
                if (parts.length === 3) {
                  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
                  formattedDay = `${parts[2]} de ${months[parseInt(parts[1]) - 1]}`;
                }
              } catch (_) {}

              return (
                <div key={day.date} className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-850 rounded-none hover:bg-zinc-900 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white uppercase tracking-wider">{formattedDay}</span>
                  </div>
                  
                  <div className="flex gap-4 text-xs font-mono">
                    {day.credits > 0 && (
                      <div className="flex items-center gap-1 text-emerald-400 font-bold">
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                        <span>+{formatValue(day.credits)}</span>
                      </div>
                    )}
                    {day.debits > 0 && (
                      <div className="flex items-center gap-1 text-rose-400 font-bold">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>-{formatValue(day.debits)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
