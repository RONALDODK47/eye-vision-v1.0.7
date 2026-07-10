import {
  parseCompanyYmd,
  getAccountingTasksMonthStart,
  isMonthBeforeAccountingTasksStart,
} from "@/lib/companyTaskPeriod";

export function isSaidaOuBaixaStatus(company) {
  const s = String(company?.status || "").trim().toLowerCase();
  return s === "saida" || s === "baixa";
}

/** Data de entrada contábil (somente início das tarefas). */
export function getCompanyEntryDate(company) {
  return parseCompanyYmd(company?.tasks_start_date);
}

/** Data de saída/baixa (qualquer status com data preenchida). */
export function getCompanyExitDate(company) {
  return parseCompanyYmd(company?.exit_date);
}

/** Início das tarefas de encerramento (aba Saídas). */
export function getExitTasksStartDate(company) {
  return (
    parseCompanyYmd(company?.exit_tasks_start_date) ||
    (isSaidaOuBaixaStatus(company) ? getCompanyExitDate(company) : null)
  );
}

function endOfMonthDate(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
}

/** monthIndex: 0 = janeiro (igual getMonth()). */
function monthIndexToCalendarMonth(monthIndex) {
  return monthIndex + 1;
}

/** Empresa já entrou na contabilidade até o fim do mês. */
export function isCompanyEnteredOnOrBeforeMonthEnd(company, year, monthIndex) {
  const start = getAccountingTasksMonthStart(company);
  if (!start) return false;
  const month1 = monthIndexToCalendarMonth(monthIndex);
  if (isMonthBeforeAccountingTasksStart(company, year, month1)) return false;
  return true;
}

/** Entrada no mês (data de início das tarefas). */
export function isCompanyEnteredInMonth(company, year, monthIndex) {
  const entry = getCompanyEntryDate(company);
  if (!entry) return false;
  return entry.getFullYear() === year && entry.getMonth() === monthIndex;
}

/** Já saiu da base até o fim do mês. */
export function isCompanyExitedOnOrBeforeMonthEnd(company, year, monthIndex) {
  const endT = endOfMonthDate(year, monthIndex);

  if (isSaidaOuBaixaStatus(company)) {
    const exit = getCompanyExitDate(company);
    if (!exit) return true;
    return exit.getTime() <= endT.getTime();
  }

  const exit = getCompanyExitDate(company);
  return Boolean(exit && exit.getTime() <= endT.getTime());
}

/** Carteira ao fim do mês: entrou e ainda não saiu. */
export function isCompanyInPortfolioAtMonthEnd(company, year, monthIndex) {
  if (!isCompanyEnteredOnOrBeforeMonthEnd(company, year, monthIndex)) return false;
  if (isCompanyExitedOnOrBeforeMonthEnd(company, year, monthIndex)) return false;
  return true;
}

export function countPortfolioAtMonthEnd(companies, year, monthIndex) {
  return companies.filter((c) => isCompanyInPortfolioAtMonthEnd(c, year, monthIndex)).length;
}

export function countEntriesInMonth(companies, year, monthIndex) {
  return companies.filter((c) => isCompanyEnteredInMonth(c, year, monthIndex)).length;
}

export function countExitsInMonth(companies, year, monthIndex) {
  return companies.filter((c) => {
    if (!isSaidaOuBaixaStatus(c)) return false;
    const exit = getCompanyExitDate(c);
    if (!exit) return false;
    return exit.getFullYear() === year && exit.getMonth() === monthIndex;
  }).length;
}

export function isExitInMonth(company, year, monthIndex) {
  if (!isSaidaOuBaixaStatus(company)) return false;
  const exit = getCompanyExitDate(company);
  if (!exit) return false;
  return exit.getFullYear() === year && exit.getMonth() === monthIndex;
}

export function isExitInYear(company, year) {
  if (!isSaidaOuBaixaStatus(company)) return false;
  const exit = getCompanyExitDate(company);
  if (!exit) return false;
  return exit.getFullYear() === year;
}

export function isExitTasksStartInMonth(company, year, monthIndex) {
  const d = getExitTasksStartDate(company);
  if (!d) return false;
  return d.getFullYear() === year && d.getMonth() === monthIndex;
}

/** Empresas ativas/implantação na carteira do mês (para gráficos de status). */
export function filterCompaniesForDashboardPeriod(companies, year, monthIndex) {
  return companies.filter((c) => isCompanyInPortfolioAtMonthEnd(c, year, monthIndex));
}
