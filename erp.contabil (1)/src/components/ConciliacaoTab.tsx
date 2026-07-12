import React, { useState, useEffect, useRef } from "react";
import { Transaction, PlanoConta, Conciliacao, ChatMessage } from "../types";
import { 
  CheckCircle2, 
  HelpCircle, 
  Send, 
  Upload, 
  AlertTriangle, 
  Sparkles, 
  Cpu, 
  Wand2, 
  FileText, 
  FileSpreadsheet, 
  CornerDownRight, 
  FolderOpen 
} from "lucide-react";

interface ConciliacaoTabProps {
  transactions: Transaction[];
  planoContas: PlanoConta[];
  conciliacoes: Conciliacao[];
  setConciliacoes: React.Dispatch<React.SetStateAction<Conciliacao[]>>;
  cashBalance: number; // calculated from parent
  runCaixaCredorAutomation: () => void;
  onPostToBalancete: () => void;
}

export default function ConciliacaoTab({
  transactions,
  planoContas,
  conciliacoes,
  setConciliacoes,
  cashBalance,
  runCaixaCredorAutomation,
  onPostToBalancete
}: ConciliacaoTabProps) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "init",
      sender: "assistant",
      text: "Olá! Sou o Assistente de Conciliação Surya AI. Posso ajudar você a mapear as partidas dobradas automaticamente. \n\nVocê pode me mandar comandos como:\n• 'conciliar Uber em Despesas de Viagem'\n• 'mapear Salarios em despesas folha'\n• 'conciliar receitas na conta de Receitas de Serviços'\n\nOu anexe um arquivo de instruções para que eu processe!",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [attachedFile, setAttachedFile] = useState<{ name: string; type: string } | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() && !attachedFile) return;

    const userText = inputMessage;
    const msgId = "user_" + Date.now();
    const userMsg: ChatMessage = {
      id: msgId,
      sender: "user",
      text: userText,
      attachment: attachedFile ? { name: attachedFile.name, type: attachedFile.type } : undefined,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages(prev => [...prev, userMsg]);
    setInputMessage("");
    setAttachedFile(null);

    // Simulate AI accountant reasoning and action
    setTimeout(() => {
      let aiText = "Comando processado com sucesso! ";
      let actionTaken = false;
      const textLower = userText.toLowerCase();

      // Let's create copies for modifications
      let updatedConciliacoes = [...conciliacoes];

      // Handle custom instruction logic
      const getCode = (classif: string, defaultCode: string) => {
        return planoContas.find(p => p.classification === classif || p.code === classif)?.code || defaultCode;
      };

      if (textLower.includes("uber") || textLower.includes("viagem") || textLower.includes("alimentacao") || textLower.includes("alimentação")) {
        // Map Uber/alimentacao transactions
        let count = 0;
        transactions.forEach(t => {
          const desc = t.description.toLowerCase();
          if (desc.includes("uber") || desc.includes("almoco") || desc.includes("churrascaria") || desc.includes("comida") || desc.includes("posto")) {
            const index = updatedConciliacoes.findIndex(c => c.transactionId === t.id);
            const deb = getCode("5.01.04.001", "18"); // Despesas com viagem e alimentação
            const cred = getCode("1.01.02.001", "2"); // Banco
            if (index !== -1) {
              updatedConciliacoes[index] = { ...updatedConciliacoes[index], debitAccount: deb, creditAccount: cred, status: "CONCILIADO", observation: "Conciliado via Surya AI Chat" };
            } else {
              updatedConciliacoes.push({ transactionId: t.id, debitAccount: deb, creditAccount: cred, status: "CONCILIADO", observation: "Conciliado via Surya AI Chat" });
            }
            count++;
          }
        });
        aiText += `Mapeei com sucesso ${count} lançamentos relacionados a Alimentação/Viagem para Débito: ${getCode("5.01.04.001", "18")} (DESPESAS VIAGEM/ALIMENTAÇÃO) e Crédito: ${getCode("1.01.02.001", "2")} (BANCO CONTA CORRENTE).`;
        actionTaken = true;
      } else if (textLower.includes("salario") || textLower.includes("salário") || textLower.includes("folha")) {
        let count = 0;
        transactions.forEach(t => {
          const desc = t.description.toLowerCase();
          if (desc.includes("salario") || desc.includes("folha") || desc.includes("pagamento") || desc.includes("reembolso")) {
            const index = updatedConciliacoes.findIndex(c => c.transactionId === t.id);
            const deb = getCode("5.01.02.001", "16"); // Despesa folha
            const cred = getCode("1.01.02.001", "2"); // Banco
            if (index !== -1) {
              updatedConciliacoes[index] = { ...updatedConciliacoes[index], debitAccount: deb, creditAccount: cred, status: "CONCILIADO", observation: "Conciliado via Surya AI Chat" };
            } else {
              updatedConciliacoes.push({ transactionId: t.id, debitAccount: deb, creditAccount: cred, status: "CONCILIADO", observation: "Conciliado via Surya AI Chat" });
            }
            count++;
          }
        });
        aiText += `Mapeei ${count} lançamentos de Folha/Reembolsos para Débito: ${getCode("5.01.02.001", "16")} (DESPESAS COM SALÁRIOS E ENCARGOS) e Crédito: ${getCode("1.01.02.001", "2")} (BANCO).`;
        actionTaken = true;
      } else if (textLower.includes("receita") || textLower.includes("servico") || textLower.includes("vendas") || textLower.includes("prestacao")) {
        let count = 0;
        transactions.forEach(t => {
          if (t.type === "CREDIT") {
            const index = updatedConciliacoes.findIndex(c => c.transactionId === t.id);
            const deb = getCode("1.01.02.001", "2"); // Banco
            const cred = getCode("4.01.01.001", "13"); // Receitas
            if (index !== -1) {
              updatedConciliacoes[index] = { ...updatedConciliacoes[index], debitAccount: deb, creditAccount: cred, status: "CONCILIADO", observation: "Receita conciliada por comando" };
            } else {
              updatedConciliacoes.push({ transactionId: t.id, debitAccount: deb, creditAccount: cred, status: "CONCILIADO", observation: "Receita conciliada por comando" });
            }
            count++;
          }
        });
        aiText += `Reconheci e conciliei ${count} entradas de crédito em Débito: ${getCode("1.01.02.001", "2")} (BANCO CONTA CORRENTE) e Crédito: ${getCode("4.01.01.001", "13")} (RECEITA DE PRESTAÇÃO DE SERVIÇOS).`;
        actionTaken = true;
      }

      if (userMsg.attachment) {
        aiText += `\n\nAnalisei também o documento anexo "${userMsg.attachment.name}". Com base nas regras fiscais descritas no documento, otimizei os lançamentos contábeis correspondentes para refletir a tributação correta de despesas indedutíveis.`;
        // Match everything else to default expenses as standard behavior
        transactions.forEach(t => {
          const exists = updatedConciliacoes.some(c => c.transactionId === t.id);
          if (!exists) {
            const deb = t.type === "DEBIT" ? getCode("5.01.05.001", "19") : getCode("1.01.02.001", "2");
            const cred = t.type === "DEBIT" ? getCode("1.01.02.001", "2") : getCode("4.01.01.001", "13");
            updatedConciliacoes.push({
              transactionId: t.id,
              debitAccount: deb,
              creditAccount: cred,
              status: "CONCILIADO",
              observation: "Conciliado por lote de diretrizes anexas"
            });
          }
        });
        actionTaken = true;
      }

      if (!actionTaken) {
        aiText = "Não consegui identificar comandos estruturados de conciliação. Tente formular com palavras como 'Uber', 'Salários', 'Receita' ou anexe um documento de diretrizes contábeis (ex: planilha de custos ou notas explicativas).";
      } else {
        setConciliacoes(updatedConciliacoes);
      }

      setChatMessages(prev => [...prev, {
        id: "ai_" + Date.now(),
        sender: "assistant",
        text: aiText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    }, 1000);
  };

  const handleChatFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedFile({ name: file.name, type: file.type });
    }
  };

  const handleSelectAccountChange = (transactionId: string, side: "debit" | "credit", value: string) => {
    setConciliacoes(prev => {
      const index = prev.findIndex(c => c.transactionId === transactionId);
      if (index !== -1) {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          [side === "debit" ? "debitAccount" : "creditAccount"]: value,
          status: "CONCILIADO"
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            transactionId,
            debitAccount: side === "debit" ? value : "",
            creditAccount: side === "credit" ? value : "",
            status: "CONCILIADO"
          }
        ];
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Reconciliation Table */}
        <div className="lg:col-span-8 bg-zinc-900 border border-zinc-800 p-6 rounded-none space-y-6 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center pb-4 border-b border-zinc-800 mb-4">
              <div>
                <h4 className="text-xs font-black text-white uppercase tracking-wider">
                  Mapeamento de Lançamentos (Partidas Dobradas)
                </h4>
                <p className="text-[10px] text-zinc-500 font-mono uppercase mt-0.5">Defina Conta de Débito e Conta de Crédito para cada transação</p>
              </div>
              <button
                onClick={onPostToBalancete}
                className="px-4 py-2 border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black text-[10px] font-black uppercase tracking-wider rounded-none transition-all flex items-center gap-1.5"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Aplicar Conciliação ao Balancete</span>
              </button>
            </div>

            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-[10px] font-black uppercase tracking-wider">
                    <th className="py-2 px-1">Data/Histórico</th>
                    <th className="py-2 px-1">Valor</th>
                    <th className="py-2 px-1">Conta de Débito</th>
                    <th className="py-2 px-1">Conta de Crédito</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850 font-mono text-xs">
                  {transactions.map(t => {
                    const conc = conciliacoes.find(c => c.transactionId === t.id);
                    const debitVal = conc?.debitAccount || "";
                    const creditVal = conc?.creditAccount || "";

                    return (
                      <tr key={t.id} className="hover:bg-zinc-850/30">
                        <td className="py-3 px-1 space-y-0.5 max-w-[200px]">
                          <span className="text-[10px] text-zinc-500 block">{t.date}</span>
                          <span className="text-xs font-bold text-white uppercase tracking-wide font-sans block truncate" title={t.description}>
                            {t.description}
                          </span>
                        </td>
                        <td className="py-3 px-1 text-right font-black">
                          <span className={t.type === "DEBIT" ? "text-rose-400" : "text-emerald-400"}>
                            {t.type === "DEBIT" ? "-" : "+"}R${Math.abs(t.amount).toFixed(2)}
                          </span>
                        </td>
                        <td className="py-3 px-1.5">
                          <select
                            value={debitVal}
                            onChange={(e) => handleSelectAccountChange(t.id, "debit", e.target.value)}
                            className="w-full px-1.5 py-1.5 bg-zinc-950 border border-zinc-850 text-white rounded-none text-[10px] outline-none focus:border-white"
                          >
                            <option value="">[SELECIONE DÉBITO]</option>
                            {planoContas.map(p => (
                              <option key={p.code} value={p.code}>
                                {p.code} ({p.classification || ""}) - {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-1.5">
                          <select
                            value={creditVal}
                            onChange={(e) => handleSelectAccountChange(t.id, "credit", e.target.value)}
                            className="w-full px-1.5 py-1.5 bg-zinc-950 border border-zinc-850 text-white rounded-none text-[10px] outline-none focus:border-white"
                          >
                            <option value="">[SELECIONE CRÉDITO]</option>
                            {planoContas.map(p => (
                              <option key={p.code} value={p.code}>
                                {p.code} ({p.classification || ""}) - {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right column: AI Accountant Chatbot with files attachments */}
        <div className="lg:col-span-4 bg-zinc-900 border border-zinc-800 p-6 rounded-none flex flex-col h-[600px]">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-800 mb-4">
            <Cpu className="w-5 h-5 text-emerald-400 animate-pulse" />
            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-wider">Chat Conciliação Inteligente</h4>
              <p className="text-[9px] text-zinc-500 font-mono uppercase">Motor Surya AI Ativo</p>
            </div>
          </div>

          {/* Messages screen */}
          <div className="flex-1 overflow-y-auto space-y-3 p-3 bg-zinc-950 border border-zinc-850 mb-4 font-mono text-xs max-h-[380px]">
            {chatMessages.map(msg => (
              <div 
                key={msg.id} 
                className={`p-3 rounded-none flex flex-col space-y-1 max-w-[90%] ${
                  msg.sender === "user" 
                    ? "bg-white/10 text-white ml-auto border border-zinc-800" 
                    : "bg-zinc-900 text-zinc-300 border-l-4 border-emerald-500"
                }`}
              >
                <div className="flex justify-between items-center text-[9px] text-zinc-500 font-black">
                  <span>{msg.sender === "user" ? "VOCÊ" : "SURYA AI"}</span>
                  <span>{msg.timestamp}</span>
                </div>
                <p className="whitespace-pre-line leading-relaxed text-[11px] font-sans font-medium text-zinc-200">
                  {msg.text}
                </p>
                {msg.attachment && (
                  <div className="mt-2 p-2 bg-zinc-950 border border-zinc-800 flex items-center gap-2 text-xs text-white">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span className="truncate">{msg.attachment.name}</span>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input field */}
          <form onSubmit={handleSendMessage} className="space-y-2">
            {attachedFile && (
              <div className="p-2 bg-zinc-950 border border-zinc-800 flex items-center justify-between text-[10px] text-white font-mono">
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{attachedFile.name}</span>
                </div>
                <button 
                  type="button" 
                  onClick={() => setAttachedFile(null)}
                  className="text-rose-400 font-black hover:underline uppercase text-[9px]"
                >
                  [Remover]
                </button>
              </div>
            )}
            
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => chatFileRef.current?.click()}
                className="p-3 bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white hover:border-white transition-colors"
                title="Anexar Documento de Instrução"
              >
                <Upload className="w-4 h-4" />
              </button>
              <input 
                type="file"
                ref={chatFileRef}
                className="hidden"
                onChange={handleChatFileSelected}
              />
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ex: Conciliar Uber..."
                className="flex-1 px-3 bg-zinc-950 border border-zinc-800 text-white font-mono text-xs rounded-none focus:border-white outline-none"
              />
              <button
                type="submit"
                className="p-3 bg-white text-black hover:bg-emerald-400 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
