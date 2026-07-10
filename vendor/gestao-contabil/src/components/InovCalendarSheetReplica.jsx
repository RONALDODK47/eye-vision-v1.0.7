import React, { useMemo } from "react";
import extracted from "@/data/inovCalendarExtracted.json";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { inferAreasFromInovRaw } from "@/lib/calendarInovArea";
import { computeInovDeadlineId } from "@/lib/calendarInovData";
import { splitInovRawIntoBlocks } from "@/lib/calendarInovFormat";
import { CheckCircle2, RotateCcw } from "lucide-react";

const FALLBACK_WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function fmtBr(ymd) {
  if (!ymd) return "";
  const [y, m, d] = String(ymd).slice(0, 10).split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function monthEntryFor(sheetName) {
  const months = extracted?.months || [];
  return months.find((m) => m.sheet === sheetName) || null;
}

function taskMatchesArea(task, userArea) {
  if (!userArea || userArea === "todas") return true;
  return inferAreasFromInovRaw(task.raw || "").includes(userArea);
}

/**
 * Vista em grelha alinhada ao Excel: col. A estreita, B–H dias, lateral (J+).
 */
export default function InovCalendarSheetReplica({
  sheetName,
  userArea,
  completionMap,
  theme,
  busy,
  onCompleteOne,
  onReopen,
}) {
  const bands = useMemo(() => {
    const entry = monthEntryFor(sheetName);
    if (!entry) return { title: "", weekdays: FALLBACK_WEEKDAYS, rows: [] };

    const title = entry.sheet_title || `${entry.sheet} ${new Date().getFullYear()}`;
    const weekdays = Array.isArray(entry.weekday_labels) && entry.weekday_labels.length === 7
      ? entry.weekday_labels
      : FALLBACK_WEEKDAYS;

    const tasks = entry.tasks || [];
    const rowNums = [...new Set(tasks.map((t) => t.excel_row || 0).filter((n) => n > 0))].sort(
      (a, b) => a - b
    );

    const rows = [];
    for (const er of rowNums) {
      const rowTasks = tasks.filter((t) => t.excel_row === er);
      const lateralOnly = rowTasks.some((t) => !t.grid_col || Number(t.grid_col) === 0);

      if (lateralOnly) {
        const t0 = rowTasks.find((t) => !t.grid_col || Number(t.grid_col) === 0) || rowTasks[0];
        rows.push({
          kind: "lateral",
          excelRow: er,
          text: String(t0?.raw || "").trim(),
          sidebar: String(t0?.layout_sidebar || "").trim(),
        });
        continue;
      }

      const byCol = new Map();
      for (const t of rowTasks) {
        const c = Number(t.grid_col);
        if (c < 1 || c > 7) continue;
        if (!byCol.has(c)) byCol.set(c, []);
        byCol.get(c).push(t);
      }

      const dates = {};
      const sidebar = String(rowTasks[0]?.layout_sidebar || "").trim();
      for (let c = 1; c <= 7; c++) {
        const list = byCol.get(c) || [];
        dates[c] = list[0]?.date ? String(list[0].date).slice(0, 10) : "";
      }

      rows.push({ kind: "week", excelRow: er, dates, byCol, sidebar });
    }

    return { title, weekdays, rows };
  }, [sheetName]);

  if (!sheetName || bands.rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center border rounded-md bg-muted/20">
        Sem dados de grelha para este mês no JSON. Reimporte o Excel com{" "}
        <code className="text-[10px]">parse_calendario_inov.py</code>.
      </p>
    );
  }

  const isDark = theme === "dark";
  const border = isDark ? "border-slate-600" : "border-[#8EA9DB]";
  const titleBg = isDark ? "bg-[#1e3a5f]" : "bg-[#4472C4]";
  const wdBg = isDark ? "bg-slate-800" : "bg-[#D9E1F2]";
  const dateBg = isDark ? "bg-slate-900/80" : "bg-[#F2F2F2]";
  const cellBg = isDark ? "bg-slate-950/40" : "bg-white";

  return (
    <div
      className={cn(
        "rounded-sm overflow-x-auto border shadow-sm",
        isDark ? "border-slate-700 bg-slate-950" : "border-[#8EA9DB] bg-white"
      )}
    >
      <table
        className={cn(
          "w-full border-collapse text-[11px] leading-snug min-w-[920px]",
          isDark ? "text-slate-100" : "text-black"
        )}
        style={{ fontFamily: '"Calibri", "Segoe UI", system-ui, sans-serif' }}
      >
        <colgroup>
          <col className="w-3" />
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <col key={i} className="min-w-[108px] w-[13ch]" />
          ))}
          <col className="min-w-[240px] w-[28%]" />
        </colgroup>
        <thead>
          <tr>
            <td
              className={cn("border p-0", border, titleBg)}
              colSpan={9}
            >
              <div
                className={cn(
                  "text-center font-semibold tracking-tight py-2 px-2 text-sm",
                  "text-white"
                )}
              >
                {bands.title}
              </div>
            </td>
          </tr>
          <tr className={cn(wdBg)}>
            <th
              className={cn("border p-1.5 text-center font-semibold", border, isDark && "text-slate-200")}
            />
            {bands.weekdays.map((label, i) => (
              <th
                key={i}
                className={cn(
                  "border p-1.5 text-center font-semibold normal-case",
                  border,
                  isDark && "text-slate-200"
                )}
              >
                {label}
              </th>
            ))}
            <th
              className={cn(
                "border p-1.5 text-left font-semibold pl-2",
                border,
                isDark && "text-slate-200"
              )}
            >
              Rótulos (col. J+)
            </th>
          </tr>
        </thead>
        <tbody>
          {bands.rows.map((band, idx) => {
            if (band.kind === "lateral") {
              return (
                <tr
                  key={`lat-${band.excelRow}-${idx}`}
                  className={cn(isDark ? "bg-indigo-950/40" : "bg-indigo-50/90")}
                >
                  <td className={cn("border p-1", border)} />
                  <td
                    className={cn("border p-2 font-medium text-[11px]", border)}
                    colSpan={7}
                  >
                    {band.text}
                  </td>
                  <td
                    className={cn(
                      "border p-2 text-[11px] align-top",
                      border,
                      isDark ? "text-slate-300" : "text-gray-800"
                    )}
                  >
                    {band.sidebar}
                  </td>
                </tr>
              );
            }

            return (
              <React.Fragment key={`wk-${band.excelRow}-${idx}`}>
                <tr className={dateBg}>
                  <td className={cn("border p-0", border)} />
                  {[1, 2, 3, 4, 5, 6, 7].map((c) => (
                    <td
                      key={c}
                      className={cn(
                        "border p-1.5 text-center align-middle font-normal tabular-nums",
                        border,
                        isDark ? "text-slate-200" : "text-gray-900"
                      )}
                    >
                      {band.dates[c] ? fmtBr(band.dates[c]) : ""}
                    </td>
                  ))}
                  <td
                    rowSpan={2}
                    className={cn(
                      "border align-top p-2 text-[11px] leading-relaxed",
                      border,
                      cellBg,
                      isDark ? "text-slate-300" : "text-gray-800"
                    )}
                  >
                    {band.sidebar}
                  </td>
                </tr>
                <tr className={cellBg}>
                  <td className={cn("border p-0", border)} />
                  {[1, 2, 3, 4, 5, 6, 7].map((c) => {
                    const list = band.byCol.get(c) || [];
                    const visible = list.filter((t) => taskMatchesArea(t, userArea));
                    return (
                      <td
                        key={c}
                        className={cn(
                          "border align-top p-1.5 text-[11px] min-h-[48px]",
                          border,
                          visible.length === 0 && list.length > 0
                            ? isDark
                              ? "bg-slate-900/50 opacity-60"
                              : "bg-gray-100/80"
                            : ""
                        )}
                      >
                        {visible.map((t, ti) => {
                          const id = computeInovDeadlineId(sheetName, String(t.date).slice(0, 10), t);
                          const doneOn = completionMap.get(id);
                          const blocks = splitInovRawIntoBlocks(t.raw || "");
                          return (
                            <div
                              key={`${id}-${ti}`}
                              className={cn(
                                "mb-2 last:mb-0 rounded-sm p-1 -m-0.5",
                                doneOn &&
                                  (isDark
                                    ? "bg-emerald-950/45 ring-1 ring-emerald-800/50"
                                    : "bg-emerald-50 ring-1 ring-emerald-200/90")
                              )}
                            >
                              {blocks.map((block, bi) => (
                                <p
                                  key={bi}
                                  className={cn(
                                    "whitespace-pre-wrap break-words",
                                    bi > 0 && "mt-2 pt-2 border-t border-dashed opacity-90",
                                    isDark ? "border-slate-700" : "border-gray-200"
                                  )}
                                >
                                  {block}
                                </p>
                              ))}
                              <div className="mt-1.5 flex flex-wrap justify-end gap-1">
                                {doneOn ? (
                                  <>
                                    <span
                                      className={cn(
                                        "text-[10px] font-semibold tabular-nums mr-auto self-center",
                                        isDark ? "text-emerald-400" : "text-emerald-700"
                                      )}
                                    >
                                      ✓ {fmtBr(doneOn)}
                                    </span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-1.5 text-[10px]"
                                      disabled={busy}
                                      onClick={() => {
                                        if (
                                          window.confirm(
                                            "Reabrir esta tarefa? Voltará a poder aparecer no sininho."
                                          )
                                        ) {
                                          onReopen(id);
                                        }
                                      }}
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-6 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-700"
                                    disabled={busy}
                                    onClick={() => onCompleteOne(id)}
                                  >
                                    <CheckCircle2 className="w-3 h-3 mr-0.5" />
                                    Concluir
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
