import { describe, expect, it } from 'vitest';
import { parseISO } from 'date-fns';
import { generateDominioTXT, contarTransferenciasLpCp } from './dominioExporter';
import { calculateLoan } from './loanCalculator';
import type { LoanRow } from './loanCalculator';

function row(partial: Partial<LoanRow> & Pick<LoanRow, 'month' | 'date'>): LoanRow {
  return {
    accrualDays: 30,
    referenceMonthDays: 30,
    die30Factor: 1,
    opCostPeriodFactor: 1,
    initialBalance: 1000,
    interest: 10,
    amortization: 0,
    monthlyCost: 0,
    iof: 0,
    installment: 10,
    finalBalance: 1010,
    shortTermBalance: 0,
    longTermBalance: 1010,
    cpcShortTermWindowMonths: [],
    cpcShortTermWindowDescribe: '—',
    isGrace: false,
    ...partial,
  };
}

describe('generateDominioTXT — dataGerarLancamentosAPartirStr', () => {
  const baseConfig = {
    accJurosAproDebit: '1115',
    accJurosAproCredit: '1114',
    accApropriacaoDebit: '368',
    accApropriacaoCredit: '1115',
    accTransferenciaDebit: '1116',
    accTransferenciaCredit: '1114',
    accEmprestimoDebit: '100',
    accEmprestimoCredit: '200',
    accIofDebit: '108',
    accIofCredit: '200',
  };

  it('sem data de corte inclui provisão do 1º mês após contrato', () => {
    const schedule: LoanRow[] = [
      row({ month: 0, date: parseISO('2023-02-10'), interest: 0, initialBalance: 1000, finalBalance: 1000 }),
      row({ month: 1, date: parseISO('2023-03-10'), interest: 12 }),
      row({ month: 2, date: parseISO('2023-04-10'), interest: 11 }),
    ];
    const txt = generateDominioTXT(schedule, baseConfig);
    expect(txt).toContain('01/03/2023');
    expect(txt).toContain('PROVISAO DE JUROS A APROPRIAR');
  });

  it('transferência LP→CP só em 31/12 (dezembro), não no mês seguinte ao pagamento', () => {
    const schedule: LoanRow[] = [
      row({
        month: 0,
        date: parseISO('2023-02-10'),
        interest: 0,
        initialBalance: 100_000,
        finalBalance: 100_000,
        shortTermBalance: 0,
        longTermBalance: 100_000,
      }),
      row({
        month: 1,
        date: parseISO('2023-03-10'),
        interest: 500,
        amortization: 1000,
        shortTermBalance: 0,
        longTermBalance: 99_000,
      }),
      row({
        month: 2,
        date: parseISO('2023-12-10'),
        interest: 400,
        amortization: 1000,
        shortTermBalance: 12_000,
        longTermBalance: 80_000,
      }),
    ];
    const txt = generateDominioTXT(schedule, baseConfig);
    expect(txt).not.toContain('01/04/2023');
    expect(txt).not.toContain('01/01/2024');
    expect(txt).toContain('31/12/2023');
    expect(txt).toContain('TRANSFERENCIA DO LONGO PARA O CURTO PRAZO');
  });

  it('com corte posterior omite provisões anteriores e mantém contrato na data de corte', () => {
    const schedule: LoanRow[] = [
      row({ month: 0, date: parseISO('2023-02-10'), interest: 0, initialBalance: 1000, finalBalance: 1000 }),
      row({ month: 1, date: parseISO('2023-03-10'), interest: 12 }),
      row({ month: 2, date: parseISO('2023-04-10'), interest: 11 }),
    ];
    const txt = generateDominioTXT(schedule, {
      ...baseConfig,
      dataGerarLancamentosAPartirStr: '2023-04-01',
    });
    expect(txt).not.toContain('01/03/2023');
    expect(txt).toContain('01/04/2023');
    expect(txt).toContain('01/04/2023;100;200');
    expect(txt).toContain('VALOR DO EMPRESTIMO');
  });

  it('omitTransferenciaLongoParaCurto suprime transferência LP→CP (uso interno)', () => {
    const schedule: LoanRow[] = [
      row({
        month: 0,
        date: parseISO('2023-02-10'),
        interest: 0,
        initialBalance: 100_000,
        finalBalance: 100_000,
      }),
      row({
        month: 1,
        date: parseISO('2023-12-10'),
        interest: 400,
        shortTermBalance: 12_000,
        longTermBalance: 80_000,
      }),
    ];
    const txt = generateDominioTXT(schedule, {
      ...baseConfig,
      omitTransferenciaLongoParaCurto: true,
    });
    expect(txt).not.toContain('TRANSFERENCIA DO LONGO PARA O CURTO PRAZO');
  });

  it('modo fiscal gera transferência LP→CP em 31/12 na carência', () => {
    const schedule: LoanRow[] = [
      row({
        month: 0,
        date: parseISO('2023-02-10'),
        interest: 0,
        initialBalance: 150_000,
        finalBalance: 150_000,
      }),
      row({
        month: 10,
        date: parseISO('2023-12-10'),
        interest: 800,
        isGrace: true,
        amortization: 0,
        shortTermBalance: 48_648.65,
        longTermBalance: 120_000,
        finalBalance: 168_648.65,
      }),
    ];
    const txt = generateDominioTXT(schedule, {
      ...baseConfig,
      omitTransferenciaLongoParaCurto: false,
    });
    expect(txt).toContain('31/12/2023');
    expect(txt).toContain('TRANSFERENCIA DO LONGO PARA O CURTO PRAZO');
  });

  it('empréstimo que encerra no mesmo ano civil gera transferência LP→CP em 31/12', () => {
    const schedule: LoanRow[] = [
      row({
        month: 0,
        date: parseISO('2024-01-15'),
        interest: 0,
        initialBalance: 60_000,
        finalBalance: 60_000,
        installment: 0,
      }),
      row({
        month: 1,
        date: parseISO('2024-02-15'),
        interest: 300,
        amortization: 10_000,
        installment: 10_300,
        shortTermBalance: 41_200,
        longTermBalance: 49_700,
        finalBalance: 50_000,
      }),
      row({
        month: 10,
        date: parseISO('2024-11-15'),
        interest: 50,
        amortization: 10_000,
        installment: 10_050,
        shortTermBalance: 10_050,
        longTermBalance: 0,
        finalBalance: 10_050,
      }),
      row({
        month: 11,
        date: parseISO('2024-12-15'),
        interest: 50,
        amortization: 10_000,
        installment: 10_050,
        shortTermBalance: 0,
        longTermBalance: 0,
        finalBalance: 0,
      }),
    ];
    const txt = generateDominioTXT(schedule, baseConfig);
    expect(txt).toContain('31/12/2024');
    expect(txt).toContain('TRANSFERENCIA DO LONGO PARA O CURTO PRAZO');
    expect(txt).toContain('10050,00');
  });

  it('última parcela em novembro (sem linha de dezembro) ainda gera transferência em 31/12', () => {
    const schedule: LoanRow[] = [
      row({
        month: 0,
        date: parseISO('2024-01-15'),
        interest: 0,
        initialBalance: 30_000,
        finalBalance: 30_000,
      }),
      row({
        month: 9,
        date: parseISO('2024-10-15'),
        interest: 100,
        amortization: 5_000,
        installment: 5_100,
        shortTermBalance: 5_100,
        longTermBalance: 10_000,
        finalBalance: 15_100,
      }),
      row({
        month: 10,
        date: parseISO('2024-11-15'),
        interest: 50,
        amortization: 5_000,
        installment: 5_050,
        shortTermBalance: 0,
        longTermBalance: 0,
        finalBalance: 0,
      }),
    ];
    const txt = generateDominioTXT(schedule, baseConfig);
    expect(txt).toContain('31/12/2024');
    expect(txt).toContain('TRANSFERENCIA DO LONGO PARA O CURTO PRAZO');
    expect(txt).toContain('5100,00');
  });

  it('integração: calculateLoan fiscal + TXT não gera transferência se empréstimo encerra antes de 31/12', () => {
    const schedule = calculateLoan({
      principal: 48_000,
      months: 6,
      fixedRateMonth: 1,
      fixedRateType: 'percent' as const,
      varRateMonth: 0,
      varIndexMode: 'none' as const,
      proRataDieMode: 'linear' as const,
      system: 'SAC' as const,
      gracePeriod: 0,
      graceType: 'capitalized' as const,
      monthlyOperationCost: 0,
      monthlyOpCostType: 'percent' as const,
      graceFixedRateMonth: 1,
      graceFixedRateType: 'percent' as const,
      graceMonthlyOperationCost: 0,
      graceMonthlyOpCostType: 'percent' as const,
      operationalCostDayBasis: 'commercial30' as const,
      graceInterestRoundingMode: 'none' as const,
      graceInterestDecimalPlaces: 2,
      contractDate: parseISO('2024-02-01'),
      firstInstallmentDate: parseISO('2024-03-01'),
      sacInterestAccrual: 'mensalContrato' as const,
      sacMoneyRounding: 'halfAwayFromZero' as const,
      cpcPresentationMode: 'fiscal',
    });

    const config = {
      accJurosAproDebit: '1115',
      accJurosAproCredit: '1114',
      accApropriacaoDebit: '368',
      accApropriacaoCredit: '1115',
      accTransferenciaDebit: '1116',
      accTransferenciaCredit: '1114',
      accEmprestimoDebit: '100',
      accEmprestimoCredit: '200',
      accIofDebit: '108',
      accIofCredit: '200',
      omitTransferenciaLongoParaCurto: false,
    };

    expect(contarTransferenciasLpCp(schedule, config)).toBe(0);
    const txt = generateDominioTXT(schedule, config);
    expect(txt).not.toContain('TRANSFERENCIA DO LONGO PARA O CURTO PRAZO');
  });
});
