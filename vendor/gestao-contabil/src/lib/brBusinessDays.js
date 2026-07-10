/**
 * Feriados nacionais comuns (Brasil) e utilitários de dia útil.
 * Carnaval / Sexta-feira Santa / Corpus Christi variam por ano — lista revisada para 2026–2027.
 */

/** @type {Set<string>} datas YYYY-MM-DD */
const BR_NATIONAL = new Set([
  "2026-01-01",
  "2026-02-16",
  "2026-02-17",
  "2026-04-03",
  "2026-04-21",
  "2026-05-01",
  "2026-06-04",
  "2026-09-07",
  "2026-10-12",
  "2026-11-02",
  "2026-11-15",
  "2026-11-20",
  "2026-12-25",
  "2027-01-01",
  "2027-02-08",
  "2027-02-09",
  "2027-03-26",
  "2027-04-21",
  "2027-05-01",
  "2027-05-27",
  "2027-09-07",
  "2027-10-12",
  "2027-11-02",
  "2027-11-15",
  "2027-11-20",
  "2027-12-25",
]);

export function toYmd(d) {
  const x = d instanceof Date ? new Date(d.getTime()) : new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isWeekend(d) {
  const x = d instanceof Date ? d : parseYmd(d);
  if (!x) return false;
  const day = x.getDay();
  return day === 0 || day === 6;
}

export function isBrazilHoliday(ymd) {
  return BR_NATIONAL.has(String(ymd).slice(0, 10));
}

export function isBusinessDay(d) {
  const x = d instanceof Date ? d : parseYmd(d);
  if (!x) return false;
  const ymd = toYmd(x);
  return !isWeekend(x) && !isBrazilHoliday(ymd);
}

/** Próximo dia útil a partir de `d` (inclusive). */
export function toNextBusinessDay(d) {
  let x = d instanceof Date ? new Date(d.getTime()) : parseYmd(d);
  if (!x) return null;
  x.setHours(12, 0, 0, 0);
  let guard = 0;
  while (!isBusinessDay(x) && guard < 366) {
    x.setDate(x.getDate() + 1);
    guard++;
  }
  return guard >= 366 ? null : x;
}

/** Dia útil anterior a partir de `d` (inclusive). */
export function toPreviousBusinessDay(d) {
  let x = d instanceof Date ? new Date(d.getTime()) : parseYmd(d);
  if (!x) return null;
  x.setHours(12, 0, 0, 0);
  let guard = 0;
  while (!isBusinessDay(x) && guard < 366) {
    x.setDate(x.getDate() - 1);
    guard++;
  }
  return guard >= 366 ? null : x;
}

/**
 * Se a data cai em fim de semana ou feriado, o prazo “efetivo” é o dia útil anterior.
 */
export function effectiveDeadlineYmd(ymd) {
  const x = parseYmd(ymd);
  if (!x) return String(ymd || "").slice(0, 10);
  if (isBusinessDay(x)) return toYmd(x);
  const n = toPreviousBusinessDay(x);
  return n ? toYmd(n) : toYmd(x);
}

export function listBrazilHolidaysYmd(year) {
  return [...BR_NATIONAL].filter((h) => h.startsWith(String(year))).sort();
}
