/**
 * Classifica obrigações contábeis/fiscais da planilha INOV e gera datas de provisão:
 * - monthly: repete todo mês (mesmo dia, com ajuste fim de mês)
 * - quarterly: a cada 3 meses a partir do mês-base (ex.: IRPJ/CSLL trimestral)
 * - semiannual: a cada 6 meses
 * - annual: mesmo dia/mês em cada ano (padrão)
 */

import { parseYmd } from "@/lib/brBusinessDays";

/** @typedef {'monthly' | 'quarterly' | 'semiannual' | 'annual'} InovRecurrenceKind */

/** Meses para filtros e rótulos (ordem do ano). */
export const INOV_CALENDAR_MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function ymdToCalendarMonthLabel(ymd) {
  const m = Number(String(ymd).slice(5, 7));
  if (!m || m < 1 || m > 12) return "";
  return INOV_CALENDAR_MONTHS[m - 1];
}

function normU(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

/**
 * @param {string} raw
 * @returns {{ kind: InovRecurrenceKind }}
 */
export function inferInovRecurrence(raw) {
  const u = normU(raw);

  // Projetos / cronogramas Paralegal ou TI pontuais (não são recorrentes mensais)
  if (
    !u.startsWith("[") &&
    /\bFASE\s+\d+\b/.test(u) &&
    (u.includes("PARALEGAL") || u.includes("PROCESSO DE BAIXA") || u.includes("ABERTURA DE EMPRESAS"))
  ) {
    return { kind: "annual" };
  }
  if (/DISTRIBUIDOR DE ARQUIVOS FASE|SITTAX|AUTO AVALIAC/i.test(u)) {
    return { kind: "annual" };
  }

  if (/\bSEMESTR/.test(u)) {
    return { kind: "semiannual" };
  }

  // Trimestral fiscal / contábil (PIS/COFINS guias costumam ser mensais — ficam na regra mensal abaixo)
  if (
    /\b[1-4]\s*O?\s*TRIM\b/.test(u) ||
    /\bTRIMESTR/.test(u) ||
    /\bIRPJ\b.*\bCSLL\b.*\bTRIM\b/.test(u) ||
    /\bCSLL\b.*\bTRIM\b/.test(u) ||
    /\bIRPJ\b.*\bTRIM\b/.test(u)
  ) {
    return { kind: "quarterly" };
  }

  // Texto após ] (corpo da célula): rótulos [BALANCETE MENSAL] no cabeçalho não mensalizam só Paralegal no corpo
  const body = raw.includes("]") ? normU(raw.split("]").pop() || "") : u;

  // Mensal típico (folha, balancete mensal no corpo, guias, SPED mensal, etc.)
  if (
    body.includes("BALANCETE MENSAL") ||
    body.includes("BALANCETE 50 DIAS") ||
    /\bFOLHA\s+PAGAMENTO\b/.test(u) ||
    /\bFOLHAS\s+PAGAMENTO\b/.test(u) ||
    u.includes("MES CORRENTE") ||
    u.includes("ULTIMO DIA UTIL") ||
    u.includes("ULTIMO DIA ÚTIL") ||
    /GUIAS.*FGTS|FGTS.*DIGITAL/.test(u) ||
    u.includes("IFECHAMENTO INSS") ||
    /\bEFD\s*REINF\b/.test(u) ||
    /IMPORTACAO.*CONSIGNADO.*FOLHA|EMPRESTIMO.*CONSIGNADO.*FOLHA/i.test(u) ||
    /\bDIFAL\b.*\bSIMPLES\b/.test(u) ||
    /\bENTREGA\s+ISS\b/.test(u) ||
    /\bPIS\b.*\bCOFINS\b|\bCOFINS\b.*\bPIS\b/.test(u) ||
    (body.includes("MENSAL") && !u.includes("TRIM"))
  ) {
    return { kind: "monthly" };
  }

  return { kind: "annual" };
}

export const INOV_RECURRENCE_LABELS = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
  per_year: "Várias vezes por ano",
};

function ymdFromParts(year, month1to12, day) {
  const last = new Date(year, month1to12, 0).getDate();
  const d = Math.min(day, last);
  const m = String(month1to12).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${year}-${m}-${dd}`;
}

function addMonthsClamped(m0, delta) {
  let m = m0 - 1 + delta;
  const yoff = Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return { month: m + 1, yoff };
}

/**
 * Meses do trimestre em ciclo a partir do mês da data-base (4 datas por ano).
 */
function quarterMonthsFromBase(baseMonth) {
  const out = [];
  for (let k = 0; k < 4; k++) {
    const { month } = addMonthsClamped(baseMonth, k * 3);
    out.push(month);
  }
  return out;
}

function semiannualMonthsFromBase(baseMonth) {
  const out = [];
  for (let k = 0; k < 2; k++) {
    const { month } = addMonthsClamped(baseMonth, k * 6);
    out.push(month);
  }
  return out;
}

/**
 * Gera lista YYYY-MM-DD no intervalo [minYear,maxYear] conforme recorrência.
 * @param {InovRecurrenceKind} kind
 * @param {string} baseYmd
 * @param {number} minYear
 * @param {number} maxYear
 */
export function expandInovRecurrenceDates(kind, baseYmd, minYear, maxYear) {
  const p = parseYmd(baseYmd);
  if (!p) return [];

  const baseMonth = p.getMonth() + 1;
  const day = p.getDate();
  const out = [];
  const seen = new Set();

  const push = (y, m) => {
    const ymd = ymdFromParts(y, m, day);
    if (seen.has(ymd)) return;
    seen.add(ymd);
    out.push(ymd);
  };

  if (kind === "annual") {
    for (let y = minYear; y <= maxYear; y++) {
      push(y, baseMonth);
    }
    return out.sort();
  }

  if (kind === "monthly") {
    for (let y = minYear; y <= maxYear; y++) {
      for (let mo = 1; mo <= 12; mo++) {
        push(y, mo);
      }
    }
    return out.sort();
  }

  if (kind === "quarterly") {
    const cycle = quarterMonthsFromBase(baseMonth);
    for (let y = minYear; y <= maxYear; y++) {
      for (const mo of cycle) {
        push(y, mo);
      }
    }
    return out.sort();
  }

  if (kind === "semiannual") {
    const cycle = semiannualMonthsFromBase(baseMonth);
    for (let y = minYear; y <= maxYear; y++) {
      for (const mo of cycle) {
        push(y, mo);
      }
    }
    return out.sort();
  }

  return [];
}

/**
 * N ocorrências por ano civil (mesmo dia do mês da data-base), espaçadas ao longo dos 12 meses a partir do mês-base.
 * n=1 → anual; n=12 → mensal (equivalente a `monthly`).
 */
export function expandMonthsPerYearCount(n, baseYmd, minYear, maxYear) {
  const count = Number(n);
  if (!Number.isFinite(count) || count < 1 || count > 12) return [];
  if (count === 12) return expandInovRecurrenceDates("monthly", baseYmd, minYear, maxYear);
  if (count === 1) return expandInovRecurrenceDates("annual", baseYmd, minYear, maxYear);

  const p = parseYmd(baseYmd);
  if (!p) return [];

  const baseMonth = p.getMonth() + 1;
  const day = p.getDate();
  const out = [];
  const seen = new Set();

  const push = (y, m) => {
    const ymd = ymdFromParts(y, m, day);
    if (seen.has(ymd)) return;
    seen.add(ymd);
    out.push(ymd);
  };

  for (let y = minYear; y <= maxYear; y++) {
    for (let k = 0; k < count; k++) {
      const slot = Math.round((k * 12) / count);
      const mi = ((baseMonth - 1 + slot) % 12) + 1;
      push(y, mi);
    }
  }
  return out.sort();
}

/**
 * Gera datas a cada N meses a partir da data-base, dentro do intervalo [minYear, maxYear].
 * Ex.: n=2 → bimestral; n=3 → trimestral customizado.
 */
export function expandEveryNMonths(n, baseYmd, minYear, maxYear) {
  const step = Math.round(Number(n));
  if (!Number.isFinite(step) || step < 1) return [];
  if (step === 1) return expandInovRecurrenceDates("monthly", baseYmd, minYear, maxYear);

  const p = parseYmd(baseYmd);
  if (!p) return [];

  const day = p.getDate();
  const out = [];
  const seen = new Set();
  const minDate = `${minYear}-01-01`;
  const maxDate = `${maxYear}-12-31`;

  let year = p.getFullYear();
  let month = p.getMonth() + 1;
  let steps = 0;
  const MAX_STEPS = 500;

  while (steps < MAX_STEPS) {
    const ymd = ymdFromParts(year, month, day);
    if (ymd > maxDate) break;
    if (ymd >= minDate && !seen.has(ymd)) {
      seen.add(ymd);
      out.push(ymd);
    }
    const { month: nm, yoff } = addMonthsClamped(month, step);
    month = nm;
    year += yoff;
    steps++;
  }

  return out.sort();
}

/**
 * Gera datas a cada N dias a partir da data-base, dentro do intervalo [minYear, maxYear].
 * Ex.: n=45 → a cada 45 dias.
 */
export function expandEveryNDays(n, baseYmd, minYear, maxYear) {
  const step = Math.round(Number(n));
  if (!Number.isFinite(step) || step < 1) return [];

  const p = parseYmd(baseYmd);
  if (!p) return [];

  const out = [];
  const seen = new Set();
  const minDate = `${minYear}-01-01`;
  const maxDate = `${maxYear}-12-31`;

  const cur = new Date(p.getTime());
  const MAX_STEPS = 1500;
  let steps = 0;

  while (steps < MAX_STEPS) {
    const y = cur.getFullYear();
    const mo = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    const ymd = `${y}-${mo}-${d}`;
    if (ymd > maxDate) break;
    if (ymd >= minDate && !seen.has(ymd)) {
      seen.add(ymd);
      out.push(ymd);
    }
    cur.setDate(cur.getDate() + step);
    steps++;
  }

  return out.sort();
}
