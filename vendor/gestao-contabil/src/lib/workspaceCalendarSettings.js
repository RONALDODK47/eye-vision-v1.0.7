import { useEffect, useState } from "react";

/** Mês/ano de referência na lista de empresas e no calendário INOV (1.º dia do mês, YYYY-MM-DD). */
export const REFERENCE_MONTH_YMD_KEY = "gc_reference_month_ymd";

/** Início das tarefas do calendário INOV (mesma ideia que «Início das tarefas contábeis» na empresa). */
export const INOV_CALENDAR_START_YMD_KEY = "gc_inov_calendar_start_ymd";

/** Se verdadeiro, o INOV mostra todos os meses; se falso, só o mês de referência. */
export const INOV_SHOW_ALL_MONTHS_KEY = "gc_inov_show_all_months";

export function dispatchWorkspaceCalendarChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("gc-workspace-calendar"));
}

/** Ano civil «do sistema»: janela [ano anterior … ano atual], alinhada ao calendário INOV. */
export function getReferenceYearBounds() {
  const cy = new Date().getFullYear();
  return { cy, minYear: cy - 1, maxYear: cy };
}

/**
 * Mantém o mês de referência dentro de [jan (ano−1) … dez (ano atual)].
 * @param {Date|null} d
 * @returns {Date|null}
 */
export function clampReferenceMonthDate(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const { minYear, maxYear } = getReferenceYearBounds();
  const min = new Date(minYear, 0, 1);
  const max = new Date(maxYear, 11, 1);
  const cur = new Date(d.getFullYear(), d.getMonth(), 1);
  const t = cur.getTime();
  if (t < min.getTime()) return min;
  if (t > max.getTime()) return max;
  return cur;
}

export function getReferenceMonthAsDate() {
  if (typeof localStorage === "undefined") return null;
  const s = localStorage.getItem(REFERENCE_MONTH_YMD_KEY);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return clampReferenceMonthDate(dt);
}

export function setReferenceMonthFromDate(d) {
  if (typeof localStorage === "undefined") return;
  const cd = clampReferenceMonthDate(d);
  if (!cd) {
    localStorage.removeItem(REFERENCE_MONTH_YMD_KEY);
  } else {
    const y = cd.getFullYear();
    const m = cd.getMonth() + 1;
    localStorage.setItem(REFERENCE_MONTH_YMD_KEY, `${y}-${String(m).padStart(2, "0")}-01`);
  }
  dispatchWorkspaceCalendarChange();
}

export function getInovCalendarStartYmd() {
  if (typeof localStorage === "undefined") return "";
  const v = localStorage.getItem(INOV_CALENDAR_START_YMD_KEY);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

export function setInovCalendarStartYmd(ymd) {
  if (typeof localStorage === "undefined") return;
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(String(ymd).slice(0, 10))) {
    localStorage.removeItem(INOV_CALENDAR_START_YMD_KEY);
  } else {
    localStorage.setItem(INOV_CALENDAR_START_YMD_KEY, String(ymd).slice(0, 10));
  }
  dispatchWorkspaceCalendarChange();
}

/** Primeiro dia do mês da data de início (alinhado a `getAccountingTasksMonthStart` em empresas). */
export function getInovCalendarStartFirstOfMonthYmd() {
  const raw = getInovCalendarStartYmd();
  if (!raw) return "";
  const [y, m] = raw.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export function getInovShowAllMonths() {
  if (typeof localStorage === "undefined") return true;
  const v = localStorage.getItem(INOV_SHOW_ALL_MONTHS_KEY);
  if (v === null) return true;
  return v === "1" || v === "true";
}

export function setInovShowAllMonths(showAll) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(INOV_SHOW_ALL_MONTHS_KEY, showAll ? "1" : "0");
  dispatchWorkspaceCalendarChange();
}

/** Re-render quando mês de referência ou início INOV mudam (local ou noutro separador). */
export function useWorkspaceCalendarSync() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const bump = () => setN((x) => x + 1);
    window.addEventListener("storage", bump);
    window.addEventListener("gc-workspace-calendar", bump);
    return () => {
      window.removeEventListener("storage", bump);
      window.removeEventListener("gc-workspace-calendar", bump);
    };
  }, []);
  return n;
}
