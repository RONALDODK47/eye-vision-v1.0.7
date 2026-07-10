/** Data de referência YYYY-MM-DD a partir do Firestore / formulário */
export function parseCompanyYmd(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const localDate = new Date(year, month - 1, day);
    return Number.isNaN(localDate.getTime()) ? null : localDate;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Primeiro dia do mês em que as tarefas contábeis passam a valer (somente início das tarefas). */
export function getAccountingTasksMonthStart(company) {
  if (!company) return null;
  const raw = company.tasks_start_date;
  if (!raw) return null;
  const d = parseCompanyYmd(raw);
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Mês/ano visualizado é estritamente anterior ao mês de início das tarefas → não contar atraso. */
export function isMonthBeforeAccountingTasksStart(company, year, month) {
  const start = getAccountingTasksMonthStart(company);
  if (!start) return false;
  const period = new Date(year, month - 1, 1);
  return period < start;
}

/** Chave YYYY-MM para período de tarefa mensal */
export function getTaskPeriodKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Tarefa mensal deve entrar nas contagens / lista do mês (year, month)?
 * - recurring (padrão): todos os meses
 * - once + only_in_period_key: só naquele YYYY-MM
 * - until + repeat_until_period_key: do primeiro mês válido até esse YYYY-MM (inclusive)
 */
export function isMonthlyTaskInPeriodScope(task, year, month) {
  if (!task || String(task.frequency || "") !== "mensal") return false;
  const mode = String(task.monthly_repeat_mode || "recurring").toLowerCase();
  const pk = getTaskPeriodKey(year, month);

  if (mode === "once") {
    const only = String(task.only_in_period_key || "").trim();
    if (!only) return true;
    return only === pk;
  }
  if (mode === "until") {
    const until = String(task.repeat_until_period_key || "").trim();
    if (!until) return true;
    return pk.localeCompare(until) <= 0;
  }
  return true;
}
