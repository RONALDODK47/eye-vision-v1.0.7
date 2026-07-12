import React, { useState } from "react";
import { HonorarioProvisao, PlanoConta } from "../types";
import { Plus, Check, Trash2, CalendarDays, Coins, ShieldCheck } from "lucide-react";

interface HonorariosTabProps {
  planoContas: PlanoConta[];
  provisoes: HonorarioProvisao[];
  setProvisoes: React.Dispatch<React.SetStateAction<HonorarioProvisao[]>>;
  onPostProvisionsToBalancete: (updatedProvs: HonorarioProvisao[]) => void;
}

export default function HonorariosTab({
  planoContas,
  provisoes,
  setProvisoes,
  onPostProvisionsToBalancete
}: HonorariosTabProps) {
  const [targetYear, setTargetYear] = useState<number>(new Date().getFullYear());
  const [monthlyValue, setMonthlyValue] = useState<number>(1200.00);
  const [expenseAccount, setExpenseAccount] = useState<string>(() => {
    const found = planoContas.find(p => p.classification === "5.01.01.001" || p.code === "15");
    return found ? found.code : "15";
  });
  const [liabilityAccount, setLiabilityAccount] = useState<string>(() => {
    const found = planoContas.find(p => p.classification === "2.01.04.001" || p.code === "8");
    return found ? found.code : "8";
  });

  const handleLaunchProvisions = (e: React.FormEvent) => {
    e.preventDefault();
    if (monthlyValue <= 0 || !targetYear) return;

    // Check if there is already a provision for this year
    if (provisoes.some(p => p.year === targetYear)) {
      if (!confirm(`Já existem provisões de honorários cadastradas para o ano de ${targetYear}. Deseja substituí-las?`)) {
        return;
      }
    }

    const newProvision: HonorarioProvisao = {
      id: "prov_" + targetYear + "_" + Date.now(),
      year: targetYear,
      monthlyValue,
      accountCode: expenseAccount,
      posted: true
    };

    // Filter out previous for same year and add new
    const updatedProvs = [...provisoes.filter(p => p.year !== targetYear), newProvision];
    setProvisoes(updatedProvs);
    onPostProvisionsToBalancete(updatedProvs);
    alert(`Provisões de Honorários do ano ${targetYear} lançadas com sucesso em todos os 12 meses!`);
  };

  const handleDeleteProvision = (id: string) => {
    if (confirm("Deseja realmente remover estas provisões do balancete?")) {
      const updatedProvs = provisoes.filter(p => p.id !== id);
      setProvisoes(updatedProvs);
      onPostProvisionsToBalancete(updatedProvs);
    }
  };

  const MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  return (
    <div className="space-y-6">
      {/* Overview & Core Provision Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Provision Form */}
        <form onSubmit={handleLaunchProvisions} className="lg:col-span-5 bg-zinc-900 border border-zinc-800 p-6 rounded-none space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-800 mb-2">
            <Coins className="w-5 h-5 text-emerald-400" />
            <h3 className="font-black text-white text-xs uppercase tracking-wider">Lançar Provisão de Honorários</h3>
          </div>

          <p className="text-[11px] text-zinc-400 font-mono leading-relaxed">
            Informe o ano e o valor mensal. O sistema irá automatizar o lançamento contábil de provisão (Partidas Dobradas) para todos os 12 meses do ano respectivo, refletindo no Balancete.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Ano de Lançamento</label>
              <input
                type="number"
                required
                value={targetYear}
                onChange={(e) => setTargetYear(parseInt(e.target.value) || new Date().getFullYear())}
                placeholder="2026"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 text-white font-mono text-xs rounded-none focus:border-white focus:ring-0"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Valor Mensal (R$)</label>
              <input
                type="number"
                step="0.01"
                required
                value={monthlyValue}
                onChange={(e) => setMonthlyValue(parseFloat(e.target.value) || 0)}
                placeholder="1500.00"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 text-white font-mono text-xs rounded-none focus:border-white focus:ring-0"
              />
            </div>
          </div>

          {/* Account selections */}
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Conta de Débito (Despesa)</label>
              <select
                value={expenseAccount}
                onChange={(e) => setExpenseAccount(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 text-white text-xs rounded-none focus:border-white focus:ring-0"
              >
                {planoContas.filter(p => p.type === "DESPESA").map(p => (
                  <option key={p.code} value={p.code}>
                    {p.code} ({p.classification || ""}) - {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Conta de Crédito (Passivo)</label>
              <select
                value={liabilityAccount}
                onChange={(e) => setLiabilityAccount(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 text-white text-xs rounded-none focus:border-white focus:ring-0"
              >
                {planoContas.filter(p => p.type === "PASSIVO").map(p => (
                  <option key={p.code} value={p.code}>
                    {p.code} ({p.classification || ""}) - {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-white hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-widest transition-colors rounded-none flex items-center justify-center gap-2"
          >
            <CalendarDays className="w-4 h-4" />
            <span>Lançar Provisões em Lote</span>
          </button>
        </form>

        {/* Provision Listings & Previews */}
        <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 p-6 rounded-none flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-black text-white uppercase tracking-wider pb-3 border-b border-zinc-800 mb-4">
              Lançamentos Anuais de Honorários Ativos
            </h4>

            {provisoes.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-zinc-500 text-xs font-mono uppercase">Nenhuma provisão ativa de honorários lançada no balancete.</p>
              </div>
            ) : (
              <div className="space-y-6 max-h-[380px] overflow-y-auto">
                {provisoes.map((prov) => {
                  const yearlyTotal = prov.monthlyValue * 12;
                  return (
                    <div key={prov.id} className="p-4 bg-zinc-950 border border-zinc-850 space-y-3">
                      <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                        <div>
                          <p className="text-white text-xs font-black uppercase tracking-wider">
                            EXERCÍCIO {prov.year}
                          </p>
                          <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                            Valor Mensal: R$ {prov.monthlyValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-emerald-400 font-mono uppercase font-black bg-emerald-500/10 px-2.5 py-1 border border-emerald-500/20">
                            LANÇADO (12 MESES)
                          </span>
                          <button
                            onClick={() => handleDeleteProvision(prov.id)}
                            className="text-zinc-500 hover:text-rose-500 transition-colors p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Display 12 Months Mini-grid */}
                      <div className="grid grid-cols-4 gap-2">
                        {MONTH_NAMES.map((name, idx) => (
                          <div key={idx} className="p-1.5 bg-zinc-900 text-center border border-zinc-850">
                            <span className="text-[8px] font-mono text-zinc-500 block uppercase">{name.substring(0, 3)}</span>
                            <span className="text-[10px] font-mono font-bold text-white">
                              R${prov.monthlyValue.toFixed(0)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400 pt-1.5">
                        <span>Total de Lançamentos de Débito: R$ {yearlyTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        <span>D: {prov.accountCode} | C: {liabilityAccount}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-4 bg-zinc-950 border border-zinc-850 mt-6 flex gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="text-[10px] text-zinc-500 font-mono leading-relaxed uppercase">
              As provisões anuais geram lançamentos mensais automáticos de R$ [Valor Mensal] debitando a conta de Despesas com Honorários Contábeis e creditando a conta de Honorários Contábeis a Pagar no passivo de forma perfeitamente harmonizada.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
