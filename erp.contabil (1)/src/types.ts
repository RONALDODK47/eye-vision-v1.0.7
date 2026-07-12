/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  category: string;
}

export interface BankConfig {
  bankId: string;
  bankName: string;
  accountId: string;
  accountType: 'CHECKING' | 'SAVINGS' | 'CREDITCARD';
  currency: string;
}

export interface ExtractedData {
  transactions: {
    date: string; // YYYY-MM-DD
    description: string;
    amount: number;
    type: 'DEBIT' | 'CREDIT';
    category: string;
  }[];
  currency?: string;
  summary?: string;
}

export interface PlanoConta {
  code: string; // Reduced code, e.g., '1', '2'
  classification: string; // Hierarchical structured code, e.g., '1.01.01.001'
  name: string;
  type: 'ATIVO' | 'PASSIVO' | 'PATRIMONIO_LIQUIDO' | 'RECEITA' | 'DESPESA';
  isSynthetic?: boolean;
  rfbCode?: string;
  rfbName?: string;
}

export interface Conciliacao {
  transactionId: string;
  debitAccount: string; // Account Code
  creditAccount: string; // Account Code
  status: 'PENDENTE' | 'CONCILIADO';
  observation?: string;
}

export interface BalanceteLine {
  code: string; // Reduced code
  classification: string; // Hierarchical structured code
  name: string;
  type: 'ATIVO' | 'PASSIVO' | 'PATRIMONIO_LIQUIDO' | 'RECEITA' | 'DESPESA';
  openingBalance: number;
  debit: number;
  credit: number;
  closingBalance: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  attachment?: {
    name: string;
    type: string;
    content?: string;
  };
  timestamp: string;
}

export interface Installment {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export interface LoanContract {
  id: string;
  name: string;
  bank: string;
  principal: number;
  interestRate: number; // yearly, e.g. 12%
  term: number; // months
  type: 'SAC' | 'PRICE';
  startDate: string;
  folder: string; // virtual folder
  installments: Installment[];
  posted: boolean;
}

export interface HonorarioProvisao {
  id: string;
  year: number;
  monthlyValue: number;
  accountCode: string;
  posted: boolean;
}

export interface DocumentoFiscal {
  id: string;
  name: string;
  type: string; // e.g., 'NF-e', 'Guia DARF', etc.
  category?: 'NOTA_FISCAL' | 'IMPOSTO';
  date: string;
  size: string;
  taxType?: string; // e.g. 'DAS', 'PIS', 'COFINS', 'IRPJ', 'CSLL', 'ISSQN', 'ICMS', 'Outros'
  taxValue?: number;
  docValue?: number;
}

export interface DocumentoFolha {
  id: string;
  name: string;
  type: string; // e.g., 'Folha Pagamento', 'Holerite', etc.
  category?: 'FOLHA' | 'PRO_LABORE' | 'IMPOSTO_FOLHA';
  date: string;
  size: string;
  taxType?: string; // e.g. 'INSS', 'FGTS', 'IRRF Folha', 'Outros'
  taxValue?: number;
  docValue?: number;
}

export interface Company {
  id: string;
  name: string;
  cnpj: string;
  partners: string; // Names of the partners/sócios
  socialContractName?: string;
  socialContractSize?: string;
}
