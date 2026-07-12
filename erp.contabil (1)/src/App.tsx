import React, { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { 
  FileCheck, 
  RefreshCw, 
  Sliders, 
  Key, 
  Database, 
  Plus,
  BookOpen,
  Cpu,
  Receipt,
  FileText,
  BadgeCent,
  TrendingUp,
  FolderOpen,
  Sparkles,
  Trash2
} from "lucide-react";

import Header from "./components/Header";
import FileUploader from "./components/FileUploader";
import TransactionGrid from "./components/TransactionGrid";
import OFXConfigForm from "./components/OFXConfigForm";
import DashboardInsights from "./components/DashboardInsights";
import { downloadOFXFile } from "./utils/ofxGenerator";
import { 
  Transaction, 
  BankConfig, 
  ExtractedData, 
  PlanoConta, 
  BalanceteLine, 
  Conciliacao, 
  DocumentoFiscal, 
  DocumentoFolha, 
  HonorarioProvisao, 
  LoanContract,
  Company
} from "./types";

import { DEFAULT_PLANO_CONTAS, DEFAULT_BALANCETE, STANDARD_PLANO_CONTAS } from "./lib/accounting";
import PlanoContasTab from "./components/PlanoContasTab";
import ConciliacaoTab from "./components/ConciliacaoTab";
import BalanceteTab from "./components/BalanceteTab";
import FiscalFolhaTab from "./components/FiscalFolhaTab";
import HonorariosTab from "./components/HonorariosTab";
import EmprestimoTab from "./components/EmprestimoTab";

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<
    "ofx" | "plano" | "conciliacao" | "balancete" | "fiscal_folha" | "honorarios" | "emprestimos" | "config_ia"
  >("ofx");

  // State management
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currency, setCurrency] = useState<string>("BRL");
  const [summary, setSummary] = useState<string>("");
  const [originalFileName, setOriginalFileName] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStep, setProcessingStep] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // IA config
  interface AIModel {
    id: string;
    name: string;
    isPaid: boolean;
    category?: "free_no_quota" | "free_with_quota" | "paid_only";
    description: string;
  }

  const [customApiKey, setCustomApiKey] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3.5-flash");
  const [availableModels, setAvailableModels] = useState<AIModel[]>([
    {
      id: "gemini-3.5-flash",
      name: "Gemini 3.5 Flash",
      isPaid: false,
      category: "free_no_quota",
      description: "RECOMENDADO - Processamento ultra rápido e precisão máxima para documentos e extração de dados."
    },
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      isPaid: false,
      category: "free_no_quota",
      description: "GRÁTIS SEM COTA - Modelo alternativo de última geração estável e alta confiabilidade."
    },
    {
      id: "gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro (Preview)",
      isPaid: true,
      category: "paid_only",
      description: "PREMIUM PAGO - Inteligência superior para planilhas complexas, caligrafia manual ou baixa resolução."
    },
    {
      id: "gemini-3.1-flash-lite",
      name: "Gemini 3.1 Flash Lite",
      isPaid: false,
      category: "free_no_quota",
      description: "GRÁTIS SEM COTA - Modelo extremamente ágil e leve para processamento em lote."
    },
    {
      id: "gemini-flash-latest",
      name: "Gemini Flash (Latest)",
      isPaid: false,
      category: "free_no_quota",
      description: "GRÁTIS SEM COTA - Alias dinâmico para a versão estável mais recente do Gemini Flash."
    }
  ]);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);
  const [modelsSource, setModelsSource] = useState<"api" | "fallback">("fallback");

  // Load models dynamically from server
  useEffect(() => {
    let active = true;
    const fetchModels = async () => {
      setIsLoadingModels(true);
      try {
        const url = `/api/models?customApiKey=${encodeURIComponent(customApiKey)}`;
        const res = await fetch(url);
        if (res.ok && active) {
          const data = await res.json();
          if (data && data.models) {
            setAvailableModels(data.models);
            setModelsSource(data.source || "api");
            // If the currently selected model isn't in the newly fetched list, auto-select the first one
            if (!data.models.some((m: any) => m.id === selectedModel)) {
              setSelectedModel(data.models[0]?.id || "gemini-3.5-flash");
            }
          }
        }
      } catch (err) {
        console.error("Erro ao carregar modelos via API, usando fallbacks:", err);
      } finally {
        if (active) setIsLoadingModels(false);
      }
    };

    fetchModels();
    return () => {
      active = false;
    };
  }, [customApiKey]);

  // Multi-Company Architecture State
  const [companies, setCompanies] = useState<Company[]>(() => {
    const saved = localStorage.getItem("erp_companies");
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(() => {
    return localStorage.getItem("erp_selected_company_id");
  });

  const isSwitching = React.useRef(false);

  // Expanded Accounting state
  const [planoContas, setPlanoContas] = useState<PlanoConta[]>([]);
  const [balancete, setBalancete] = useState<BalanceteLine[]>([]);
  const [conciliacoes, setConciliacoes] = useState<Conciliacao[]>([]);
  const [fiscalDocs, setFiscalDocs] = useState<DocumentoFiscal[]>([]);
  const [folhaDocs, setFolhaDocs] = useState<DocumentoFolha[]>([]);
  const [provisoes, setProvisoes] = useState<HonorarioProvisao[]>([]);
  const [contracts, setContracts] = useState<LoanContract[]>([]);

  // Bank config standard defaults
  const [bankConfig, setBankConfig] = useState<BankConfig>({
    bankId: "341", 
    bankName: "Itaú Unibanco",
    accountId: "12345-6",
    accountType: "CHECKING",
    currency: "BRL"
  });

  // Load company-specific data whenever company is changed or on initial load
  const loadCompanyData = (coId: string) => {
    isSwitching.current = true;
    const savedData = localStorage.getItem(`erp_co_data_${coId}`);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setTransactions(parsed.transactions || []);
        setCurrency(parsed.currency || "BRL");
        setSummary(parsed.summary || "");
        setOriginalFileName(parsed.originalFileName || "");
        setPlanoContas(parsed.planoContas || []);
        setConciliacoes(parsed.conciliacoes || []);
        setFiscalDocs(parsed.fiscalDocs || []);
        setFolhaDocs(parsed.folhaDocs || []);
        setProvisoes(parsed.provisoes || []);
        setContracts(parsed.contracts || []);
        if (parsed.bankConfig) setBankConfig(parsed.bankConfig);
      } catch (err) {
        console.error("Erro ao carregar dados da empresa:", err);
      }
    } else {
      // Clear data to pristine defaults if no company data exists
      setTransactions([]);
      setCurrency("BRL");
      setSummary("");
      setOriginalFileName("");
      setPlanoContas([]);
      setConciliacoes([]);
      setFiscalDocs([]);
      setFolhaDocs([]);
      setProvisoes([]);
      setContracts([]);
    }
    setTimeout(() => {
      isSwitching.current = false;
    }, 50);
  };

  useEffect(() => {
    if (selectedCompanyId) {
      loadCompanyData(selectedCompanyId);
    }
  }, [selectedCompanyId]);

  // Save company data dynamically whenever anything changes
  useEffect(() => {
    if (!selectedCompanyId) return;
    if (isSwitching.current) return;

    const dataToSave = {
      transactions,
      currency,
      summary,
      originalFileName,
      planoContas,
      conciliacoes,
      fiscalDocs,
      folhaDocs,
      provisoes,
      contracts,
      bankConfig
    };
    localStorage.setItem(`erp_co_data_${selectedCompanyId}`, JSON.stringify(dataToSave));
  }, [
    selectedCompanyId,
    transactions,
    currency,
    summary,
    originalFileName,
    planoContas,
    conciliacoes,
    fiscalDocs,
    folhaDocs,
    provisoes,
    contracts,
    bankConfig
  ]);

  const handleSelectCompany = (id: string | null) => {
    if (id) {
      setSelectedCompanyId(id);
      localStorage.setItem("erp_selected_company_id", id);
      loadCompanyData(id);
    } else {
      setSelectedCompanyId(null);
      localStorage.removeItem("erp_selected_company_id");
    }
  };

  const handleCreateCompany = (
    name: string, 
    cnpj: string, 
    partners: string, 
    socialContract?: { name: string, size: string },
    startWithDefaultPlano = false
  ) => {
    const newCo: Company = {
      id: "co_" + Date.now(),
      name: name.toUpperCase().trim(),
      cnpj: cnpj.trim(),
      partners: partners.trim(),
      socialContractName: socialContract?.name,
      socialContractSize: socialContract?.size
    };

    const updatedCos = [...companies, newCo];
    setCompanies(updatedCos);
    localStorage.setItem("erp_companies", JSON.stringify(updatedCos));

    // Pre-seed company's local storage data
    const initialData = {
      transactions: [],
      currency: "BRL",
      summary: "",
      originalFileName: "",
      planoContas: startWithDefaultPlano ? STANDARD_PLANO_CONTAS : [],
      conciliacoes: [],
      fiscalDocs: [],
      folhaDocs: [],
      provisoes: [],
      contracts: [],
      bankConfig: {
        bankId: "341", 
        bankName: "Itaú Unibanco",
        accountId: "12345-6",
        accountType: "CHECKING",
        currency: "BRL"
      }
    };
    localStorage.setItem(`erp_co_data_${newCo.id}`, JSON.stringify(initialData));
    
    // Auto-select newly created company
    handleSelectCompany(newCo.id);
  };

  const handleDeleteCompany = (id: string) => {
    const updatedCos = companies.filter(c => c.id !== id);
    setCompanies(updatedCos);
    localStorage.setItem("erp_companies", JSON.stringify(updatedCos));
    localStorage.removeItem(`erp_co_data_${id}`);
    
    if (selectedCompanyId === id) {
      handleSelectCompany(null);
    }
  };

  // Company Onboarding Form States
  const [newCoName, setNewCoName] = useState("");
  const [newCoCnpj, setNewCoCnpj] = useState("");
  const [newCoPartners, setNewCoPartners] = useState("");
  const [socialContractFile, setSocialContractFile] = useState<{ name: string; size: string } | null>(null);
  const [startWithDefaultPlano, setStartWithDefaultPlano] = useState(false);
  const [coFormError, setCoFormError] = useState<string | null>(null);
  const [coDragOver, setCoDragOver] = useState(false);

  // Synchronize Balancete structure when Plano de Contas changes
  useEffect(() => {
    setBalancete(prev => {
      return planoContas.map(acc => {
        const existing = prev.find(b => b.code === acc.code);
        if (existing) {
          return {
            ...existing,
            classification: acc.classification || "",
            name: acc.name,
            type: acc.type
          };
        }
        return {
          code: acc.code,
          classification: acc.classification || "",
          name: acc.name,
          type: acc.type,
          openingBalance: 0,
          debit: 0,
          credit: 0,
          closingBalance: 0
        };
      });
    });
  }, [planoContas]);

  // Bank config is now declared earlier to prevent reference errors before initialization

  // Calculate dynamic cash balance of account "1" or "1.01.01.001"
  const cashLine = balancete.find(b => b.code === "1" || b.classification === "1.01.01.001");
  const cashBalance = cashLine ? cashLine.closingBalance : 0.00;

  // Recalculate Balancete entries in harmony
  const handleRecalculateBalancete = (
    currentConciliacoes = conciliacoes,
    currentProvisoes = provisoes,
    currentContracts = contracts,
    currentTransactions = transactions
  ) => {
    setBalancete(prev => {
      return prev.map(item => {
        let debit = 0;
        let credit = 0;

        // 1. Process reconciled OFX transactions
        currentTransactions.forEach(t => {
          const conc = currentConciliacoes.find(c => c.transactionId === t.id);
          if (conc && conc.status === "CONCILIADO") {
            const amt = Math.abs(t.amount);
            if (conc.debitAccount === item.code) {
              debit += amt;
            }
            if (conc.creditAccount === item.code) {
              credit += amt;
            }
          }
        });

        // 2. Process Honorários Provisions (12 months)
        currentProvisoes.forEach(p => {
          const totalYearly = p.monthlyValue * 12;
          if (p.accountCode === item.code) {
            debit += totalYearly;
          }
          if (item.code === "8" || item.classification === "2.01.04.001") { // Honorários a Pagar
            credit += totalYearly;
          }
        });

        // 3. Process Posted Loans
        currentContracts.forEach(c => {
          if (c.posted) {
            const totalInterest = c.installments.reduce((sum, inst) => sum + inst.interest, 0);
            
            // D: Banco (1.01.02.001) for principal
            if (item.code === "2" || item.classification === "1.01.02.001") {
              debit += c.principal;
            }
            // D: Despesa Juros (5.01.03.001) for total interest
            if (item.code === "14" || item.classification === "5.01.03.001") {
              debit += totalInterest;
            }
            // C: Empréstimos Bancários a Pagar / Mútuo Passivo
            if (c.folder.includes("Mutuo") || c.folder.includes("Mútuo")) {
              if (item.code === "7" || item.classification === "2.01.03.001") {
                credit += (c.principal + totalInterest);
              }
            } else {
              if (item.code === "6" || item.classification === "2.01.02.001") {
                credit += (c.principal + totalInterest);
              }
            }
          }
        });

        // 4. Calculate closing balance
        let closing = item.openingBalance;
        if (item.type === "ATIVO" || item.type === "DESPESA") {
          closing = item.openingBalance + debit - credit;
        } else {
          closing = item.openingBalance - debit + credit;
        }

        return {
          ...item,
          debit: parseFloat(debit.toFixed(2)),
          credit: parseFloat(credit.toFixed(2)),
          closingBalance: parseFloat(closing.toFixed(2))
        };
      });
    });
  };

  // Run auto Cash Credit audit remediation rules
  const handleRunCaixaCredorAutomation = () => {
    if (cashBalance >= 0) return;

    const absoluteNegative = Math.abs(cashBalance);
    const neededInjection = absoluteNegative + 1000.00; // Leave it with +R$ 1.000,00

    // Construct mutual loan installments
    const term = 12;
    const monthlyAmt = neededInjection / term;
    const installments = Array.from({ length: term }, (_, i) => ({
      month: i + 1,
      payment: parseFloat(monthlyAmt.toFixed(2)),
      principal: parseFloat(monthlyAmt.toFixed(2)),
      interest: 0,
      balance: parseFloat((neededInjection - (monthlyAmt * (i + 1))).toFixed(2))
    }));

    // Register contract
    const newContract: LoanContract = {
      id: "mut_auto_" + Date.now(),
      name: "CONTRATO MÚTUO SOCIETÁRIO (AUTO CAIXA CREDOR)",
      bank: "SÓCIO / DIRETOR ADMINISTRADOR",
      principal: neededInjection,
      interestRate: 0,
      term,
      type: "SAC",
      startDate: new Date().toISOString().split('T')[0],
      folder: "/Contratos/Mutuo_Autonomo",
      installments,
      posted: true
    };

    const updatedContracts = [...contracts, newContract];
    setContracts(updatedContracts);
    
    // Add OFX balancing injection transaction automatically
    const autoTrans: Transaction = {
      id: "auto_inject_" + Date.now(),
      date: new Date().toISOString().split('T')[0],
      description: "APORTE MÚTUO - AJUSTE SALDO CREDOR CAIXA",
      amount: neededInjection,
      type: "CREDIT",
      category: "Mútuo"
    };

    const updatedTrans = [...transactions, autoTrans];
    setTransactions(updatedTrans);

    // Mapeamento automático de conciliação do aporte
    const updatedConciliacoes = [
      ...conciliacoes,
      {
        transactionId: autoTrans.id,
        debitAccount: "1.01.01.001", // D: Caixa
        creditAccount: "2.01.03.001", // C: Mútuo Passivo
        status: "CONCILIADO" as const,
        observation: "Saneamento de Caixa Credor automático"
      }
    ];
    setConciliacoes(updatedConciliacoes);

    // Recalcular
    handleRecalculateBalancete(updatedConciliacoes, provisoes, updatedContracts, updatedTrans);
    alert(`Saneamento Executado! Injetados R$ ${neededInjection.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} no Caixa Geral via Contrato de Mútuo sem juros.`);
  };

  // Reset movements
  const handleResetBalancete = () => {
    setConciliacoes([]);
    setProvisoes([]);
    setContracts(prev => prev.map(c => ({ ...c, posted: false })));
    setBalancete(prev => prev.map(item => ({
      ...item,
      debit: 0,
      credit: 0,
      closingBalance: item.openingBalance
    })));
  };

  const runProgressSimulation = () => {
    const steps = [
      "Enviando documento para o servidor...",
      "Processando PDF / Imagem com Gemini Multi-modal...",
      "Realizando OCR inteligente nas tabelas bancárias...",
      "Mapeando e limpando histórico de lançamentos...",
      "Atribuindo categorias financeiras inteligentes...",
      "Pronto!"
    ];

    let current = 0;
    setProcessingStep(steps[current]);

    const interval = setInterval(() => {
      current += 1;
      if (current < steps.length - 1) {
        setProcessingStep(steps[current]);
      } else {
        clearInterval(interval);
      }
    }, 1500);

    return interval;
  };

  const handleFileLoaded = async (fileBase64: string, mimeType: string, fileName: string) => {
    setIsProcessing(true);
    setError(null);
    setTransactions([]);
    setOriginalFileName(fileName);

    const progressInterval = runProgressSimulation();

    try {
      const response = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          fileBase64, 
          mimeType, 
          fileName, 
          customApiKey, 
          selectedModel 
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Erro de servidor (${response.status})`);
      }

      const data: ExtractedData = await response.json();

      clearInterval(progressInterval);
      setProcessingStep("Pronto!");

      if (!data.transactions || data.transactions.length === 0) {
        throw new Error("Nenhuma transação financeira válida foi identificada no documento.");
      }

      const mappedTrans: Transaction[] = data.transactions.map((t, idx) => ({
        ...t,
        id: `extracted_${Date.now()}_${idx}`
      }));

      setTransactions(mappedTrans);
      if (data.currency) {
        setCurrency(data.currency);
        setBankConfig(prev => ({ ...prev, currency: data.currency || "BRL" }));
      }
      setSummary(data.summary || "Documento Extraído");

      // Auto map standard OFX transactions based on description
      const autoConc: Conciliacao[] = mappedTrans.map(t => {
        let deb = "";
        let cred = "";
        const desc = t.description.toLowerCase();

        if (t.type === "DEBIT") {
          cred = "1.01.02.001"; // Banco
          if (desc.includes("salario") || desc.includes("folha") || desc.includes("pagamento")) {
            deb = "5.01.02.001"; // Despesa folha
          } else if (desc.includes("uber") || desc.includes("alimentacao") || desc.includes("churrascaria") || desc.includes("comida")) {
            deb = "5.01.04.001"; // Viagem/alimentacao
          } else {
            deb = "5.01.05.001"; // Outras despesas
          }
        } else {
          deb = "1.01.02.001"; // Banco
          cred = "4.01.01.001"; // Receita servicos
        }

        return {
          transactionId: t.id,
          debitAccount: deb,
          creditAccount: cred,
          status: "CONCILIADO" as const,
          observation: "Sugerido pelo Motor de IA"
        };
      });

      setConciliacoes(autoConc);
      handleRecalculateBalancete(autoConc, provisoes, contracts, mappedTrans);

    } catch (err: any) {
      clearInterval(progressInterval);
      console.error("Erro no processamento:", err);
      setError(err.message || "Não foi possível analisar o arquivo. Verifique se o formato está correto.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateTransactions = (updated: Transaction[]) => {
    setTransactions(updated);
    handleRecalculateBalancete(conciliacoes, provisoes, contracts, updated);
  };

  const handleExportOFX = () => {
    if (transactions.length === 0) return;
    downloadOFXFile(transactions, bankConfig, originalFileName);
  };

  const handleReset = () => {
    setTransactions([]);
    setSummary("");
    setOriginalFileName("");
    setError(null);
    setConciliacoes([]);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F0F0F0] flex flex-col font-sans">
      <Header 
        activeCompany={companies.find(c => c.id === selectedCompanyId)} 
        onSwitchCompany={() => handleSelectCompany(null)} 
      />

      {!selectedCompanyId ? (
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 flex flex-col justify-center my-auto min-h-[70vh]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Side: Create Company form */}
            <div className="lg:col-span-7 bg-zinc-900 border-4 border-zinc-800 p-6 md:p-8 rounded-none space-y-6">
              <div>
                <h2 className="text-xl font-black text-white uppercase tracking-wider">Acesso Obrigatório: Cadastrar Nova Empresa</h2>
                <p className="text-xs text-zinc-400 font-mono mt-1">
                  Para liberar e operar o ERP, registre uma empresa jurídica com seus respectivos sócios e Contrato Social.
                </p>
              </div>

              {coFormError && (
                <div className="p-3 bg-rose-950/40 border-l-4 border-rose-500 text-rose-300 text-xs font-mono">
                  {coFormError}
                </div>
              )}

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  setCoFormError(null);
                  if (!newCoName.trim()) {
                    setCoFormError("Por favor, digite a Razão Social da empresa.");
                    return;
                  }
                  if (!newCoCnpj.trim()) {
                    setCoFormError("Por favor, informe o CNPJ da empresa.");
                    return;
                  }
                  if (!newCoPartners.trim()) {
                    setCoFormError("Por favor, informe ao menos um sócio administrador.");
                    return;
                  }
                  
                  handleCreateCompany(
                    newCoName,
                    newCoCnpj,
                    newCoPartners,
                    socialContractFile || undefined,
                    startWithDefaultPlano
                  );

                  // Reset form fields
                  setNewCoName("");
                  setNewCoCnpj("");
                  setNewCoPartners("");
                  setSocialContractFile(null);
                  setStartWithDefaultPlano(false);
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Razão Social *</label>
                    <input
                      type="text"
                      required
                      value={newCoName}
                      onChange={(e) => setNewCoName(e.target.value)}
                      placeholder="Ex: SANTOS TECNOLOGIA LTDA"
                      className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 text-white font-mono text-xs rounded-none focus:border-white focus:ring-0 uppercase animate-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">CNPJ *</label>
                    <input
                      type="text"
                      required
                      value={newCoCnpj}
                      onChange={(e) => {
                        let val = e.target.value.replace(/\D/g, "");
                        if (val.length <= 14) {
                          if (val.length > 12) {
                            val = val.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
                          } else if (val.length > 8) {
                            val = val.replace(/^(\d{2})(\d{3})(\d{3})(\d{1,4})$/, "$1.$2.$3/$4");
                          } else if (val.length > 5) {
                            val = val.replace(/^(\d{2})(\d{3})(\d{1,3})$/, "$1.$2.$3");
                          } else if (val.length > 2) {
                            val = val.replace(/^(\d{2})(\d{1,3})$/, "$1.$2");
                          }
                          setNewCoCnpj(val);
                        }
                      }}
                      placeholder="Ex: 12.345.678/0001-90"
                      className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 text-white font-mono text-xs rounded-none focus:border-white focus:ring-0"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Sócios Administradores (Separados por vírgula) *</label>
                  <input
                    type="text"
                    required
                    value={newCoPartners}
                    onChange={(e) => setNewCoPartners(e.target.value)}
                    placeholder="Ex: CARLOS SANTOS, ALICE LIMA"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 text-white font-mono text-xs rounded-none focus:border-white focus:ring-0 uppercase"
                  />
                </div>

                {/* Drag and Drop for Social Contract Import */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Importar Contrato Social (.pdf, .png, .jpg)</label>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setCoDragOver(true);
                    }}
                    onDragLeave={() => setCoDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setCoDragOver(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) {
                        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
                        setSocialContractFile({
                          name: file.name,
                          size: `${sizeMB} MB`
                        });
                      }
                    }}
                    className={`border-2 border-dashed p-4 text-center transition-all ${
                      coDragOver 
                        ? "border-emerald-400 bg-emerald-500/5" 
                        : "border-zinc-850 bg-zinc-950 hover:border-zinc-700"
                    }`}
                  >
                    <input
                      type="file"
                      id="social-contract-upload"
                      className="hidden"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
                          setSocialContractFile({
                            name: file.name,
                            size: `${sizeMB} MB`
                          });
                        }
                      }}
                    />
                    <label htmlFor="social-contract-upload" className="cursor-pointer block">
                      {socialContractFile ? (
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-[10px] font-mono text-emerald-400 font-black uppercase">
                            ✓ {socialContractFile.name} ({socialContractFile.size}) Carregado
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setSocialContractFile(null);
                            }}
                            className="text-[9px] font-mono uppercase bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-rose-400 px-1 py-0.5 ml-2"
                          >
                            Remover
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-[10px] text-zinc-400 uppercase font-black tracking-wider">
                            Arraste ou clique para anexar o Contrato Social da Empresa
                          </p>
                          <p className="text-[8px] text-zinc-600 font-mono">Formatos suportados: PDF ou Imagem</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-3 py-2 border-t border-b border-zinc-850">
                  <input
                    type="checkbox"
                    id="chk-default-plano"
                    checked={startWithDefaultPlano}
                    onChange={(e) => setStartWithDefaultPlano(e.target.checked)}
                    className="rounded-none bg-zinc-950 border-zinc-800 text-emerald-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <label htmlFor="chk-default-plano" className="text-[10px] font-black text-zinc-300 uppercase tracking-wider cursor-pointer">
                    Iniciar com Plano de Contas Padrão (Recomendado)
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4 text-black stroke-[3]" />
                  <span>Cadastrar e Acessar ERP.CONTABIL</span>
                </button>
              </form>
            </div>

            {/* Right Side: Companies list */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-zinc-950 border border-zinc-900 p-4">
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Empresas Registradas ({companies.length})</h3>
                <p className="text-[10px] text-zinc-600 font-mono mt-0.5">Selecione uma empresa ativa para iniciar sua auditoria contábil.</p>
              </div>

              {companies.length === 0 ? (
                <div className="bg-zinc-900/50 border border-zinc-850 p-8 text-center">
                  <p className="text-zinc-500 text-xs font-mono uppercase tracking-wider">Nenhuma empresa registrada.</p>
                  <p className="text-zinc-600 text-[10px] font-mono mt-2">Crie a sua empresa à esquerda para habilitar o ERP.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                  {companies.map((co) => (
                    <div 
                      key={co.id}
                      className="bg-zinc-900 border border-zinc-850 p-4 hover:border-zinc-700 transition-all flex flex-col justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <span className="text-[8px] font-mono uppercase bg-emerald-500/10 border border-emerald-500/20 px-1 text-emerald-400 font-black">
                          CNPJ: {co.cnpj}
                        </span>
                        <h4 className="text-sm font-black text-white uppercase tracking-wider truncate mt-1.5">{co.name}</h4>
                        <p className="text-[10px] text-zinc-400 font-mono mt-1 uppercase">
                          <strong className="text-zinc-500">SÓCIOS:</strong> {co.partners}
                        </p>
                        {co.socialContractName && (
                          <div className="text-[9px] font-mono text-zinc-500 mt-2 flex items-center gap-1.5 uppercase bg-zinc-950 p-1 border border-zinc-850">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0"></span>
                            <span className="truncate">Contrato: {co.socialContractName} ({co.socialContractSize})</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 border-t border-zinc-850 pt-3">
                        <button
                          type="button"
                          onClick={() => handleSelectCompany(co.id)}
                          className="flex-1 py-1.5 bg-zinc-950 hover:bg-white text-zinc-400 hover:text-black text-[9px] font-black uppercase tracking-widest border border-zinc-800 transition-all flex items-center justify-center gap-1.5"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>Selecionar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Tem certeza que deseja excluir a empresa ${co.name}? Esta operação é irreversível.`)) {
                              handleDeleteCompany(co.id);
                            }
                          }}
                          className="px-2.5 py-1.5 bg-zinc-950 hover:bg-rose-950/40 text-zinc-600 hover:text-rose-400 border border-zinc-800 hover:border-rose-950/60 transition-all"
                          title="Excluir Empresa"
                        >
                          <Trash2 className="w-3.5 h-3.5 animate-none" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      ) : (
        <>
          {/* Corporate Dashboard Tab Navigation Rail */}
          <div className="bg-zinc-950 border-b border-zinc-900 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex overflow-x-auto gap-1">
          <button
            onClick={() => setActiveTab("ofx")}
            className={`px-5 py-4 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border-b-2 ${
              activeTab === "ofx" 
                ? "border-emerald-400 text-white bg-zinc-900" 
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            } flex items-center gap-2`}
          >
            <Receipt className="w-4 h-4 text-emerald-400" />
            <span>1. Extrato & OFX</span>
          </button>
          <button
            onClick={() => setActiveTab("plano")}
            className={`px-5 py-4 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border-b-2 ${
              activeTab === "plano" 
                ? "border-emerald-400 text-white bg-zinc-900" 
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            } flex items-center gap-2`}
          >
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <span>2. Plano de Contas</span>
          </button>
          <button
            onClick={() => setActiveTab("conciliacao")}
            className={`px-5 py-4 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border-b-2 ${
              activeTab === "conciliacao" 
                ? "border-emerald-400 text-white bg-zinc-900" 
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            } flex items-center gap-2`}
          >
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span>3. Conciliação & Chat</span>
          </button>
          <button
            onClick={() => setActiveTab("balancete")}
            className={`px-5 py-4 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border-b-2 ${
              activeTab === "balancete" 
                ? "border-emerald-400 text-white bg-zinc-900" 
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            } flex items-center gap-2`}
          >
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>4. Balancete Harmonizado</span>
          </button>
          <button
            onClick={() => setActiveTab("fiscal_folha")}
            className={`px-5 py-4 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border-b-2 ${
              activeTab === "fiscal_folha" 
                ? "border-emerald-400 text-white bg-zinc-900" 
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            } flex items-center gap-2`}
          >
            <FileText className="w-4 h-4 text-emerald-400" />
            <span>5. Fiscal & Folha</span>
          </button>
          <button
            onClick={() => setActiveTab("honorarios")}
            className={`px-5 py-4 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border-b-2 ${
              activeTab === "honorarios" 
                ? "border-emerald-400 text-white bg-zinc-900" 
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            } flex items-center gap-2`}
          >
            <BadgeCent className="w-4 h-4 text-emerald-400" />
            <span>6. Honorários</span>
          </button>
          <button
            onClick={() => setActiveTab("emprestimos")}
            className={`px-5 py-4 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border-b-2 ${
              activeTab === "emprestimos" 
                ? "border-emerald-400 text-white bg-zinc-900" 
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            } flex items-center gap-2`}
          >
            <FolderOpen className="w-4 h-4 text-emerald-400" />
            <span>7. Empréstimos (Bacen)</span>
          </button>
          <button
            onClick={() => setActiveTab("config_ia")}
            className={`px-5 py-4 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border-b-2 ${
              activeTab === "config_ia" 
                ? "border-emerald-400 text-white bg-zinc-900" 
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            } flex items-center gap-2`}
          >
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span>8. Configuração IA</span>
          </button>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-8">
        <div style={{ display: activeTab === "ofx" ? "block" : "none" }} className="space-y-8">
          {transactions.length === 0 ? (
            /* Uploader */
            <div className="max-w-3xl mx-auto space-y-8">
              <FileUploader
                onFileLoaded={handleFileLoaded}
                isProcessing={isProcessing}
                processingStep={processingStep}
                error={error}
              />
            </div>
          ) : (
            /* Grid Review & Export */
            <div className="space-y-8">
              <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-none shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="bg-emerald-500/10 text-emerald-400 p-3.5 rounded-none border border-emerald-500/20 flex items-center justify-center">
                    <FileCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-black text-emerald-400 tracking-widest block mb-1">Arquivo Analisado com Sucesso</span>
                    <h2 className="text-xl font-black text-white">{originalFileName}</h2>
                    <p className="text-xs text-zinc-400 mt-1 font-mono">
                      {summary} • {transactions.length} lançamentos identificados
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleReset}
                    className="flex-1 sm:flex-none px-6 py-3 bg-white text-black font-black text-xs uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-colors rounded-none flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Enviar Outro</span>
                  </button>
                </div>
              </div>

              <TransactionGrid
                transactions={transactions}
                onUpdateTransactions={handleUpdateTransactions}
                currency={currency}
              />

              <DashboardInsights 
                transactions={transactions}
                currency={currency}
              />

              <OFXConfigForm
                config={bankConfig}
                onChangeConfig={setBankConfig}
                onExport={handleExportOFX}
                isEnabled={transactions.length > 0}
              />
            </div>
          )}
        </div>

        <div style={{ display: activeTab === "plano" ? "block" : "none" }}>
          <PlanoContasTab 
            planoContas={planoContas}
            setPlanoContas={setPlanoContas}
            customApiKey={customApiKey}
            selectedModel={selectedModel}
          />
        </div>

        <div style={{ display: activeTab === "conciliacao" ? "block" : "none" }}>
          <ConciliacaoTab 
            transactions={transactions}
            planoContas={planoContas}
            conciliacoes={conciliacoes}
            setConciliacoes={setConciliacoes}
            cashBalance={cashBalance}
            runCaixaCredorAutomation={handleRunCaixaCredorAutomation}
            onPostToBalancete={() => handleRecalculateBalancete(conciliacoes, provisoes, contracts, transactions)}
          />
        </div>

        <div style={{ display: activeTab === "balancete" ? "block" : "none" }}>
          <BalanceteTab 
            balancete={balancete}
            setBalancete={setBalancete}
            onResetBalancete={handleResetBalancete}
            transactions={transactions}
            conciliacoes={conciliacoes}
            provisoes={provisoes}
            contracts={contracts}
          />
        </div>

        <div style={{ display: activeTab === "fiscal_folha" ? "block" : "none" }}>
          <FiscalFolhaTab 
            fiscalDocs={fiscalDocs}
            setFiscalDocs={setFiscalDocs}
            folhaDocs={folhaDocs}
            setFolhaDocs={setFolhaDocs}
          />
        </div>

        <div style={{ display: activeTab === "honorarios" ? "block" : "none" }}>
          <HonorariosTab 
            planoContas={planoContas}
            provisoes={provisoes}
            setProvisoes={setProvisoes}
            onPostProvisionsToBalancete={(updatedProvs) => handleRecalculateBalancete(conciliacoes, updatedProvs, contracts, transactions)}
          />
        </div>

        <div style={{ display: activeTab === "emprestimos" ? "block" : "none" }}>
          <EmprestimoTab 
            planoContas={planoContas}
            contracts={contracts}
            setContracts={setContracts}
            onPostLoanToBalancete={(c) => {
              const updatedContracts = contracts.map(item => item.id === c.id ? { ...item, posted: true } : item);
              handleRecalculateBalancete(conciliacoes, provisoes, updatedContracts, transactions);
            }}
          />
        </div>

        <div style={{ display: activeTab === "config_ia" ? "block" : "none" }}>
          {/* Sleek Settings Panel inside its own tab */}
          {(() => {
            const getModelCategory = (m: AIModel): "free_no_quota" | "free_with_quota" | "paid_only" => {
              if (m.category === "free_no_quota" || m.category === "free_with_quota" || m.category === "paid_only") {
                return m.category;
              }
              if (m.isPaid) return "paid_only";
              const idLower = m.id.toLowerCase();
              if (idLower.includes("preview") || idLower.includes("experimental") || idLower.includes("tuning") || idLower.includes("test") || /\d{4}/.test(idLower)) {
                return "free_with_quota";
              }
              return "free_no_quota";
            };

            const currentModelObj = availableModels.find(m => m.id === selectedModel);
            const currentCategory = currentModelObj ? getModelCategory(currentModelObj) : "free_no_quota";

            const freeNoQuotaModels = availableModels.filter(m => getModelCategory(m) === "free_no_quota");
            const freeWithQuotaModels = availableModels.filter(m => getModelCategory(m) === "free_with_quota");
            const paidOnlyModels = availableModels.filter(m => getModelCategory(m) === "paid_only");

            return (
              <div className="w-full">
                <div className="bg-zinc-900 border-4 border-zinc-800 p-6 rounded-none relative">
                  <div className="flex items-center justify-between mb-6 pb-3 border-b border-zinc-800">
                    <div className="flex items-center gap-2.5">
                      <Sliders className="w-5 h-5 text-emerald-400" />
                      <h3 className="font-black text-white text-xs uppercase tracking-[0.2em]">Configuração de IA & Modelos</h3>
                    </div>
                    <div>
                      {currentCategory === "paid_only" && (
                        <span className="text-[10px] font-mono bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2.5 py-1 uppercase tracking-widest font-black">
                          🔴 SOMENTE PAGO (CHAVE PREMIUM)
                        </span>
                      )}
                      {currentCategory === "free_with_quota" && (
                        <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 uppercase tracking-widest font-black">
                          🟡 GRÁTIS COM COTAS
                        </span>
                      )}
                      {currentCategory === "free_no_quota" && (
                        <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 uppercase tracking-widest font-black">
                          🟢 GRÁTIS SEM COTA
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-baseline">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">
                            Modelo de Inteligência Artificial
                          </label>
                          <span className="text-[9px] font-mono uppercase text-zinc-500">
                            {isLoadingModels ? (
                              <span className="flex items-center gap-1">
                                <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Atualizando...
                              </span>
                            ) : modelsSource === "api" ? (
                              <span className="text-emerald-400">🟢 Sincronizado via API</span>
                            ) : (
                              <span className="text-amber-400">⚡ Modelos Recomendados</span>
                            )}
                          </span>
                        </div>
                        <select
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                          className="w-full px-3 py-3 border border-zinc-800 bg-zinc-950 text-white rounded-none text-xs outline-none focus:border-white font-bold uppercase tracking-wider cursor-pointer"
                        >
                          {freeNoQuotaModels.length > 0 && (
                            <optgroup label="🟢 GRÁTIS SEM COTA (ILIMITADO)">
                              {freeNoQuotaModels.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {freeWithQuotaModels.length > 0 && (
                            <optgroup label="🟡 GRÁTIS COM COTAS (RESTRITO)">
                              {freeWithQuotaModels.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {paidOnlyModels.length > 0 && (
                            <optgroup label="🔴 SOMENTE PAGO (PRO / IMAGEM)">
                              {paidOnlyModels.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </div>

                      <div className="p-4 bg-zinc-950 border border-zinc-850">
                        <p className="text-white text-xs font-black uppercase tracking-wider mb-1">
                          {currentCategory === "paid_only" && "✨ PREMIUM PAGO ATIVO"}
                          {currentCategory === "free_with_quota" && "🟡 GRÁTIS COM COTAS ATIVO"}
                          {currentCategory === "free_no_quota" && "⚡ GRÁTIS SEM COTA ATIVO"}
                        </p>
                        <p className="text-zinc-400 text-[11px] font-mono leading-relaxed">
                          {currentModelObj?.description || 
                           (currentCategory === "paid_only"
                             ? "Os modelos Pro oferecem inteligência superior para entender planilhas caóticas ou comprovantes fotografados com baixa resolução. O uso consome cotas premium ou sua chave própria."
                             : currentCategory === "free_with_quota"
                             ? "Os modelos em fase de Preview e testes oferecem recursos inovadores, mas estão sujeitos a limites rígidos de requisições por minuto impostos pelo servidor."
                             : "Os modelos Flash padrão operam de forma extremamente rápida e leve. São ideais para processar arquivos em PDF digital, arquivos Excel estruturados e imagens nítidas sem custos.")
                          }
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-baseline">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">
                            Chave de API Gemini (Opcional)
                          </label>
                          <span className="text-[9px] font-mono text-zinc-500 uppercase">Padrão: Chave Integrada</span>
                        </div>
                        <div className="relative">
                          <Key className="absolute left-3 top-3.5 w-3.5 h-3.5 text-zinc-500" />
                          <input
                            type="password"
                            value={customApiKey}
                            onChange={(e) => setCustomApiKey(e.target.value)}
                            placeholder="Digite sua chave API pessoal (AI_...)"
                            className="w-full pl-9 pr-3 py-3 border border-zinc-800 bg-zinc-950 text-white rounded-none text-xs outline-none focus:border-white font-mono"
                          />
                        </div>
                      </div>

                      <div className="text-[10px] text-zinc-500 font-mono leading-relaxed">
                        Ao inserir sua chave de API própria, você evita limites de cota coletiva de servidores públicos, garantindo o processamento autônomo imediato do Surya OFX.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </main>
      </>
      )}

      <footer className="bg-zinc-950 border-t border-zinc-900 py-8 text-center text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-16">
        <p>© 2026 Surya OFX • Powered by Gemini AI Multimodal OCR • Inteligência Autônoma de Extratos</p>
      </footer>
    </div>
  );
}
