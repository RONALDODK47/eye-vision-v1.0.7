import { Calculator, FileSearch, HandCoins, ReceiptText } from "lucide-react";

/** Em build de produção, abrir os sites publicados — localhost só em desenvolvimento. */
const isDev = Boolean(import.meta.env.DEV);
const OCR_URL = isDev ? "http://localhost:3001/" : "https://multiverso-extrato-0484438312.web.app/";
const FISCAL_URL = isDev ? "http://localhost:3002/" : "https://precocerto-controle.web.app/";
const EMPRESTIMOS_URL = isDev ? "http://localhost:3003/" : "https://multiverso-calculos-0484438312.web.app/";

/**
 * Catálogo unificado dos softwares do ecossistema MULTIVERSO.
 * Para adicionar um novo software, inclua um novo objeto neste array.
 */
export const SOFTWARE_CATALOG = [
  {
    id: "gestao-contabil",
    nome: "INOV Gestão Contábil",
    pasta: "GESTAO-CONTABIL-master",
    cor: "#0ea5e9",
    icone: Calculator,
    descricao: "Painel central de gestão contábil, empresas, tarefas e indicadores operacionais.",
    route: "/Dashboard",
  },
  {
    id: "extrato-vision",
    nome: "INOV OCR",
    pasta: "extrato-vision (3)",
    cor: "#f97316",
    icone: FileSearch,
    descricao: "OCR e extração inteligente de dados financeiros com foco em velocidade e precisão.",
    url: OCR_URL,
  },
  {
    id: "fiscal-pricing",
    nome: "INOV Fiscal",
    pasta: "precifácil-erp",
    cor: "#a855f7",
    icone: ReceiptText,
    descricao: "Módulo fiscal e precificação com simulações estratégicas e controles de compliance.",
    url: FISCAL_URL,
  },
  {
    id: "emprestimos",
    nome: "INOV Empréstimos",
    pasta: "EMPRESTIMOS-MASTER-master",
    cor: "#22c55e",
    icone: HandCoins,
    descricao: "Simulações de crédito, análises e visão consolidada para decisões financeiras.",
    url: EMPRESTIMOS_URL,
  },
];

export const SOFTWARE_DEFAULT_ID = SOFTWARE_CATALOG[0]?.id || "";
