export type ActiveTab = 'manager' | 'pricing' | 'gestao' | 'admin' | 'debug';

export interface LoanContract {
  id: string;
  companyName: string;
  contractNumber: string;
  /** Instituição financeira (ex.: Banco do Brasil). */
  bankName: string;
  type: 'SAC' | 'PRICE';
  principal: number;
  interestRate: number;
  installments: number;
  startDate: string;
  gracePeriod: number;
  graceType: 'capitalized' | 'paid';
  indexType: 'SELIC' | 'CDI' | 'FIXED' | 'NONE';
  iof: number;
  costs: number;
  customVarRate?: number;
}

export interface CompanyApp {
  id: string;
  name: string;
  folder: string;
  startDate: string;
  amount: number;
  index: string;
  rate: number;
  numeroAplicacao?: string;
}

export interface LoanAccountFields {
  accJurosAproDebit: string;
  accJurosAproCredit: string;
  accApropriacaoDebit: string;
  accApropriacaoCredit: string;
  accTransferenciaDebit: string;
  accTransferenciaCredit: string;
  accEmprestimoDebit: string;
  accEmprestimoCredit: string;
  accIofDebit: string;
  accIofCredit: string;
}
