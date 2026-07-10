import extracted from "@/data/inovCalendarExtracted.json";
import { effectiveDeadlineYmd, toYmd } from "@/lib/brBusinessDays";
import { inferAreasFromInovRaw } from "@/lib/calendarInovArea";
import { inferInovGroupNumberFromTexts, splitInovWorkTextByArea } from "@/lib/calendarInovColumnLayout";
import {
  expandInovRecurrenceDates,
  expandMonthsPerYearCount,
  expandEveryNMonths,
  expandEveryNDays,
  inferInovRecurrence,
  ymdToCalendarMonthLabel,
} from "@/lib/calendarInovRecurrence";
import { getInovCalendarStartFirstOfMonthYmd } from "@/lib/workspaceCalendarSettings";

const SOURCE_SHEET_ORDER = {
  Janeiro: 0,
  Fevereiro: 1,
  Março: 2,
  Abril: 3,
  Maio: 4,
  Junho: 5,
  Julho: 6,
  Agosto: 7,
  Setembro: 8,
  Outubro: 9,
  Novembro: 10,
  Dezembro: 11,
};

/**
 * ID estável por ocorrência (aba + data emitida + posição na grelha). Não muda ao editar o texto.
 */
export function computeInovDeadlineId(sourceSheet, dueDate, task) {
  const t = task && typeof task === "object" ? task : {};
  const seq = Number(t.seq) || 0;
  const er = Number(t.excel_row) || 0;
  const gc = Number(t.grid_col) || 0;
  const str = `${String(sourceSheet || "")}|${String(dueDate || "").slice(0, 10)}|${seq}|${er}|${gc}`;
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return `inov_${(h >>> 0).toString(36)}`;
}

/**
 * Chave estável por célula na planilha (aba + posição), sem o ano — usada para aplicar o mesmo mês/dia em todas as ocorrências.
 */
export function computeInovTemplateKey(sourceSheet, task) {
  const t = task && typeof task === "object" ? task : {};
  const seq = Number(t.seq) || 0;
  const er = Number(t.excel_row) || 0;
  const gc = Number(t.grid_col) || 0;
  const str = `${String(sourceSheet || "")}|tpl|${seq}|${er}|${gc}`;
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return `inovtpl_${(h >>> 0).toString(36)}`;
}

function ymdFromParts(year, month1to12, day) {
  const last = new Date(year, month1to12, 0).getDate();
  const d = Math.min(day, last);
  const m = String(month1to12).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${year}-${m}-${dd}`;
}

/** Invalida cache em memória (ex.: após gravar overrides no Firestore). */
export function clearInovDeadlinesCache() {
  _cacheBucket = null;
  _cache = null;
}

let _cacheBucket = null;
let _cache = null;

function comparePlanilhaOrder(a, b) {
  const so =
    (SOURCE_SHEET_ORDER[a.sourceSheet] ?? 99) - (SOURCE_SHEET_ORDER[b.sourceSheet] ?? 99);
  if (so !== 0) return so;
  const as = a.planSeq ?? 0;
  const bs = b.planSeq ?? 0;
  if (as > 0 && bs > 0 && as !== bs) return as - bs;
  if (as > 0 && bs === 0) return -1;
  if (as === 0 && bs > 0) return 1;
  const er = (a.planExcelRow || 0) - (b.planExcelRow || 0);
  if (er !== 0) return er;
  const gc = (a.planGridCol || 0) - (b.planGridCol || 0);
  if (gc !== 0) return gc;
  return (
    a.effectiveDueDate.localeCompare(b.effectiveDueDate) || a.raw.localeCompare(b.raw)
  );
}

/**
 * @returns {{
 *   id: string,
 *   sourceSheet: string,
 *   calendarMonth: string,
 *   recurrence: 'monthly'|'quarterly'|'semiannual'|'annual',
 *   dueDate: string,
 *   effectiveDueDate: string,
 *   raw: string,
 *   areas: string[],
 *   planSeq: number,
 *   planExcelRow: number,
 *   planGridCol: number,
 *   planGridColLabel: string,
 *   planLayoutSidebar: string,
 *   templateKey: string,
 *   groupNumber: string | null
 * }[]}
 */
/**
 * @param {{
 *   occurrenceOverrides?: Record<string, { due_date?: string, raw?: string, layout_sidebar?: string }>,
 *   templateOverrides?: Record<string, { due_md?: string, raw?: string, layout_sidebar?: string, group_number?: string, recurrence_preset?: string, months_per_year?: number }>,
 *   customEntries?: Record<string, { due_date?: string, raw?: string, recurrence_preset?: 'auto'|'monthly'|'per_year', months_per_year?: number, group_number?: string }>,
 *   months?: unknown[],
 *   overrideGeneration?: string,
 * }} [options]
 * `templateOverrides`: mesmo dia/mês (MM-DD) em cada ano gerado; dia útil efetivo continua com feriados/fins de semana.
 * `overrideGeneration` deve mudar quando os overrides remotos mudam (ex.: `updated_at` do doc Firestore).
 */
function getGroupDays(groupNum, overrides) {
  const defaultDays = {
    "1": 30, // "Balancete mensal"
    "2": 40, // Default for Group 2: 40 days
    "3": 50, // Default for Group 3: 50 days
  };
  
  if (overrides && overrides["Gestão Contábil"] && Array.isArray(overrides["Gestão Contábil"].rows)) {
    const row = overrides["Gestão Contábil"].rows.find(r => String(r.c1).trim() === String(groupNum).trim());
    if (row && row.c3) {
      const match = String(row.c3).match(/\b(\d+)\s*dias\b/i);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
  }
  return defaultDays[groupNum] || null;
}

function calculateOccurrenceGroupDueDate(defaultYmd, days, rawText) {
  const parts = defaultYmd.split("-");
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  
  let refMonth = month - 1;
  let refYear = year;
  
  if (rawText) {
    const txt = String(rawText)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    const monthsPt = [
      "JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO",
      "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"
    ];
    for (let i = 0; i < 12; i++) {
      if (txt.includes(monthsPt[i])) {
        refMonth = i + 1;
        if (refMonth > month) {
          refYear = year - 1;
        } else {
          refYear = year;
        }
        break;
      }
    }
  }

  if (refMonth === 0) {
    refMonth = 12;
    refYear = year - 1;
  }
  
  const lastDay = new Date(refYear, refMonth, 0);
  const targetDate = new Date(lastDay.getTime());
  targetDate.setDate(targetDate.getDate() + days);
  
  const y = targetDate.getFullYear();
  const mo = String(targetDate.getMonth() + 1).padStart(2, "0");
  const d = String(targetDate.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

export function buildInovDeadlines(options = {}) {
  const cy = new Date().getFullYear();
  const minDueCut = getInovCalendarStartFirstOfMonthYmd();
  const occurrenceOverrides =
    options.occurrenceOverrides && typeof options.occurrenceOverrides === "object"
      ? options.occurrenceOverrides
      : {};
  const templateOverrides =
    options.templateOverrides && typeof options.templateOverrides === "object"
      ? options.templateOverrides
      : {};
  const customEntries =
    options.customEntries && typeof options.customEntries === "object"
      ? options.customEntries
      : {};
  const referenceTableOverrides =
    options.referenceTableOverrides && typeof options.referenceTableOverrides === "object"
      ? options.referenceTableOverrides
      : {};
  const months = Array.isArray(options.months) && options.months.length > 0 ? options.months : extracted?.months || [];
  const gen = String(options.overrideGeneration ?? "");
  const bucket = `${cy}-${minDueCut}-${gen}-${months.length}-${Object.keys(templateOverrides).length}-${JSON.stringify(templateOverrides).length}-${Object.keys(customEntries).length}-${JSON.stringify(customEntries).length}`;
  if (_cache && _cacheBucket === bucket) return _cache;

  /** Ano civil do sistema: só gera ocorrências no ano anterior (fechos) e no ano atual — evita 2027+ quando o PC está em 2026. */
  const minYear = cy - 1;
  const maxYear = cy;

  const out = [];
  const seen = new Set();
  /**
   * Pré-calcula quais (templateKey, displayDue) estão "reservadas" por um occurrence_override com due_date explícita.
   * Isso evita que a ocorrência natural desse mesmo templateKey na mesma data apareça duplicada.
   * templateKey → Set<overridden displayDue ymd>
   */
  const overriddenDisplayByTemplate = new Map();
  for (const [rowId, oc] of Object.entries(occurrenceOverrides)) {
    if (!oc || oc.hidden === true) continue;
    if (typeof oc.due_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(oc.due_date)) continue;
    for (const m of months) {
      for (const t of m.tasks || []) {
        const id = computeInovDeadlineId(m.sheet, String(t.date || "").slice(0, 10), t);
        if (id !== rowId) continue;
        const tk = computeInovTemplateKey(m.sheet, t);
        if (!overriddenDisplayByTemplate.has(tk)) overriddenDisplayByTemplate.set(tk, new Set());
        overriddenDisplayByTemplate.get(tk).add(oc.due_date);
      }
    }
  }
  /** templateKey → Set<displayDue ymd> — rastreia o que já foi emitido para evitar duplicatas */
  const seenDisplayByTemplate = new Map();

  for (const m of months) {
    const sourceSheet = m.sheet;
    for (const t of m.tasks || []) {
      const dueDateBase = String(t.date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateBase)) continue;
      const rawBase = String(t.raw || "").trim();
      if (!rawBase) continue;

      const planSeq = typeof t.seq === "number" ? t.seq : Number(t.seq) || 0;
      const planExcelRow = typeof t.excel_row === "number" ? t.excel_row : Number(t.excel_row) || 0;
      const planGridCol = typeof t.grid_col === "number" ? t.grid_col : Number(t.grid_col) || 0;
      const planGridColLabel = String(t.grid_col_label || "").trim();
      const planLayoutSidebarBase = String(t.layout_sidebar || "").trim();

      const templateKey = computeInovTemplateKey(sourceSheet, t);
      const tmEarly = templateOverrides[templateKey];
      const rawForKind = tmEarly && typeof tmEarly.raw === "string" ? tmEarly.raw : rawBase;
      const { kind } = inferInovRecurrence(rawForKind);

      let datesToEmit;
      const preset = tmEarly && String(tmEarly.recurrence_preset || "").trim();
      if (preset === "monthly") {
        datesToEmit = expandInovRecurrenceDates("monthly", dueDateBase, minYear, maxYear);
      } else if (preset === "per_year") {
        const n = Number(tmEarly.months_per_year);
        if (Number.isFinite(n) && n >= 1 && n <= 12) {
          datesToEmit = expandMonthsPerYearCount(n, dueDateBase, minYear, maxYear);
        } else {
          datesToEmit = expandInovRecurrenceDates(kind, dueDateBase, minYear, maxYear);
        }
      } else if (preset === "every_n_months") {
        const n = Number(tmEarly.interval_n);
        datesToEmit = Number.isFinite(n) && n >= 1
          ? expandEveryNMonths(n, dueDateBase, minYear, maxYear)
          : expandInovRecurrenceDates(kind, dueDateBase, minYear, maxYear);
      } else if (preset === "every_n_days") {
        const n = Number(tmEarly.interval_n);
        datesToEmit = Number.isFinite(n) && n >= 1
          ? expandEveryNDays(n, dueDateBase, minYear, maxYear)
          : expandInovRecurrenceDates(kind, dueDateBase, minYear, maxYear);
      } else {
        datesToEmit = expandInovRecurrenceDates(kind, dueDateBase, minYear, maxYear);
      }

      for (const dueDate of datesToEmit) {
        if (minDueCut && dueDate < minDueCut) continue;
        const yDue = Number(dueDate.slice(0, 4));
        if (yDue < minYear || yDue > maxYear) continue;
        const id = computeInovDeadlineId(sourceSheet, dueDate, t);
        if (seen.has(id)) continue;
        seen.add(id);

        const tm = templateOverrides[templateKey];
        const oc = occurrenceOverrides[id];
        if (oc && oc.hidden === true) continue;

        let rawStr = rawBase;
        if (oc && typeof oc.raw === "string") rawStr = oc.raw;
        else if (tm && typeof tm.raw === "string") rawStr = tm.raw;

        let planLayoutSidebarStr = planLayoutSidebarBase;
        if (oc && typeof oc.layout_sidebar === "string") planLayoutSidebarStr = oc.layout_sidebar;
        else if (tm && typeof tm.layout_sidebar === "string") planLayoutSidebarStr = tm.layout_sidebar;

        let groupNumber = inferInovGroupNumberFromTexts(planLayoutSidebarStr, rawStr);
        if (tm && typeof tm.group_number === "string" && tm.group_number.trim()) {
          groupNumber = tm.group_number.trim();
        } else if (oc && typeof oc.group_number === "string" && oc.group_number.trim()) {
          groupNumber = oc.group_number.trim();
        }

        let displayDue = dueDate;

        // Se tivermos regras de prazo para o grupo (Grupo 2 ou Grupo 3)
        if ((kind === "monthly" || kind === "annual") && (groupNumber === "2" || groupNumber === "3")) {
          const groupDays = getGroupDays(groupNumber, referenceTableOverrides);
          if (groupDays) {
            const calculatedDue = calculateOccurrenceGroupDueDate(dueDate, groupDays, rawStr);
            if (calculatedDue) {
              displayDue = calculatedDue;
            }
          }
        }

        const hasTemplateMd = tm && typeof tm.due_md === "string" && /^\d{2}-\d{2}$/.test(tm.due_md);
        if (hasTemplateMd) {
          const mm = Number(tm.due_md.slice(0, 2));
          const dd = Number(tm.due_md.slice(3, 5));
          if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
            displayDue = ymdFromParts(yDue, mm, dd);
          }
        } else if (oc && typeof oc.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(oc.due_date)) {
          displayDue = oc.due_date;
        }

        if (!seenDisplayByTemplate.has(templateKey)) seenDisplayByTemplate.set(templateKey, new Set());
        const seenDisplay = seenDisplayByTemplate.get(templateKey);
        if (seenDisplay.has(displayDue)) continue;
        const reservedByOtherOverride = !oc && overriddenDisplayByTemplate.get(templateKey)?.has(displayDue);
        if (reservedByOtherOverride) continue;
        seenDisplay.add(displayDue);

        const areasFinal = inferAreasFromInovRaw(rawStr);

        let recurrenceLabel = kind;
        if (preset === "monthly") recurrenceLabel = "monthly";
        else if (preset === "per_year") recurrenceLabel = "per_year";
        else if (preset === "every_n_months") recurrenceLabel = "every_n_months";
        else if (preset === "every_n_days") recurrenceLabel = "every_n_days";

        const recurrenceIntervalN =
          (preset === "every_n_months" || preset === "every_n_days") &&
          tmEarly && Number(tmEarly.interval_n) >= 1
            ? Number(tmEarly.interval_n)
            : null;

        out.push({
          id,
          templateKey,
          sourceSheet,
          calendarMonth: ymdToCalendarMonthLabel(displayDue),
          recurrence: recurrenceLabel,
          recurrencePreset: preset || "auto",
          recurrenceMonthsPerYear:
            preset === "per_year" &&
            tmEarly &&
            Number(tmEarly.months_per_year) >= 1 &&
            Number(tmEarly.months_per_year) <= 12
              ? Number(tmEarly.months_per_year)
              : null,
          recurrenceIntervalN,
          dueDate: displayDue,
          effectiveDueDate: effectiveDeadlineYmd(displayDue),
          raw: rawStr,
          areas: areasFinal,
          planSeq,
          planExcelRow,
          planGridCol,
          planGridColLabel,
          planLayoutSidebar: planLayoutSidebarStr,
          groupNumber,
        });
      }
    }
  }

  // Tarefas criadas manualmente na aba Calendário (persistidas em inov_calendar_data.live.custom_entries)
  for (const [entryId, entry] of Object.entries(customEntries)) {
    if (entry?.is_deleted === true) continue;
    const base = String(entry?.due_date || "").slice(0, 10);
    const raw = String(entry?.raw || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(base) || !raw) continue;
    const presetRaw = String(entry?.recurrence_preset || "").trim().toLowerCase();
    let datesToEmit = [];
    let recurrenceLabel = "auto";
    if (presetRaw === "monthly") {
      recurrenceLabel = "monthly";
      datesToEmit = expandInovRecurrenceDates("monthly", base, minYear, maxYear);
    } else if (presetRaw === "per_year") {
      const n = Number(entry?.months_per_year);
      if (Number.isFinite(n) && n >= 1 && n <= 12) {
        recurrenceLabel = "per_year";
        datesToEmit = expandMonthsPerYearCount(n, base, minYear, maxYear);
      } else {
        const { kind } = inferInovRecurrence(raw);
        recurrenceLabel = "auto";
        datesToEmit = expandInovRecurrenceDates(kind, base, minYear, maxYear);
      }
    } else if (presetRaw === "every_n_months") {
      const n = Number(entry?.interval_n);
      if (Number.isFinite(n) && n >= 1) {
        recurrenceLabel = "every_n_months";
        datesToEmit = expandEveryNMonths(n, base, minYear, maxYear);
      } else {
        recurrenceLabel = "auto";
        datesToEmit = expandInovRecurrenceDates(inferInovRecurrence(raw).kind, base, minYear, maxYear);
      }
    } else if (presetRaw === "every_n_days") {
      const n = Number(entry?.interval_n);
      if (Number.isFinite(n) && n >= 1) {
        recurrenceLabel = "every_n_days";
        datesToEmit = expandEveryNDays(n, base, minYear, maxYear);
      } else {
        recurrenceLabel = "auto";
        datesToEmit = expandInovRecurrenceDates(inferInovRecurrence(raw).kind, base, minYear, maxYear);
      }
    } else if (presetRaw === "none") {
      recurrenceLabel = "none";
      datesToEmit = [base];
    } else {
      const { kind } = inferInovRecurrence(raw);
      recurrenceLabel = "auto";
      datesToEmit = expandInovRecurrenceDates(kind, base, minYear, maxYear);
    }
    for (const dueDate of datesToEmit) {
      if (minDueCut && dueDate < minDueCut) continue;
      const yDue = Number(dueDate.slice(0, 4));
      if (yDue < minYear || yDue > maxYear) continue;
      const id = `inovcustom_${entryId}_${dueDate}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const groupNumber = String(entry?.group_number || "").trim() || null;
      const referenceMonth = String(entry?.reference_month || "").trim() || null;
      out.push({
        id,
        templateKey: `custom:${entryId}`,
        sourceSheet: "Gestão Contábil",
        calendarMonth: ymdToCalendarMonthLabel(dueDate),
        recurrence: recurrenceLabel === "auto" ? inferInovRecurrence(raw).kind : recurrenceLabel,
        recurrencePreset: recurrenceLabel,
        recurrenceMonthsPerYear:
          recurrenceLabel === "per_year" &&
          Number(entry?.months_per_year) >= 1 &&
          Number(entry?.months_per_year) <= 12
            ? Number(entry?.months_per_year)
            : null,
        recurrenceIntervalN:
          (recurrenceLabel === "every_n_months" || recurrenceLabel === "every_n_days") &&
          Number(entry?.interval_n) >= 1
            ? Number(entry?.interval_n)
            : null,
        dueDate,
        effectiveDueDate: effectiveDeadlineYmd(dueDate),
        raw,
        areas: inferAreasFromInovRaw(raw),
        planSeq: 999999,
        planExcelRow: 999999,
        planGridCol: 0,
        planGridColLabel: "",
        planLayoutSidebar: "",
        groupNumber,
        referenceMonth,
      });
    }
  }

  out.sort(comparePlanilhaOrder);
  _cache = out;
  _cacheBucket = bucket;
  return out;
}

/**
 * Ordenação só por data efetiva (útil na UI).
 */
export function sortInovDeadlinesByDate(rows) {
  return [...rows].sort(
    (a, b) =>
      a.effectiveDueDate.localeCompare(b.effectiveDueDate) || a.raw.localeCompare(b.raw)
  );
}

/**
 * Prazos para alerta no sininho: janela [hoje−2, hoje+14] em data efetiva (dia útil).
 * Exclui prazos que o utilizador já marcou como concluídos.
 * @param {string} userArea área concreta (contabil, fiscal, …). Se vazio ou `todas`, não há alertas até configurar.
 * @param {Set<string>|string[]|null} completedDeadlineIds ids `inov_*` concluídos por este utilizador
 */
export function filterInovDeadlinesForBell(all, userArea, completedDeadlineIds) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 2);
  const end = new Date(today);
  end.setDate(end.getDate() + 14);
  const startYmd = toYmd(start);
  const endYmd = toYmd(end);

  const done =
    completedDeadlineIds instanceof Set
      ? completedDeadlineIds
      : new Set(Array.isArray(completedDeadlineIds) ? completedDeadlineIds : []);

  if (!userArea) return [];

  if (userArea === "todas") {
    // No modo "todos", cada setor com texto real conta como um item do sininho.
    const expanded = [];
    for (const row of all) {
      if (done.has(row.id)) continue;
      const ed = row.effectiveDueDate;
      if (ed < startYmd || ed > endYmd) continue;
      const parts = splitInovWorkTextByArea(row.raw);
      const areas = ["contabil", "fiscal", "folha", "paralegal", "ti", "outros"];
      for (const areaId of areas) {
        const areaText = String(parts?.[areaId] || "").trim();
        if (!areaText) continue;
        expanded.push({
          ...row,
          id: `${row.id}:${areaId}`,
          originalDeadlineId: row.id,
          areaId,
          raw: areaText,
        });
      }
    }
    return expanded;
  }

  return all.filter((row) => {
    if (done.has(row.id)) return false;
    const ed = row.effectiveDueDate;
    if (ed < startYmd || ed > endYmd) return false;
    if (!Array.isArray(row.areas) || !row.areas.includes(userArea)) return false;
    // Evita "vazamento" de itens: só conta no sininho se houver texto real na área selecionada.
    const parts = splitInovWorkTextByArea(row.raw);
    const areaText = String(parts?.[userArea] || "").trim();
    return areaText.length > 0;
  });
}
