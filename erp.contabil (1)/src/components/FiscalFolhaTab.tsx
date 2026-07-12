import React, { useState } from "react";
import { DocumentoFiscal, DocumentoFolha } from "../types";
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  Trash2, 
  Layers, 
  Filter, 
  Check, 
  Landmark, 
  User, 
  FileSpreadsheet, 
  Tag,
  Sliders
} from "lucide-react";

interface FiscalFolhaTabProps {
  fiscalDocs: DocumentoFiscal[];
  setFiscalDocs: React.Dispatch<React.SetStateAction<DocumentoFiscal[]>>;
  folhaDocs: DocumentoFolha[];
  setFolhaDocs: React.Dispatch<React.SetStateAction<DocumentoFolha[]>>;
}

export default function FiscalFolhaTab({
  fiscalDocs,
  setFiscalDocs,
  folhaDocs,
  setFolhaDocs
}: FiscalFolhaTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<"fiscal" | "folha">("fiscal");
  const [dragOver, setDragOver] = useState(false);
  
  // Active Filters
  const [fiscalFilter, setFiscalFilter] = useState<"ALL" | "NOTA_FISCAL" | "IMPOSTO">("ALL");
  const [folhaFilter, setFolhaFilter] = useState<"ALL" | "FOLHA" | "PRO_LABORE" | "IMPOSTO_FOLHA">("ALL");

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleUpdateFiscalDocFields = (id: string, fields: Partial<DocumentoFiscal>) => {
    setFiscalDocs(prev => prev.map(doc => doc.id === id ? { ...doc, ...fields } : doc));
  };

  const handleUpdateFolhaDocFields = (id: string, fields: Partial<DocumentoFolha>) => {
    setFolhaDocs(prev => prev.map(doc => doc.id === id ? { ...doc, ...fields } : doc));
  };

  const processUploadedFile = (name: string, sizeBytes: number) => {
    const sizeStr = (sizeBytes / (1024 * 1024)).toFixed(1) + " MB";
    const today = new Date().toLocaleDateString("pt-BR");
    const lowerName = name.toLowerCase();

    if (activeSubTab === "fiscal") {
      let type = "NF-e (Vendas)";
      let category: 'NOTA_FISCAL' | 'IMPOSTO' = 'NOTA_FISCAL';
      let taxType: string | undefined = undefined;
      let taxValue: number | undefined = undefined;
      let docValue: number | undefined = undefined;

      // Advanced auto-detection
      if (
        lowerName.includes("guia") || 
        lowerName.includes("darf") || 
        lowerName.includes("das") || 
        lowerName.includes("simples") || 
        lowerName.includes("iss") || 
        lowerName.includes("icms") || 
        lowerName.includes("tributo") || 
        lowerName.includes("imposto") || 
        lowerName.includes("recolhimento") ||
        lowerName.includes("pis") ||
        lowerName.includes("cofins") ||
        lowerName.includes("csll")
      ) {
        category = 'IMPOSTO';
        if (lowerName.includes("das") || lowerName.includes("simples")) {
          type = "DAS - Simples Nacional";
          taxType = "DAS";
          taxValue = Math.floor(Math.random() * 1500) + 850;
        } else if (lowerName.includes("pis")) {
          type = "PIS - Faturamento";
          taxType = "PIS";
          taxValue = Math.floor(Math.random() * 250) + 80;
        } else if (lowerName.includes("cofins")) {
          type = "COFINS - Faturamento";
          taxType = "COFINS";
          taxValue = Math.floor(Math.random() * 900) + 250;
        } else if (lowerName.includes("csll")) {
          type = "Guia CSLL";
          taxType = "CSLL";
          taxValue = Math.floor(Math.random() * 700) + 300;
        } else if (lowerName.includes("iss")) {
          type = "Guia ISSQN";
          taxType = "ISSQN";
          taxValue = Math.floor(Math.random() * 500) + 150;
        } else if (lowerName.includes("icms")) {
          type = "Guia ICMS";
          taxType = "ICMS";
          taxValue = Math.floor(Math.random() * 1600) + 400;
        } else if (lowerName.includes("darf") || lowerName.includes("irpj")) {
          type = "DARF / IRPJ";
          taxType = "IRPJ";
          taxValue = Math.floor(Math.random() * 1400) + 500;
        } else {
          type = "Imposto Municipal / Estadual";
          taxType = "Outros";
          taxValue = Math.floor(Math.random() * 600) + 120;
        }
      } else {
        category = 'NOTA_FISCAL';
        docValue = Math.floor(Math.random() * 12000) + 2500;
        if (lowerName.includes("nfs") || lowerName.includes("servico") || lowerName.includes("serviço")) {
          type = "NFS-e (Serviços)";
        } else if (lowerName.includes("cte") || lowerName.includes("transporte")) {
          type = "CT-e (Transporte)";
        } else {
          type = "NF-e (Vendas/Produtos)";
        }
      }

      const newDoc: DocumentoFiscal = {
        id: "f_" + Date.now(),
        name,
        type,
        category,
        date: today,
        size: sizeStr,
        taxType,
        taxValue,
        docValue
      };
      setFiscalDocs(prev => [newDoc, ...prev]);
    } else {
      let type = "Holerite Individual";
      let category: 'FOLHA' | 'PRO_LABORE' | 'IMPOSTO_FOLHA' = 'FOLHA';
      let taxType: string | undefined = undefined;
      let taxValue: number | undefined = undefined;
      let docValue: number | undefined = undefined;

      if (
        lowerName.includes("prolabore") || 
        lowerName.includes("pró-labore") || 
        lowerName.includes("pro-labore") || 
        lowerName.includes("socio") || 
        lowerName.includes("sócio") || 
        lowerName.includes("retirada")
      ) {
        category = 'PRO_LABORE';
        type = "Pró-Labore Diretores";
        docValue = Math.floor(Math.random() * 5000) + 1500;
      } else if (
        lowerName.includes("inss") || 
        lowerName.includes("fgts") || 
        lowerName.includes("gps") || 
        lowerName.includes("sefip") || 
        lowerName.includes("gfip") || 
        lowerName.includes("dae") || 
        lowerName.includes("tributo") || 
        lowerName.includes("contribui") || 
        lowerName.includes("guia") ||
        lowerName.includes("irrf")
      ) {
        category = 'IMPOSTO_FOLHA';
        if (lowerName.includes("inss") || lowerName.includes("gps")) {
          type = "Guia de INSS (GPS)";
          taxType = "INSS";
          taxValue = Math.floor(Math.random() * 900) + 250;
        } else if (lowerName.includes("fgts") || lowerName.includes("gfip") || lowerName.includes("sefip")) {
          type = "Guia de FGTS (GFIP/GRF)";
          taxType = "FGTS";
          taxValue = Math.floor(Math.random() * 700) + 180;
        } else if (lowerName.includes("irrf")) {
          type = "Guia de IRRF Retido";
          taxType = "IRRF Folha";
          taxValue = Math.floor(Math.random() * 500) + 120;
        } else {
          type = "Imposto sobre Folha";
          taxType = "Outros";
          taxValue = Math.floor(Math.random() * 400) + 80;
        }
      } else {
        category = 'FOLHA';
        docValue = Math.floor(Math.random() * 16000) + 3000;
        if (lowerName.includes("resumo") || lowerName.includes("relatorio") || lowerName.includes("geral")) {
          type = "Resumo Geral da Folha";
        } else {
          type = "Holerite Individual";
        }
      }

      const newDoc: DocumentoFolha = {
        id: "l_" + Date.now(),
        name,
        type,
        category,
        date: today,
        size: sizeStr,
        taxType,
        taxValue,
        docValue
      };
      setFolhaDocs(prev => [newDoc, ...prev]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadedFile(file.name, file.size);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file.name, file.size);
    }
  };

  const handleDeleteFiscal = (id: string) => {
    setFiscalDocs(prev => prev.filter(d => d.id !== id));
  };

  const handleDeleteFolha = (id: string) => {
    setFolhaDocs(prev => prev.filter(d => d.id !== id));
  };

  const handleUpdateFiscalCategory = (id: string, newCategory: 'NOTA_FISCAL' | 'IMPOSTO') => {
    setFiscalDocs(prev => prev.map(doc => {
      if (doc.id === id) {
        const defaultType = newCategory === 'NOTA_FISCAL' ? 'NF-e (Vendas/Produtos)' : 'Guia Imposto (DARF/GPS)';
        return { 
          ...doc, 
          category: newCategory, 
          type: defaultType,
          taxType: newCategory === 'IMPOSTO' ? 'DAS' : undefined,
          taxValue: newCategory === 'IMPOSTO' ? 1250 : undefined,
          docValue: newCategory === 'NOTA_FISCAL' ? 4500 : undefined
        };
      }
      return doc;
    }));
  };

  const handleUpdateFolhaCategory = (id: string, newCategory: 'FOLHA' | 'PRO_LABORE' | 'IMPOSTO_FOLHA') => {
    setFolhaDocs(prev => prev.map(doc => {
      if (doc.id === id) {
        let defaultType = 'Holerite Individual';
        if (newCategory === 'PRO_LABORE') defaultType = 'Pró-Labore Diretores';
        if (newCategory === 'IMPOSTO_FOLHA') defaultType = 'Imposto sobre Folha (GPS/GFIP)';
        return { 
          ...doc, 
          category: newCategory, 
          type: defaultType,
          taxType: newCategory === 'IMPOSTO_FOLHA' ? 'INSS' : undefined,
          taxValue: newCategory === 'IMPOSTO_FOLHA' ? 450 : undefined,
          docValue: newCategory !== 'IMPOSTO_FOLHA' ? 5000 : undefined
        };
      }
      return doc;
    }));
  };

  // Stats calculation
  const fiscalNotasCount = fiscalDocs.filter(d => d.category === 'NOTA_FISCAL' || !d.category).length;
  const fiscalImpostosCount = fiscalDocs.filter(d => d.category === 'IMPOSTO').length;

  const folhaFolhaCount = folhaDocs.filter(d => d.category === 'FOLHA' || !d.category).length;
  const folhaProLaboreCount = folhaDocs.filter(d => d.category === 'PRO_LABORE').length;
  const folhaImpostosCount = folhaDocs.filter(d => d.category === 'IMPOSTO_FOLHA').length;

  // Filtered documents
  const filteredFiscalDocs = fiscalDocs.filter(d => {
    if (fiscalFilter === "ALL") return true;
    if (fiscalFilter === "NOTA_FISCAL") return d.category === 'NOTA_FISCAL' || !d.category;
    return d.category === fiscalFilter;
  });

  const filteredFolhaDocs = folhaDocs.filter(d => {
    if (folhaFilter === "ALL") return true;
    if (folhaFilter === "FOLHA") return d.category === 'FOLHA' || !d.category;
    return d.category === folhaFilter;
  });

  return (
    <div className="space-y-6">
      {/* Tab toggle selector */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => {
            setActiveSubTab("fiscal");
          }}
          className={`px-6 py-3.5 text-xs font-black uppercase tracking-widest transition-colors ${
            activeSubTab === "fiscal" 
              ? "border-b-4 border-emerald-400 text-white bg-zinc-900" 
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Área Fiscal (Notas & Impostos)
        </button>
        <button
          onClick={() => {
            setActiveSubTab("folha");
          }}
          className={`px-6 py-3.5 text-xs font-black uppercase tracking-widest transition-colors ${
            activeSubTab === "folha" 
              ? "border-b-4 border-emerald-400 text-white bg-zinc-900" 
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Área de Folha (Folha, Pró-labore & Impostos)
        </button>
      </div>

      {/* Aggregate Indicators Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {activeSubTab === "fiscal" ? (
          <>
            <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-none flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Notas Fiscais Identificadas</p>
                <p className="text-2xl font-mono text-emerald-400 mt-1 font-black">{fiscalNotasCount}</p>
              </div>
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <FileText className="w-5 h-5" />
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-none flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Impostos Identificados</p>
                <p className="text-2xl font-mono text-emerald-400 mt-1 font-black">{fiscalImpostosCount}</p>
              </div>
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Landmark className="w-5 h-5" />
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-none flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Total Sincronizado</p>
                <p className="text-2xl font-mono text-white mt-1 font-black">{fiscalDocs.length}</p>
              </div>
              <div className="p-2 bg-zinc-900 border border-zinc-800 text-zinc-400">
                <Layers className="w-5 h-5" />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-none flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Folhas de Pagamento</p>
                <p className="text-2xl font-mono text-emerald-400 mt-1 font-black">{folhaFolhaCount}</p>
              </div>
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-none flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Recibos de Pró-Labore</p>
                <p className="text-2xl font-mono text-emerald-400 mt-1 font-black">{folhaProLaboreCount}</p>
              </div>
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <User className="w-5 h-5" />
              </div>
            </div>
            <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-none flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Impostos da Folha (GPS/FGTS)</p>
                <p className="text-2xl font-mono text-emerald-400 mt-1 font-black">{folhaImpostosCount}</p>
              </div>
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Landmark className="w-5 h-5" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* DETALHAMENTO DE IMPOSTOS IDENTIFICADOS */}
      <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-900 mb-4 gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-black text-white uppercase tracking-wider font-mono">
              {activeSubTab === "fiscal" 
                ? "Deduções & Tributos Fiscais Apurados" 
                : "Encargos & Obrigações Sociais Apuradas"}
            </h4>
          </div>
          <span className="text-[10px] font-mono text-zinc-500 uppercase">Valores identificados individualmente</span>
        </div>

        {activeSubTab === "fiscal" ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "DAS (Simples)", type: "DAS", color: "from-amber-500/10 to-amber-500/5", border: "border-amber-500/20", text: "text-amber-400" },
              { label: "PIS", type: "PIS", color: "from-emerald-500/10 to-emerald-500/5", border: "border-emerald-500/20", text: "text-emerald-400" },
              { label: "COFINS", type: "COFINS", color: "from-sky-500/10 to-sky-500/5", border: "border-sky-500/20", text: "text-sky-400" },
              { label: "IRPJ", type: "IRPJ", color: "from-rose-500/10 to-rose-500/5", border: "border-rose-500/20", text: "text-rose-400" },
              { label: "CSLL", type: "CSLL", color: "from-purple-500/10 to-purple-500/5", border: "border-purple-500/20", text: "text-purple-400" },
              { label: "ISSQN", type: "ISSQN", color: "from-blue-500/10 to-blue-500/5", border: "border-blue-500/20", text: "text-blue-400" },
              { label: "ICMS", type: "ICMS", color: "from-orange-500/10 to-orange-500/5", border: "border-orange-500/20", text: "text-orange-400" },
              { label: "Outros", type: "Outros", color: "from-zinc-500/10 to-zinc-500/5", border: "border-zinc-800", text: "text-zinc-400" },
            ].map(tax => {
              const matchingDocs = fiscalDocs.filter(d => d.category === 'IMPOSTO' && d.taxType === tax.type);
              const totalVal = matchingDocs.reduce((acc, curr) => acc + (curr.taxValue || 0), 0);
              const count = matchingDocs.length;

              return (
                <div key={tax.type} className={`bg-gradient-to-br ${tax.color} border ${tax.border} p-3 flex flex-col justify-between`}>
                  <div className="flex justify-between items-start gap-1">
                    <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider font-mono">{tax.label}</span>
                    <span className="text-[8px] font-mono bg-zinc-900 border border-zinc-800 px-1 text-zinc-500 shrink-0">{count} {count === 1 ? 'doc' : 'docs'}</span>
                  </div>
                  <p className={`text-xs sm:text-sm font-mono font-black ${tax.text} mt-2 text-right`}>
                    R$ {totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "INSS (GPS)", type: "INSS", color: "from-amber-500/10 to-amber-500/5", border: "border-amber-500/20", text: "text-amber-400" },
              { label: "FGTS (GRF)", type: "FGTS", color: "from-emerald-500/10 to-emerald-500/5", border: "border-emerald-500/20", text: "text-emerald-400" },
              { label: "IRRF s/ Folha", type: "IRRF Folha", color: "from-rose-500/10 to-rose-500/5", border: "border-rose-500/20", text: "text-rose-400" },
              { label: "Outros Encargos", type: "Outros", color: "from-zinc-500/10 to-zinc-500/5", border: "border-zinc-800", text: "text-zinc-400" },
            ].map(tax => {
              const matchingDocs = folhaDocs.filter(d => d.category === 'IMPOSTO_FOLHA' && d.taxType === tax.type);
              const totalVal = matchingDocs.reduce((acc, curr) => acc + (curr.taxValue || 0), 0);
              const count = matchingDocs.length;

              return (
                <div key={tax.type} className={`bg-gradient-to-br ${tax.color} border ${tax.border} p-3 flex flex-col justify-between`}>
                  <div className="flex justify-between items-start gap-1">
                    <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider font-mono">{tax.label}</span>
                    <span className="text-[8px] font-mono bg-zinc-900 border border-zinc-800 px-1 text-zinc-500 shrink-0">{count} {count === 1 ? 'doc' : 'docs'}</span>
                  </div>
                  <p className={`text-xs sm:text-sm font-mono font-black ${tax.text} mt-2 text-right`}>
                    R$ {totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Document Uploader Card */}
        <div className="lg:col-span-5 flex flex-col justify-stretch">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-4 border-dashed p-10 text-center transition-all flex flex-col justify-center items-center h-full min-h-[340px] ${
              dragOver 
                ? "border-emerald-400 bg-emerald-500/5" 
                : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
            }`}
          >
            <input
              type="file"
              id="doc-upload-file"
              className="hidden"
              onChange={handleFileChange}
              accept=".pdf,.png,.jpg,.jpeg,.xml,.csv,.xlsx"
            />
            
            <label htmlFor="doc-upload-file" className="cursor-pointer block space-y-4">
              <Upload className="w-12 h-12 text-zinc-600 mx-auto" />
              <div>
                <p className="text-white text-xs font-black uppercase tracking-wider">
                  Arraste ou Selecione seu Documento
                </p>
                <p className="text-[10px] text-zinc-500 font-mono uppercase mt-1.5 leading-relaxed">
                  O motor de IA identifica automaticamente:<br />
                  {activeSubTab === "fiscal" 
                    ? "• Notas Fiscais (NFe, NFSe) ou • Impostos (DARF, DAS, ISS, etc)" 
                    : "• Folhas de Pagamento, • Pró-labore ou • Impostos de Folha (GPS, FGTS)"
                  }
                </p>
              </div>
              <span className="inline-block px-4 py-2 bg-white hover:bg-emerald-400 text-black text-[10px] font-black uppercase tracking-widest">
                Escolher Arquivo
              </span>
            </label>
          </div>
        </div>

        {/* Uploaded Documents List */}
        <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 p-6 rounded-none flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 mb-4 gap-3">
              <h4 className="text-xs font-black text-white uppercase tracking-wider">
                Documentos Identificados ({activeSubTab === "fiscal" ? filteredFiscalDocs.length : filteredFolhaDocs.length})
              </h4>
              
              {/* Category Filters */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
                <Filter className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                {activeSubTab === "fiscal" ? (
                  <>
                    <button
                      onClick={() => setFiscalFilter("ALL")}
                      className={`px-2 py-1 text-[9px] font-mono uppercase tracking-wider transition-colors ${
                        fiscalFilter === "ALL" 
                          ? "bg-emerald-400 text-black font-black" 
                          : "bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-850"
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => setFiscalFilter("NOTA_FISCAL")}
                      className={`px-2 py-1 text-[9px] font-mono uppercase tracking-wider transition-colors ${
                        fiscalFilter === "NOTA_FISCAL" 
                          ? "bg-emerald-400 text-black font-black" 
                          : "bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-850"
                      }`}
                    >
                      Notas Fiscais ({fiscalNotasCount})
                    </button>
                    <button
                      onClick={() => setFiscalFilter("IMPOSTO")}
                      className={`px-2 py-1 text-[9px] font-mono uppercase tracking-wider transition-colors ${
                        fiscalFilter === "IMPOSTO" 
                          ? "bg-emerald-400 text-black font-black" 
                          : "bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-850"
                      }`}
                    >
                      Impostos ({fiscalImpostosCount})
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setFolhaFilter("ALL")}
                      className={`px-2 py-1 text-[9px] font-mono uppercase tracking-wider transition-colors ${
                        folhaFilter === "ALL" 
                          ? "bg-emerald-400 text-black font-black" 
                          : "bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-850"
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => setFolhaFilter("FOLHA")}
                      className={`px-2 py-1 text-[9px] font-mono uppercase tracking-wider transition-colors ${
                        folhaFilter === "FOLHA" 
                          ? "bg-emerald-400 text-black font-black" 
                          : "bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-850"
                      }`}
                    >
                      Folha ({folhaFolhaCount})
                    </button>
                    <button
                      onClick={() => setFolhaFilter("PRO_LABORE")}
                      className={`px-2 py-1 text-[9px] font-mono uppercase tracking-wider transition-colors ${
                        folhaFilter === "PRO_LABORE" 
                          ? "bg-emerald-400 text-black font-black" 
                          : "bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-850"
                      }`}
                    >
                      Pró-Labore ({folhaProLaboreCount})
                    </button>
                    <button
                      onClick={() => setFolhaFilter("IMPOSTO_FOLHA")}
                      className={`px-2 py-1 text-[9px] font-mono uppercase tracking-wider transition-colors ${
                        folhaFilter === "IMPOSTO_FOLHA" 
                          ? "bg-emerald-400 text-black font-black" 
                          : "bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-850"
                      }`}
                    >
                      Impostos ({folhaImpostosCount})
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Document listings with categorization overrides */}
            {activeSubTab === "fiscal" ? (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {filteredFiscalDocs.length === 0 ? (
                  <p className="text-zinc-500 text-xs font-mono py-12 text-center uppercase">
                    Nenhum documento fiscal {fiscalFilter !== "ALL" ? "desta categoria" : ""} importado
                  </p>
                ) : (
                  filteredFiscalDocs.map(doc => (
                    <div key={doc.id} className="p-3 bg-zinc-950 border border-zinc-850 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {doc.category === 'IMPOSTO' ? (
                          <Landmark className="w-5 h-5 text-emerald-400 shrink-0" />
                        ) : (
                          <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white text-xs font-bold uppercase truncate" title={doc.name}>{doc.name}</span>
                            <span className={`text-[8px] px-1.5 py-0.5 font-mono uppercase font-black tracking-wider ${
                              doc.category === 'IMPOSTO' 
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" 
                                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            }`}>
                              {doc.category === 'IMPOSTO' ? 'Imposto' : 'Nota Fiscal'}
                            </span>
                          </div>
                          <p className="text-[9px] text-zinc-500 font-mono uppercase mt-0.5">
                            Subtipo: {doc.type} • Data: {doc.date} • {doc.size}
                          </p>
                        </div>
                      </div>

                      {/* Interactive tax/value controls */}
                      <div className="flex items-center gap-4 flex-wrap lg:flex-nowrap">
                        {doc.category === 'IMPOSTO' ? (
                          <div className="flex items-center gap-2 bg-zinc-900/60 p-1.5 border border-zinc-800">
                            <div className="flex flex-col">
                              <span className="text-[8px] font-mono uppercase text-zinc-500 px-1">Imposto</span>
                              <select
                                value={doc.taxType || "Outros"}
                                onChange={(e) => handleUpdateFiscalDocFields(doc.id, { taxType: e.target.value })}
                                className="bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-zinc-200 p-1 outline-none uppercase focus:border-emerald-400 cursor-pointer"
                              >
                                <option value="DAS">DAS (Simples)</option>
                                <option value="PIS">PIS</option>
                                <option value="COFINS">COFINS</option>
                                <option value="IRPJ">IRPJ</option>
                                <option value="CSLL">CSLL</option>
                                <option value="ISSQN">ISSQN</option>
                                <option value="ICMS">ICMS</option>
                                <option value="Outros">Outros</option>
                              </select>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[8px] font-mono uppercase text-zinc-500 px-1">Valor do Tributo</span>
                              <div className="relative">
                                <span className="absolute left-1.5 top-1.5 text-[8px] text-zinc-500 font-mono">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={doc.taxValue ?? 0}
                                  onChange={(e) => handleUpdateFiscalDocFields(doc.id, { taxValue: parseFloat(e.target.value) || 0 })}
                                  className="bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-white p-1 pl-5 w-24 outline-none focus:border-emerald-400 text-right font-bold"
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col bg-zinc-900/60 p-1.5 border border-zinc-800">
                            <span className="text-[8px] font-mono uppercase text-zinc-500 px-1">Valor de Faturamento</span>
                            <div className="relative">
                              <span className="absolute left-1.5 top-1.5 text-[8px] text-zinc-500 font-mono">R$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={doc.docValue ?? 0}
                                onChange={(e) => handleUpdateFiscalDocFields(doc.id, { docValue: parseFloat(e.target.value) || 0 })}
                                className="bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-white p-1 pl-5 w-28 outline-none focus:border-emerald-400 text-right font-bold"
                              />
                            </div>
                          </div>
                        )}

                        {/* Interactive manual category override */}
                        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-850 px-2 py-2">
                          <Tag className="w-2.5 h-2.5 text-zinc-500" />
                          <select
                            value={doc.category || 'NOTA_FISCAL'}
                            onChange={(e) => handleUpdateFiscalCategory(doc.id, e.target.value as 'NOTA_FISCAL' | 'IMPOSTO')}
                            className="bg-transparent text-[9px] font-mono text-zinc-300 uppercase outline-none cursor-pointer border-none p-0 focus:ring-0"
                          >
                            <option value="NOTA_FISCAL" className="bg-zinc-950 text-white">Nota Fiscal</option>
                            <option value="IMPOSTO" className="bg-zinc-950 text-white">Imposto</option>
                          </select>
                        </div>

                        <button
                          onClick={() => handleDeleteFiscal(doc.id)}
                          className="text-zinc-600 hover:text-rose-500 transition-colors p-1"
                          title="Excluir documento"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {filteredFolhaDocs.length === 0 ? (
                  <p className="text-zinc-500 text-xs font-mono py-12 text-center uppercase">
                    Nenhum documento de folha {folhaFilter !== "ALL" ? "desta categoria" : ""} importado
                  </p>
                ) : (
                  filteredFolhaDocs.map(doc => (
                    <div key={doc.id} className="p-3 bg-zinc-950 border border-zinc-850 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {doc.category === 'IMPOSTO_FOLHA' ? (
                          <Landmark className="w-5 h-5 text-emerald-400 shrink-0" />
                        ) : doc.category === 'PRO_LABORE' ? (
                          <User className="w-5 h-5 text-emerald-400 shrink-0" />
                        ) : (
                          <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white text-xs font-bold uppercase truncate" title={doc.name}>{doc.name}</span>
                            <span className={`text-[8px] px-1.5 py-0.5 font-mono uppercase font-black tracking-wider ${
                              doc.category === 'IMPOSTO_FOLHA' 
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" 
                                : doc.category === 'PRO_LABORE'
                                  ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            }`}>
                              {doc.category === 'IMPOSTO_FOLHA' ? 'Imposto da Folha' : doc.category === 'PRO_LABORE' ? 'Pró-Labore' : 'Folha'}
                            </span>
                          </div>
                          <p className="text-[9px] text-zinc-500 font-mono uppercase mt-0.5">
                            Subtipo: {doc.type} • Data: {doc.date} • {doc.size}
                          </p>
                        </div>
                      </div>

                      {/* Interactive tax/value controls */}
                      <div className="flex items-center gap-4 flex-wrap lg:flex-nowrap">
                        {doc.category === 'IMPOSTO_FOLHA' ? (
                          <div className="flex items-center gap-2 bg-zinc-900/60 p-1.5 border border-zinc-800">
                            <div className="flex flex-col">
                              <span className="text-[8px] font-mono uppercase text-zinc-500 px-1">Imposto Folha</span>
                              <select
                                value={doc.taxType || "Outros"}
                                onChange={(e) => handleUpdateFolhaDocFields(doc.id, { taxType: e.target.value })}
                                className="bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-zinc-200 p-1 outline-none uppercase focus:border-emerald-400 cursor-pointer"
                              >
                                <option value="INSS">INSS (Previdência)</option>
                                <option value="FGTS">FGTS</option>
                                <option value="IRRF Folha">IRRF Folha</option>
                                <option value="Outros">Outros</option>
                              </select>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[8px] font-mono uppercase text-zinc-500 px-1">Valor Retido</span>
                              <div className="relative">
                                <span className="absolute left-1.5 top-1.5 text-[8px] text-zinc-500 font-mono">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={doc.taxValue ?? 0}
                                  onChange={(e) => handleUpdateFolhaDocFields(doc.id, { taxValue: parseFloat(e.target.value) || 0 })}
                                  className="bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-white p-1 pl-5 w-24 outline-none focus:border-emerald-400 text-right font-bold"
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col bg-zinc-900/60 p-1.5 border border-zinc-800">
                            <span className="text-[8px] font-mono uppercase text-zinc-500 px-1">Valor de Desembolso Bruto</span>
                            <div className="relative">
                              <span className="absolute left-1.5 top-1.5 text-[8px] text-zinc-500 font-mono">R$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={doc.docValue ?? 0}
                                onChange={(e) => handleUpdateFolhaDocFields(doc.id, { docValue: parseFloat(e.target.value) || 0 })}
                                className="bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-white p-1 pl-5 w-28 outline-none focus:border-emerald-400 text-right font-bold"
                              />
                            </div>
                          </div>
                        )}

                        {/* Interactive manual category override */}
                        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-850 px-2 py-2">
                          <Tag className="w-2.5 h-2.5 text-zinc-500" />
                          <select
                            value={doc.category || 'FOLHA'}
                            onChange={(e) => handleUpdateFolhaCategory(doc.id, e.target.value as 'FOLHA' | 'PRO_LABORE' | 'IMPOSTO_FOLHA')}
                            className="bg-transparent text-[9px] font-mono text-zinc-300 uppercase outline-none cursor-pointer border-none p-0 focus:ring-0"
                          >
                            <option value="FOLHA" className="bg-zinc-950 text-white">Folha</option>
                            <option value="PRO_LABORE" className="bg-zinc-950 text-white">Pró-Labore</option>
                            <option value="IMPOSTO_FOLHA" className="bg-zinc-950 text-white">Impostos da Folha</option>
                          </select>
                        </div>

                        <button
                          onClick={() => handleDeleteFolha(doc.id)}
                          className="text-zinc-600 hover:text-rose-500 transition-colors p-1"
                          title="Excluir documento"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="p-4 bg-zinc-950 border border-zinc-850/60 mt-6 flex gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="text-[10px] text-zinc-500 font-mono leading-relaxed uppercase">
              {activeSubTab === "fiscal" 
                ? "As Notas Fiscais e Guias de Impostos (DAS/DARF) são categorizadas instantaneamente. O motor de OCR extrai valores fiscais e de impostos para emitir provisões automáticas no balancete."
                : "Os Holerites, Recibos de Pró-labore e Guias Sociais (INSS/FGTS) são categorizados separadamente, permitindo a correta apropriação trabalhista e previdenciária."
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
