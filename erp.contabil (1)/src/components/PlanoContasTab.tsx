import React, { useState, useRef } from "react";
import { PlanoConta } from "../types";
import { Plus, Trash2, Upload, AlertCircle, FileSpreadsheet, RefreshCw, Loader2, Sparkles } from "lucide-react";

interface PlanoContasTabProps {
  planoContas: PlanoConta[];
  setPlanoContas: React.Dispatch<React.SetStateAction<PlanoConta[]>>;
  customApiKey?: string;
  selectedModel?: string;
}

export default function PlanoContasTab({ 
  planoContas, 
  setPlanoContas,
  customApiKey = "",
  selectedModel = "gemini-3.5-flash"
}: PlanoContasTabProps) {
  const [newCode, setNewCode] = useState("");
  const [newClassification, setNewClassification] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<PlanoConta["type"]>("ATIVO");
  
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [confirmClear, setConfirmClear] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // SPED Receita Federal Validation States
  const [isValidatingReceita, setIsValidatingReceita] = useState(false);
  const [receitaReport, setReceitaReport] = useState<{
    success: boolean;
    message: string;
    seal: string;
    timestamp: string;
    report: {
      totalSynthetic: number;
      totalAnalytical: number;
      status: string;
    };
  } | null>(null);

  // Advanced import states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importingStep, setImportingStep] = useState("");

  const handleValidateReceita = async () => {
    if (planoContas.length === 0) return;
    try {
      setIsValidatingReceita(true);
      setImportError(null);
      const response = await fetch("/api/receita-validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accounts: planoContas }),
      });
      if (!response.ok) {
        throw new Error(`Erro na conexão com a Receita Federal: ${response.statusText}`);
      }
      const data = await response.json();
      if (data.success && data.validatedAccounts) {
        setPlanoContas(data.validatedAccounts);
        setReceitaReport({
          success: data.success,
          message: data.message,
          seal: data.seal,
          timestamp: data.timestamp,
          report: data.report
        });
      } else {
        throw new Error("Resposta inválida do servidor de validação.");
      }
    } catch (err: any) {
      setImportError(err.message || "Erro durante a validação na Receita Federal SPED.");
    } finally {
      setIsValidatingReceita(false);
    }
  };

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!newCode || !newName || !newClassification) return;

    // Check duplicates
    if (planoContas.some(p => p.code === newCode.trim())) {
      setFormError("Já existe uma conta com este código reduzido!");
      return;
    }

    const newAccount: PlanoConta = {
      code: newCode.trim(),
      classification: newClassification.trim(),
      name: newName.trim().toUpperCase(),
      type: newType
    };

    setPlanoContas([...planoContas, newAccount]);
    setNewCode("");
    setNewClassification("");
    setNewName("");
  };

  const handleDeleteAccount = (code: string) => {
    setPlanoContas(planoContas.filter(p => p.code !== code));
  };

  // Immediate file-chooser dialog click trigger
  const handleImportButtonClick = () => {
    fileInputRef.current?.click();
  };

  // Parse mime type by filename extension
  const getMimeByExt = (filename: string): string => {
    const ext = filename.toLowerCase();
    if (ext.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (ext.endsWith(".xls")) return "application/vnd.ms-excel";
    if (ext.endsWith(".csv")) return "text/csv";
    if (ext.endsWith(".pdf")) return "application/pdf";
    if (ext.endsWith(".txt")) return "text/plain";
    return "application/octet-stream";
  };

  // Handle file select & trigger Gemini OCR or excel reading on backend
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportingStep("Lendo arquivo selecionado...");
    setImportError(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = reader.result as string;
        const base64Data = result.split(",")[1];
        const mimeType = file.type || getMimeByExt(file.name);

        setImportingStep("Processando com Inteligência Artificial Gemini...");

        const response = await fetch("/api/convert-plano", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileBase64: base64Data,
            mimeType,
            fileName: file.name,
            customApiKey,
            selectedModel
          }),
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.error || `Erro do servidor (${response.status})`);
        }

        const data = await response.json();
        if (data && data.planoContas && data.planoContas.length > 0) {
          setPlanoContas(data.planoContas);
          alert(`Plano de Contas importado com sucesso! ${data.planoContas.length} contas carregadas.`);
        } else {
          throw new Error("Nenhuma conta pôde ser extraída desse documento. Certifique-se de que o arquivo contém dados de Plano de Contas legíveis.");
        }
      } catch (err: any) {
        console.error("Erro ao importar plano de contas:", err);
        setImportError(err.message || "Erro desconhecido ao processar documento.");
      } finally {
        setIsImporting(false);
        setImportingStep("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    reader.onerror = () => {
      setImportError("Erro ao ler o arquivo físico.");
      setIsImporting(false);
      setImportingStep("");
    };

    reader.readAsDataURL(file);
  };

  // Fallback direct text pasting import
  const handleImportPlanoText = () => {
    try {
      setImportError(null);
      if (!importText.trim()) return;

      const lines = importText.split("\n");
      const parsed: PlanoConta[] = [];
      let sequentialCounter = 1;

      for (let line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(/[;,\t]/);
        if (parts.length < 2) continue;

        let code = "";
        let classification = "";
        let name = "";
        let typeRaw = "";

        if (parts.length >= 4) {
          code = parts[0].trim();
          classification = parts[1].trim();
          name = parts[2].trim().toUpperCase();
          typeRaw = parts[3] ? parts[3].trim().toUpperCase() : "";
        } else {
          classification = parts[0].trim();
          name = parts[1].trim().toUpperCase();
          typeRaw = parts[2] ? parts[2].trim().toUpperCase() : "";
          code = String(sequentialCounter++);
        }
        
        let type: PlanoConta["type"] = "ATIVO";
        if (typeRaw.includes("PASSIVO")) type = "PASSIVO";
        else if (typeRaw.includes("RECEITA")) type = "RECEITA";
        else if (typeRaw.includes("DESPESA")) type = "DESPESA";
        else if (typeRaw.includes("PATRIMONIO") || typeRaw.includes("PL") || typeRaw.includes("LIQUIDO")) type = "PATRIMONIO_LIQUIDO";

        parsed.push({ code, classification, name, type });
      }

      if (parsed.length === 0) {
        throw new Error("Nenhuma conta válida detectada. Use o formato: CÓDIGO_REDUZIDO;CLASSIFICAÇÃO;NOME;TIPO");
      }

      setPlanoContas(parsed);
      setImportText("");
      setShowImport(false);
    } catch (err: any) {
      setImportError(err.message || "Erro ao ler as contas. Verifique o formato.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden file input that triggers on demand */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileImport}
        accept=".xlsx,.xls,.csv,.txt,.pdf,.png,.jpg,.jpeg,.webp"
        className="hidden"
      />

      {/* Overview & Controls */}
      <div className="bg-zinc-900 border-4 border-zinc-800 p-6 rounded-none flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="font-black text-white text-base uppercase tracking-wider">Plano de Contas Integrado</h3>
          <p className="text-xs text-zinc-400 font-mono mt-1">
            Mapeamento dinâmico de contas para conciliação automatizada de partidas dobradas (Débito e Crédito).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {planoContas.length > 0 && (
            <div className="flex items-center gap-1.5 bg-zinc-950 p-1 border border-zinc-850">
              <button
                type="button"
                onClick={() => {
                  if (confirmClear) {
                    setPlanoContas([]);
                    setConfirmClear(false);
                  } else {
                    setConfirmClear(true);
                  }
                }}
                className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-none transition-all flex items-center gap-2 ${
                  confirmClear
                    ? "bg-rose-600 hover:bg-rose-500 text-white border border-rose-500 animate-pulse"
                    : "bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-rose-400"
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${confirmClear ? "animate-spin" : ""}`} />
                <span>{confirmClear ? "Confirmar Exclusão?" : "Limpar Tudo"}</span>
              </button>
              {confirmClear && (
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-2.5 py-2 text-[10px] font-mono uppercase bg-zinc-850 hover:bg-zinc-800 text-zinc-400"
                >
                  Cancelar
                </button>
              )}
            </div>
          )}
          
          <button
            onClick={handleImportButtonClick}
            disabled={isImporting}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black uppercase tracking-widest rounded-none transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isImporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5 stroke-[3]" />
            )}
            <span>Importar Plano</span>
          </button>

          {planoContas.length > 0 && (
            <button
              type="button"
              onClick={handleValidateReceita}
              disabled={isValidatingReceita}
              className="px-4 py-2 bg-zinc-950 hover:bg-zinc-900 text-emerald-400 hover:text-emerald-300 border-2 border-emerald-500/50 hover:border-emerald-400 text-xs font-black uppercase tracking-widest rounded-none transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isValidatingReceita ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>API Receita Federal SPED</span>
            </button>
          )}

          <button
            onClick={() => setShowImport(!showImport)}
            className="px-3 py-2 border border-zinc-800 hover:border-zinc-600 text-xs font-mono uppercase text-zinc-400 hover:text-zinc-300 rounded-none transition-colors"
          >
            Colar Texto
          </button>
        </div>
      </div>

      {/* SPED validation report panel */}
      {receitaReport && (
        <div className="bg-zinc-950 border-4 border-emerald-500 p-5 rounded-none space-y-4 relative overflow-hidden">
          <div className="absolute right-3 top-3 opacity-10 pointer-events-none">
            <Sparkles className="w-32 h-32 text-emerald-500" />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="w-3.5 h-3.5 bg-emerald-500 rounded-full animate-ping" />
              <div>
                <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-black block">Conexão Ativa & Integrada</span>
                <h4 className="text-white text-xs font-black uppercase tracking-wider">{receitaReport.seal}</h4>
              </div>
            </div>
            <span className="text-[9px] font-mono text-zinc-500 uppercase">Sincronizado em: {new Date(receitaReport.timestamp).toLocaleTimeString()}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center sm:text-left">
            <div className="p-3 bg-zinc-900/60 border border-zinc-850">
              <span className="text-[9px] text-zinc-500 font-mono uppercase block">Contas Sintéticas (Grupos)</span>
              <span className="text-white text-lg font-black">{receitaReport.report.totalSynthetic}</span>
            </div>
            <div className="p-3 bg-zinc-900/60 border border-zinc-850">
              <span className="text-[9px] text-zinc-500 font-mono uppercase block">Contas Analíticas (Lançamentos)</span>
              <span className="text-white text-lg font-black">{receitaReport.report.totalAnalytical}</span>
            </div>
            <div className="p-3 bg-zinc-900/60 border border-zinc-850">
              <span className="text-[9px] text-zinc-500 font-mono uppercase block">Classificação SPED</span>
              <span className="text-emerald-400 text-sm font-black uppercase">{receitaReport.report.status}</span>
            </div>
          </div>
          <p className="text-[10px] text-zinc-400 font-mono leading-relaxed uppercase">
            A API Receita Federal SPED analisou a hierarquia de classificação do seu plano de contas. Todas as contas foram validadas e classificadas em Sintéticas (Graus de grupo) ou Analíticas (Para lançamentos de diário/balancete) com correspondência direta no Plano de Contas Referencial.
          </p>
        </div>
      )}

      {/* Loading overlay/step tracker for AI Import */}
      {isImporting && (
        <div className="bg-zinc-950 border-4 border-emerald-500 p-6 rounded-none space-y-4 flex flex-col items-center justify-center text-center animate-pulse">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          <div className="space-y-1">
            <h4 className="text-xs font-black text-white uppercase tracking-widest">Processando Inteligência Artificial</h4>
            <p className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider">{importingStep}</p>
          </div>
          <p className="text-[9px] text-zinc-500 font-mono max-w-md uppercase">
            A IA está processando seu documento (PDF, Imagem, CSV ou Excel) para estruturar todas as contas sintéticas e analíticas e carregar seu Plano de Contas completo.
          </p>
        </div>
      )}

      {/* Manual Paste / Fallback Error panel */}
      {importError && (
        <div className="p-4 bg-rose-950/40 border-4 border-rose-500 text-rose-300 text-xs flex gap-3 rounded-none">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">
            <span className="font-black uppercase block tracking-wider text-white">Falha na Extração</span>
            <p className="font-mono text-[10px]">{importError}</p>
            <p className="text-[9px] text-zinc-500 uppercase mt-2">Dica: Tente enviar uma planilha em Excel/CSV limpa ou use a colagem de texto manual abaixo.</p>
          </div>
          <button 
            onClick={() => setImportError(null)} 
            className="text-[10px] uppercase font-mono text-zinc-400 hover:text-white border border-zinc-800 px-2 py-1 self-start"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Manual Paste Panel */}
      {showImport && (
        <div className="bg-zinc-900 border-4 border-emerald-500/40 p-6 rounded-none space-y-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-black uppercase tracking-widest text-white">Importar via Colagem de Texto</span>
          </div>
          <p className="text-zinc-400 text-xs font-mono">
            Cole as linhas de seu plano de contas no formato completo: <code className="text-white bg-zinc-950 px-1 py-0.5 font-bold">CódigoReduzido;Classificação;Nome;Tipo</code> (Tipo pode ser ATIVO, PASSIVO, PATRIMONIO_LIQUIDO, RECEITA ou DESPESA). Ou apenas <code className="text-white bg-zinc-950 px-1 py-0.5 font-bold">Classificação;Nome;Tipo</code> (o código reduzido será gerado sequencialmente).
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="1;1.01.01.001;CAIXA GERAL;ATIVO&#10;2;2.01.01.001;FORNECEDORES;PASSIVO&#10;13;4.01.01.001;RECEITA SERVICOS;RECEITA"
            rows={5}
            className="w-full p-3 bg-zinc-950 border border-zinc-800 text-white font-mono text-xs rounded-none focus:border-white focus:ring-0"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowImport(false)}
              className="px-4 py-2 bg-zinc-800 text-zinc-400 text-xs font-black uppercase tracking-widest hover:bg-zinc-700"
            >
              Cancelar
            </button>
            <button
              onClick={handleImportPlanoText}
              className="px-5 py-2 bg-emerald-500 text-black text-xs font-black uppercase tracking-widest hover:bg-emerald-400"
            >
              Confirmar Importação
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Add Account Form */}
        <form onSubmit={handleAddAccount} className="lg:col-span-4 bg-zinc-900 border border-zinc-800 p-6 rounded-none space-y-4">
          <h4 className="text-xs font-black text-white uppercase tracking-wider pb-3 border-b border-zinc-800">
            Cadastrar Nova Conta
          </h4>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Código Reduzido (Código)</label>
            <input
              type="text"
              required
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="Ex: 5"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 text-white font-mono text-xs rounded-none focus:border-white focus:ring-0"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Classificação</label>
            <input
              type="text"
              required
              value={newClassification}
              onChange={(e) => setNewClassification(e.target.value)}
              placeholder="Ex: 1.01.01.005"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 text-white font-mono text-xs rounded-none focus:border-white focus:ring-0"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Nome da Conta</label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex: CAIXA ESCRITORIO SP"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 text-white font-mono text-xs rounded-none focus:border-white focus:ring-0"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Grupo / Tipo</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as PlanoConta["type"])}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 text-white font-bold text-xs rounded-none focus:border-white focus:ring-0"
            >
              <option value="ATIVO">ATIVO (Bens e Direitos)</option>
              <option value="PASSIVO">PASSIVO (Obrigações)</option>
              <option value="PATRIMONIO_LIQUIDO">PATRIMÔNIO LÍQUIDO</option>
              <option value="RECEITA">RECEITA (Faturamento/Rendimentos)</option>
              <option value="DESPESA">DESPESA (Custos e Gastos)</option>
            </select>
          </div>

          {formError && (
            <div className="p-3 bg-rose-950/30 border-l-4 border-rose-500 text-rose-300 text-xs flex gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 bg-white hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-widest transition-colors rounded-none flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Conta</span>
          </button>
        </form>

        {/* Plano de Contas List */}
        <div className="lg:col-span-8 bg-zinc-900 border border-zinc-800 p-6 rounded-none flex flex-col">
          <h4 className="text-xs font-black text-white uppercase tracking-wider pb-3 border-b border-zinc-800 mb-4">
            Contas Mapeadas ({planoContas.length})
          </h4>

          <div className="overflow-x-auto flex-grow max-h-[440px] overflow-y-auto">
            {planoContas.length === 0 ? (
              <div className="py-16 px-4 text-center space-y-4">
                <FileSpreadsheet className="w-12 h-12 text-zinc-600 mx-auto" />
                <div className="space-y-1">
                  <p className="text-white text-xs font-black uppercase tracking-wider">
                    Plano de Contas Vazio
                  </p>
                  <p className="text-[10px] text-zinc-500 font-mono uppercase max-w-md mx-auto leading-relaxed">
                    Clique no botão <span className="text-zinc-300">"Importar Plano"</span> para enviar qualquer documento (Excel, PDF, Imagem, CSV ou TXT) ou use o formulário ao lado para cadastrar manualmente.
                  </p>
                </div>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-[10px] font-black uppercase tracking-wider">
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Classificação</th>
                    <th className="py-2.5 px-3">Nome da Conta</th>
                    <th className="py-2.5 px-3">Estrutura SPED</th>
                    <th className="py-2.5 px-3">Tipo/Grupo</th>
                    <th className="py-2.5 px-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850 font-mono text-xs">
                  {planoContas.map((account) => {
                    let typeColor = "text-sky-400";
                    if (account.type === "PASSIVO") typeColor = "text-amber-400";
                    else if (account.type === "RECEITA") typeColor = "text-emerald-400";
                    else if (account.type === "DESPESA") typeColor = "text-rose-400";
                    else if (account.type === "PATRIMONIO_LIQUIDO") typeColor = "text-purple-400";

                    const isSynthetic = account.isSynthetic !== undefined
                      ? account.isSynthetic
                      : (account.classification ? account.classification.split('.').length < 5 : false);

                    return (
                      <tr 
                        key={account.code} 
                        className={isSynthetic 
                          ? "bg-zinc-950 border-l-4 border-emerald-500 hover:bg-zinc-950/90 transition-all" 
                          : "hover:bg-zinc-850/50 transition-colors border-l-4 border-transparent"
                        }
                      >
                        <td className={`py-2 px-3 text-emerald-400 font-bold ${isSynthetic ? "text-sm font-black" : "text-xs"}`}>
                          {account.code}
                        </td>
                        <td className={`py-2 px-3 font-mono ${isSynthetic ? "text-white font-black text-xs" : "text-zinc-400 text-xs"}`}>
                          {account.classification || "-"}
                        </td>
                        <td className={`py-2 px-3 font-sans uppercase ${isSynthetic ? "text-white font-black text-sm tracking-wide" : "text-zinc-300 text-xs font-semibold"}`}>
                          <div>{account.name}</div>
                          {account.rfbCode && (
                            <div className="text-[9px] font-mono text-emerald-400 mt-0.5 flex items-center gap-1 uppercase tracking-tight">
                              <span className="bg-emerald-950 text-emerald-400 px-1 border border-emerald-500/20 text-[7px] font-black rounded-none">SPED REF</span>
                              <span>{account.rfbCode} - {account.rfbName}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {isSynthetic ? (
                            <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-950/40 px-2 py-0.5 border border-emerald-500/20">
                              🟢 SINTÉTICA (S)
                            </span>
                          ) : (
                            <span className="text-[9px] font-semibold uppercase text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800">
                              ⚡ ANALÍTICA (A)
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`text-[9px] font-bold uppercase tracking-wider ${isSynthetic ? "bg-zinc-900 border border-zinc-800 px-2 py-0.5" : ""} ${typeColor}`}>
                            {account.type}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteAccount(account.code)}
                            className="text-zinc-600 hover:text-rose-400 p-1 rounded-none hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
