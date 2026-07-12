import { PlanoConta, BalanceteLine, Installment } from "../types";

export const DEFAULT_PLANO_CONTAS: PlanoConta[] = [];

export const STANDARD_PLANO_CONTAS: PlanoConta[] = [
  { code: "1", classification: "1.01.01.001", name: "CAIXA GERAL", type: "ATIVO" },
  { code: "2", classification: "1.01.02.001", name: "BANCO CONTA MOVIMENTO", type: "ATIVO" },
  { code: "3", classification: "1.01.03.001", name: "CLIENTES NACIONAIS", type: "ATIVO" },
  { code: "4", classification: "1.02.01.001", name: "MÁQUINAS E EQUIPAMENTOS", type: "ATIVO" },
  { code: "5", classification: "2.01.01.001", name: "FORNECEDORES", type: "PASSIVO" },
  { code: "6", classification: "2.01.02.001", name: "EMPRÉSTIMOS BANCÁRIOS", type: "PASSIVO" },
  { code: "7", classification: "2.01.03.001", name: "MÚTUOS PASSIVOS", type: "PASSIVO" },
  { code: "8", classification: "2.01.04.001", name: "HONORÁRIOS A PAGAR", type: "PASSIVO" },
  { code: "9", classification: "2.01.04.002", name: "SALÁRIOS A PAGAR", type: "PASSIVO" },
  { code: "10", classification: "2.03.01.001", name: "CAPITAL SOCIAL REALIZADO", type: "PATRIMONIO_LIQUIDO" },
  { code: "11", classification: "2.03.02.001", name: "LUCROS ACUMULADOS", type: "PATRIMONIO_LIQUIDO" },
  { code: "12", classification: "4.01.01.001", name: "RECEITA DE PRESTAÇÃO DE SERVIÇOS", type: "RECEITA" },
  { code: "13", classification: "4.01.02.001", name: "RECEITA DE VENDAS", type: "RECEITA" },
  { code: "14", classification: "5.01.01.001", name: "DESPESAS DE ALUGUEL", type: "DESPESA" },
  { code: "15", classification: "5.01.02.001", name: "DESPESAS COM SALÁRIOS E ENCARGOS", type: "DESPESA" },
  { code: "16", classification: "5.01.03.001", name: "DESPESAS FINANCEIRAS / JUROS", type: "DESPESA" },
  { code: "17", classification: "5.01.04.001", name: "DESPESAS DE VIAGENS E REFEIÇÕES", type: "DESPESA" },
  { code: "18", classification: "5.01.05.001", name: "OUTRAS DESPESAS OPERACIONAIS", type: "DESPESA" },
];

export const DEFAULT_BALANCETE: BalanceteLine[] = [];

export function calculatePriceAmortization(principal: number, yearlyRate: number, termMonths: number): Installment[] {
  const monthlyRate = (yearlyRate / 100) / 12;
  const installments: Installment[] = [];
  let remainingBalance = principal;

  // PMT formula: P * (r * (1 + r)^n) / ((1 + r)^n - 1)
  let payment = 0;
  if (monthlyRate === 0) {
    payment = principal / termMonths;
  } else {
    payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
  }

  for (let month = 1; month <= termMonths; month++) {
    const interest = remainingBalance * monthlyRate;
    const principalPaid = payment - interest;
    remainingBalance = Math.max(0, remainingBalance - principalPaid);

    installments.push({
      month,
      payment: parseFloat(payment.toFixed(2)),
      principal: parseFloat(principalPaid.toFixed(2)),
      interest: parseFloat(interest.toFixed(2)),
      balance: parseFloat(remainingBalance.toFixed(2))
    });
  }

  return installments;
}

export function calculateSacAmortization(principal: number, yearlyRate: number, termMonths: number): Installment[] {
  const monthlyRate = (yearlyRate / 100) / 12;
  const installments: Installment[] = [];
  const principalPaid = principal / termMonths; // Constant amortization
  let remainingBalance = principal;

  for (let month = 1; month <= termMonths; month++) {
    const interest = remainingBalance * monthlyRate;
    const payment = principalPaid + interest;
    remainingBalance = Math.max(0, remainingBalance - principalPaid);

    installments.push({
      month,
      payment: parseFloat(payment.toFixed(2)),
      principal: parseFloat(principalPaid.toFixed(2)),
      interest: parseFloat(interest.toFixed(2)),
      balance: parseFloat(remainingBalance.toFixed(2))
    });
  }

  return installments;
}
