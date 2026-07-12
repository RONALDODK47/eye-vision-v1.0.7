import React, { useState } from "react";
import { BalanceteLine, Transaction, Conciliacao, HonorarioProvisao, LoanContract } from "../types";
import { Plus, Upload, Calculator, RefreshCw, FileCheck, X, FileText, ArrowDownLeft, ArrowUpRight, Download, BookOpen } from "lucide-react";

interface BalanceteTabProps {
  balancete: BalanceteLine[];
  setBalancete: React.Dispatch<React.SetStateAction<BalanceteLine[]>>;
  onResetBalancete: () => void;
  transactions: Transaction[];
  conciliacoes: Conciliacao[];
  provisoes: HonorarioProvisao[];
  contracts: LoanContract[];
}

export default function BalanceteTab({ 
  balancete, 
  setBalancete, 
  onResetBalancete,
  transactions,
  conciliacoes,
  provisoes,
  contracts
}: BalanceteTabProps) {
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedRazaoAccount, setSelectedRazaoAccount] = useState<BalanceteLine | null>(null);
  const [showOnlyWithMovement, setShowOnlyWithMovement] = useState(true);

  // Computes ledger entries (Razão) for a specific account dynamically and with chronological order
  const getRazaoEntries = (account: BalanceteLine) => {
    const entries: {
      date: string;
      description: string;
      debit: number;
      credit: number;
      type: "D" | "C";
    }[] = [];

    // 1. Process reconciled OFX transactions
    transactions.forEach((t) => {
      const conc = conciliacoes.find((c) => c.transactionId === t.id);
      if (conc && conc.status === "CONCILIADO") {
        const amt = Math.abs(t.amount);
        if (conc.debitAccount === account.code) {
          entries.push({
            date: t.date,
            description: `CONCILIAÇÃO OFX: ${t.description.toUpperCase()}`,
            debit: amt,
            credit: 0,
            type: "D",
          });
        }
        if (conc.creditAccount === account.code) {
          entries.push({
            date: t.date,
            description: `CONCILIAÇÃO OFX: ${t.description.toUpperCase()}`,
            debit: 0,
            credit: amt,
            type: "C",
          });
        }
      }
    });

    // 2. Process Honorários Provisions (12 months)
    provisoes.forEach((p) => {
      // Unconditional to match Balancete's live recalculation
      if (p.accountCode === account.code) {
        for (let m = 1; m <= 12; m++) {
          const monthStr = String(m).padStart(2, "0");
          entries.push({
            date: `${p.year}-${monthStr}-28`,
            description: `PROVISÃO HONORÁRIOS MENSAIS - MÊS ${monthStr}/${p.year}`,
            debit: p.monthlyValue,
            credit: 0,
            type: "D",
          });
        }
      }
      if (account.code === "8" || account.classification === "2.01.04.001") {
        for (let m = 1; m <= 12; m++) {
          const monthStr = String(m).padStart(2, "0");
          entries.push({
            date: `${p.year}-${monthStr}-28`,
            description: `PROVISÃO HONORÁRIOS MENSAIS - MÊS ${monthStr}/${p.year}`,
            debit: 0,
            credit: p.monthlyValue,
            type: "C",
          });
        }
      }
    });

    // 3. Process Posted Loans/Contracts
    contracts.forEach((c) => {
      if (c.posted) {
        const totalInterest = c.installments.reduce((sum, inst) => sum + inst.interest, 0);

        // Principal entry on bank account
        if (account.code === "2" || account.classification === "1.01.02.001") {
          entries.push({
            date: c.startDate,
            description: `EMPRÉSTIMO CONTRAÍDO (VALOR REPASSADO) - ${c.name.toUpperCase()} (${c.bank.toUpperCase()})`,
            debit: c.principal,
            credit: 0,
            type: "D",
          });
        }

        // Interest entry on expense account
        if (account.code === "14" || account.classification === "5.01.03.001") {
          entries.push({
            date: c.startDate,
            description: `PROVISÃO DE JUROS TOTAIS S/ CONTRATO - ${c.name.toUpperCase()} (${c.bank.toUpperCase()})`,
            debit: totalInterest,
            credit: 0,
            type: "D",
          });
        }

        // Liability side
        const isMutuo = c.folder.includes("Mutuo") || c.folder.includes("Mútuo");
        if (isMutuo) {
          if (account.code === "7" || account.classification === "2.01.03.001") {
            entries.push({
              date: c.startDate,
              description: `LANÇAMENTO DE CONTRATO DE MÚTUO PASSIVO - ${c.name.toUpperCase()} (${c.bank.toUpperCase()})`,
              debit: 0,
              credit: c.principal + totalInterest,
              type: "C",
            });
          }
        } else {
          if (account.code === "6" || account.classification === "2.01.02.001") {
            entries.push({
              date: c.startDate,
              description: `REGISTRO DE EMPRÉSTIMO BANCÁRIO A PAGAR - ${c.name.toUpperCase()} (${c.bank.toUpperCase()})`,
              debit: 0,
              credit: c.principal + totalInterest,
              type: "C",
            });
          }
        }
      }
    });

    // Sort chronologically by date
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance based on account normal group type
    let currentBalance = account.openingBalance;
    const isAssetOrExpense = account.type === "ATIVO" || account.type === "DESPESA";

    return entries.map((entry) => {
      if (isAssetOrExpense) {
        currentBalance = currentBalance + entry.debit - entry.credit;
      } else {
        currentBalance = currentBalance - entry.debit + entry.credit;
      }

      return {
        ...entry,
        balanceAfter: parseFloat(currentBalance.toFixed(2)),
      };
    });
  };

  // Calculate Column Totals
  const totalOpening = balancete.reduce((sum, item) => {
    // Assets are positive, Liabilities/Equity are negative representation, let's just sum absolute or display raw
    return sum + item.openingBalance;
  }, 0);

  const totalDebit = balancete.reduce((sum, item) => sum + item.debit, 0);
  const totalCredit = balancete.reduce((sum, item) => sum + item.credit, 0);
  
  const totalClosing = balancete.reduce((sum, item) => sum + item.closingBalance, 0);

  // Accounting Integrity Checks
  const assetsValue = balancete.filter(i => i.type === "ATIVO").reduce((s, i) => s + i.closingBalance, 0);
  const liabilitiesValue = balancete.filter(i => i.type === "PASSIVO" || i.type === "PATRIMONIO_LIQUIDO").reduce((s, i) => s + i.closingBalance, 0);
  const revenuesValue = balancete.filter(i => i.type === "RECEITA").reduce((s, i) => s + i.closingBalance, 0);
  const expensesValue = balancete.filter(i => i.type === "DESPESA").reduce((s, i) => s + i.closingBalance, 0);

  // Equation: Ativo = Passivo + PL + (Receitas - Despesas)
  const resultPeriod = revenuesValue - expensesValue;
  const equationBalance = assetsValue - (liabilitiesValue + resultPeriod);

  // Helper to check if row has movement
  const hasMovement = (row: BalanceteLine) => {
    return (row.openingBalance !== 0) || (row.debit !== 0) || (row.credit !== 0) || (row.closingBalance !== 0);
  };

  // Check if any descendant has movement
  const hasDescendantWithMovement = (row: BalanceteLine) => {
    if (!row.classification) return false;
    return balancete.some(other => 
      other.classification && 
      other.classification !== row.classification && 
      other.classification.startsWith(row.classification + ".") && 
      hasMovement(other)
    );
  };

  const displayedBalancete = showOnlyWithMovement
    ? balancete.filter(row => hasMovement(row) || hasDescendantWithMovement(row))
    : balancete;

  const handleImportStartingBalances = () => {
    try {
      setImportError(null);
      if (!importText.trim()) return;

      const lines = importText.split("\n");
      let updatedBalancete = [...balancete];
      let matches = 0;

      for (let line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(/[;,\t]/);
        if (parts.length < 2) continue;

        const code = parts[0].trim();
        const rawBalance = parts[1].replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".").trim();
        const balanceValue = parseFloat(rawBalance);

        if (isNaN(balanceValue)) continue;

        const targetIdx = updatedBalancete.findIndex(b => b.code === code || b.classification === code);
        if (targetIdx !== -1) {
          const item = updatedBalancete[targetIdx];
          item.openingBalance = balanceValue;
          
          // Re-evaluate closing
          if (item.type === "ATIVO" || item.type === "DESPESA") {
            item.closingBalance = balanceValue + item.debit - item.credit;
          } else {
            item.closingBalance = balanceValue - item.debit + item.credit;
          }
          matches++;
        }
      }

      if (matches === 0) {
        throw new Error("Nenhum código de conta coincidente com o Plano de Contas foi localizado.");
      }

      setBalancete(updatedBalancete);
      setImportText("");
      setShowImport(false);
      alert(`Saldos Iniciais de ${matches} contas importados e harmonizados com sucesso!`);
    } catch (err: any) {
      setImportError(err.message || "Erro de formatação. Certifique-se de usar: COD_CONTA;SALDO");
    }
  };

  const handleManualBalanceChange = (code: string, val: string) => {
    const num = parseFloat(val) || 0;
    setBalancete(prev => prev.map(item => {
      if (item.code === code) {
        let closing = num;
        if (item.type === "ATIVO" || item.type === "DESPESA") {
          closing = num + item.debit - item.credit;
        } else {
          closing = num - item.debit + item.credit;
        }
        return {
          ...item,
          openingBalance: num,
          closingBalance: closing
        };
      }
      return item;
    }));
  };

  return (
    <div className="space-y-6">
      {/* Control panel & action header */}
      <div className="bg-zinc-900 border-4 border-zinc-800 p-6 rounded-none flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h3 className="font-black text-white text-base uppercase tracking-wider">Balancete de Verificação</h3>
          <p className="text-xs text-zinc-400 font-mono mt-1">
            Composição harmônica em tempo real combinando saldos de abertura importados, conciliações OFX e provisões anuais.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-2 cursor-pointer select-none border border-zinc-700 bg-zinc-950 px-3 py-2 hover:border-white transition-colors">
            <input
              type="checkbox"
              checked={showOnlyWithMovement}
              onChange={(e) => setShowOnlyWithMovement(e.target.checked)}
              className="accent-emerald-500 cursor-pointer w-4 h-4"
            />
            <span className="text-[10px] text-zinc-300 font-black uppercase tracking-widest">Apenas Contas com Movimento</span>
          </label>
          <button
            onClick={() => setShowImport(!showImport)}
            className="px-4 py-2 border border-zinc-700 hover:border-white text-xs font-black uppercase tracking-widest text-zinc-300 rounded-none transition-colors flex items-center gap-2"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Adicionar Balancete (Saldos Iniciais)</span>
          </button>
          <button
            onClick={onResetBalancete}
            className="px-4 py-2 bg-zinc-850 hover:bg-zinc-800 text-xs font-black uppercase tracking-widest text-zinc-400 rounded-none transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Zerar Movimentos</span>
          </button>
        </div>
      </div>

      {/* Import Saldos Panel */}
      {showImport && (
        <div className="bg-zinc-900 border-4 border-emerald-500/40 p-6 rounded-none space-y-4">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-black uppercase tracking-widest text-white">Importar Saldos Iniciais de Balancete</span>
          </div>
          <p className="text-zinc-400 text-xs font-mono">
            Cole os códigos de conta e seus respectivos saldos de abertura para integrar. Formato: <code className="text-white bg-zinc-950 px-1 py-0.5 font-bold">Código;Saldo</code>.
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="1.01.01.001;12450,50&#10;1.01.02.001;35000,00&#10;2.01.01.001;8200,00"
            rows={5}
            className="w-full p-3 bg-zinc-950 border border-zinc-800 text-white font-mono text-xs rounded-none focus:border-white focus:ring-0"
          />
          {importError && (
            <div className="p-3 bg-rose-950/30 border-l-4 border-rose-500 text-rose-300 text-xs">
              <span>{importError}</span>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowImport(false)}
              className="px-4 py-2 bg-zinc-800 text-zinc-400 text-xs font-black uppercase tracking-widest hover:bg-zinc-700"
            >
              Cancelar
            </button>
            <button
              onClick={handleImportStartingBalances}
              className="px-5 py-2 bg-emerald-500 text-black text-xs font-black uppercase tracking-widest hover:bg-emerald-400"
            >
              Harmonizar Balancete
            </button>
          </div>
        </div>
      )}

      {/* Accounting Compliance Scoreboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-none">
          <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">TOTAL DE ATIVOS</span>
          <p className="text-lg font-mono font-black text-white">
            R$ {assetsValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-none">
          <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">PASSIVOS + PL</span>
          <p className="text-lg font-mono font-black text-white">
            R$ {liabilitiesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-none">
          <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">RESULTADO DO PERÍODO (LUCRO)</span>
          <p className={`text-lg font-mono font-black ${resultPeriod >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            R$ {resultPeriod.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-zinc-900 border-4 border-emerald-500/30 p-4 rounded-none flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">CONFORMIDADE / DIFERENÇA</span>
            <p className="text-xs font-mono font-black text-emerald-400">
              {Math.abs(equationBalance) < 0.05 ? "✓ EQUILÍBRIO PARFEITO (PARTIDAS DOBRADAS)" : `DIFERENÇA: R$ ${equationBalance.toFixed(2)}`}
            </p>
          </div>
          <FileCheck className="w-6 h-6 text-emerald-400 shrink-0" />
        </div>
      </div>

      {/* Live Balancete Table */}
      <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-[10px] font-black uppercase tracking-wider">
                <th className="py-2.5 px-3">Código</th>
                <th className="py-2.5 px-3">Classificação</th>
                <th className="py-2.5 px-3">Conta</th>
                <th className="py-2.5 px-3">Grupo</th>
                <th className="py-2.5 px-3 text-right">Saldo Inicial</th>
                <th className="py-2.5 px-3 text-right text-emerald-400">Débito (D)</th>
                <th className="py-2.5 px-3 text-right text-rose-400">Crédito (C)</th>
                <th className="py-2.5 px-3 text-right">Saldo Final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850 font-mono text-xs text-zinc-300">
              {displayedBalancete.map((row) => {
                let typeColor = "text-sky-400";
                if (row.type === "PASSIVO") typeColor = "text-amber-400";
                else if (row.type === "RECEITA") typeColor = "text-emerald-400";
                else if (row.type === "DESPESA") typeColor = "text-rose-400";
                else if (row.type === "PATRIMONIO_LIQUIDO") typeColor = "text-purple-400";

                return (
                  <tr key={row.code} className="hover:bg-zinc-850/40">
                    <td 
                      className="py-2 px-3 text-emerald-400 font-bold cursor-pointer hover:underline hover:text-emerald-300 select-none"
                      onClick={() => setSelectedRazaoAccount(row)}
                      title={`Clique para abrir o Razão da conta ${row.name}`}
                    >
                      {row.code}
                    </td>
                    <td 
                      className="py-2 px-3 text-zinc-400 font-mono cursor-pointer hover:underline hover:text-zinc-200 select-none"
                      onClick={() => setSelectedRazaoAccount(row)}
                      title={`Clique para abrir o Razão da conta ${row.name}`}
                    >
                      {row.classification || "-"}
                    </td>
                    <td className="py-2 px-3 text-zinc-200 font-sans uppercase font-bold text-xs">{row.name}</td>
                    <td className="py-2 px-3 text-[10px]">
                      <span className={`${typeColor} font-bold`}>{row.type}</span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={row.openingBalance || ""}
                        onChange={(e) => handleManualBalanceChange(row.code, e.target.value)}
                        placeholder="0,00"
                        className="w-24 text-right bg-zinc-950 border border-zinc-850 text-white font-mono text-[11px] focus:border-white p-1 rounded-none outline-none"
                      />
                    </td>
                    <td className="py-2 px-3 text-right text-emerald-400 font-bold">
                      {row.debit > 0 ? `R$ ${row.debit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                    </td>
                    <td className="py-2 px-3 text-right text-rose-400 font-bold">
                      {row.credit > 0 ? `R$ ${row.credit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                    </td>
                    <td className={`py-2 px-3 text-right font-bold ${row.closingBalance < 0 ? "text-rose-400" : "text-white"}`}>
                      R$ {row.closingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}

              {/* Totals Row */}
              <tr className="bg-zinc-950 font-black text-white text-xs border-t-2 border-zinc-800">
                <td colSpan={4} className="py-3 px-3 font-sans uppercase">TOTALIZADORES DO BALANCETE</td>
                <td className="py-3 px-3 text-right">
                  R$ {totalOpening.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-3 text-right text-emerald-400">
                  R$ {totalDebit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-3 text-right text-rose-400">
                  R$ {totalCredit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-3 text-right">
                  R$ {totalClosing.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Dynamic Account Ledger (Razão) Modal */}
      {selectedRazaoAccount && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border-4 border-zinc-800 w-full max-w-5xl rounded-none flex flex-col max-h-[90vh] shadow-2xl">
            {/* Header */}
            <div className="bg-zinc-950 p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-400" />
                <div>
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">
                    Razão Contábil Analítico
                  </h4>
                  <p className="text-[10px] text-zinc-500 font-mono uppercase mt-0.5">
                    Conta: <span className="text-emerald-400 font-bold">{selectedRazaoAccount.code}</span> • Classificação: <span className="text-zinc-300 font-bold">{selectedRazaoAccount.classification || "-"}</span> • <span className="text-zinc-400">{selectedRazaoAccount.name}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRazaoAccount(null)}
                className="p-1 text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Account Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-zinc-800 bg-zinc-950/40 border-b border-zinc-800">
              <div className="p-4">
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">Grupo / Tipo</span>
                <span className="text-xs font-bold text-white uppercase font-sans block mt-1">{selectedRazaoAccount.type}</span>
              </div>
              <div className="p-4">
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">Saldo Inicial</span>
                <span className="text-xs font-mono font-bold text-zinc-300 block mt-1">
                  R$ {selectedRazaoAccount.openingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="p-4">
                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block">Total Débitos</span>
                <span className="text-xs font-mono font-bold text-emerald-400 block mt-1">
                  R$ {selectedRazaoAccount.debit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="p-4">
                <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest block">Total Créditos</span>
                <span className="text-xs font-mono font-bold text-rose-400 block mt-1">
                  R$ {selectedRazaoAccount.credit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="p-4 col-span-2 sm:col-span-1 bg-zinc-950/80">
                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest block">Saldo Final</span>
                <span className={`text-sm font-mono font-black block mt-0.5 ${selectedRazaoAccount.closingBalance < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                  R$ {selectedRazaoAccount.closingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Ledger Entries Table */}
            <div className="p-6 overflow-y-auto flex-1">
              {getRazaoEntries(selectedRazaoAccount).length === 0 ? (
                <div className="text-center py-12 space-y-4">
                  <FileText className="w-12 h-12 text-zinc-700 mx-auto" />
                  <div>
                    <p className="text-white text-xs font-black uppercase tracking-wider">Nenhum Lançamento Encontrado</p>
                    <p className="text-[10px] text-zinc-500 font-mono uppercase mt-1">
                      Não existem partidas de débito ou crédito reconciliadas ou provisionadas nesta conta.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="border border-zinc-850">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-950 border-b border-zinc-850 text-zinc-500 text-[10px] font-black uppercase tracking-wider">
                        <th className="py-2.5 px-3">Data</th>
                        <th className="py-2.5 px-3">Descrição Histórica / Origem</th>
                        <th className="py-2.5 px-3 text-right text-emerald-400">Débito (D)</th>
                        <th className="py-2.5 px-3 text-right text-rose-400">Crédito (C)</th>
                        <th className="py-2.5 px-3 text-center">Partida</th>
                        <th className="py-2.5 px-3 text-right">Saldo Progressivo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850 font-mono text-xs text-zinc-300">
                      {/* Show Initial Balance as the first line of the ledger context */}
                      <tr className="bg-zinc-950/30">
                        <td className="py-2 px-3 text-zinc-500">-</td>
                        <td className="py-2 px-3 text-zinc-400 font-bold italic uppercase text-[10px]">SALDO INICIAL DE ABERTURA</td>
                        <td className="py-2 px-3 text-right text-zinc-500">-</td>
                        <td className="py-2 px-3 text-right text-zinc-500">-</td>
                        <td className="py-2 px-3 text-center text-zinc-500">-</td>
                        <td className="py-2 px-3 text-right font-bold text-zinc-300">
                          R$ {selectedRazaoAccount.openingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>

                      {getRazaoEntries(selectedRazaoAccount).map((entry, idx) => {
                        const dateObj = new Date(entry.date + "T12:00:00");
                        const formattedDate = !isNaN(dateObj.getTime())
                          ? dateObj.toLocaleDateString('pt-BR')
                          : entry.date;

                        return (
                          <tr key={idx} className="hover:bg-zinc-850/30">
                            <td className="py-2.5 px-3 text-zinc-400">{formattedDate}</td>
                            <td className="py-2.5 px-3 text-zinc-200 uppercase text-[11px] font-sans font-medium">
                              {entry.description}
                            </td>
                            <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                              {entry.debit > 0 ? `R$ ${entry.debit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                            </td>
                            <td className="py-2.5 px-3 text-right text-rose-400 font-bold">
                              {entry.credit > 0 ? `R$ ${entry.credit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`px-1.5 py-0.5 text-[9px] font-black ${entry.type === 'D' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                                {entry.type}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-white">
                              R$ {entry.balanceAfter.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="bg-zinc-950 p-4 border-t border-zinc-800 flex justify-between items-center">
              <button
                onClick={() => {
                  const entries = getRazaoEntries(selectedRazaoAccount);
                  let csvContent = "data:text/csv;charset=utf-8,";
                  csvContent += "Data;Descricao;Debito;Credito;Tipo;Saldo Progressivo\n";
                  csvContent += `-;SALDO INICIAL DE ABERTURA;-;-;-;${selectedRazaoAccount.openingBalance}\n`;
                  entries.forEach(e => {
                    csvContent += `${e.date};${e.description};${e.debit};${e.credit};${e.type};${e.balanceAfter}\n`;
                  });
                  const encodedUri = encodeURI(csvContent);
                  const link = document.createElement("a");
                  link.setAttribute("href", encodedUri);
                  link.setAttribute("download", `Razao_Conta_${selectedRazaoAccount.code}.csv`);
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                disabled={getRazaoEntries(selectedRazaoAccount).length === 0}
                className="px-4 py-2 border border-zinc-800 hover:border-white text-xs font-black uppercase tracking-widest text-zinc-300 rounded-none transition-colors flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar Razão (.CSV)</span>
              </button>
              <button
                onClick={() => setSelectedRazaoAccount(null)}
                className="px-6 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-black uppercase tracking-widest rounded-none transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
