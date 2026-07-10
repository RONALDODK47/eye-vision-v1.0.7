import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTheme } from "./ThemeProvider";
import { cn } from "@/lib/utils";
import { clampReferenceMonthDate, getReferenceYearBounds } from "@/lib/workspaceCalendarSettings";

const MONTHS_PT = [
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

function capitalizeMonthYearPt(date) {
  const s = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * @param {boolean} [restrictToWorkspaceYearWindow] Se true (Empresas + Calendário INOV), só [ano−1 … ano atual].
 */
export default function MonthPicker({ date, onChange, restrictToWorkspaceYearWindow = false }) {
  const { theme } = useTheme();
  const { minYear, maxYear } = getReferenceYearBounds();

  const raw = date instanceof Date && !isNaN(date) ? date : new Date();
  const safeDate = restrictToWorkspaceYearWindow
    ? clampReferenceMonthDate(raw) ?? new Date(minYear, 0, 1)
    : raw;
  const month = safeDate.getMonth();
  const year = safeDate.getFullYear();

  const atMin = restrictToWorkspaceYearWindow && year <= minYear && month <= 0;
  const atMax = restrictToWorkspaceYearWindow && year >= maxYear && month >= 11;

  const yearOptions = useMemo(() => {
    if (restrictToWorkspaceYearWindow) {
      const out = [];
      for (let y = minYear; y <= maxYear; y++) out.push(y);
      return out;
    }
    const cy = new Date().getFullYear();
    const sy = safeDate.getFullYear();
    const lo = Math.min(sy, cy - 20);
    const hi = Math.max(sy, cy + 6);
    const out = [];
    for (let y = lo; y <= hi; y++) out.push(y);
    return out;
  }, [restrictToWorkspaceYearWindow, minYear, maxYear, safeDate]);

  const applyMonthYear = (nextYear, nextMonth) => {
    const picked = new Date(nextYear, nextMonth, 1);
    onChange(
      restrictToWorkspaceYearWindow ? clampReferenceMonthDate(picked) ?? picked : picked
    );
  };

  const handlePrev = () => {
    if (atMin) return;
    const newDate = new Date(year, month - 1, 1);
    onChange(
      restrictToWorkspaceYearWindow ? clampReferenceMonthDate(newDate) ?? newDate : newDate
    );
  };

  const handleNext = () => {
    if (atMax) return;
    const newDate = new Date(year, month + 1, 1);
    onChange(
      restrictToWorkspaceYearWindow ? clampReferenceMonthDate(newDate) ?? newDate : newDate
    );
  };

  const selectClass = cn(
    "h-9 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
    theme === "dark" ? "border-gray-700 bg-gray-950 text-foreground" : "border-input bg-background"
  );

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
        Mês e ano
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={handlePrev}
          className="h-10 w-10"
          type="button"
          title="Mês anterior"
          disabled={restrictToWorkspaceYearWindow && atMin}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              title="Abrir calendário de mês e ano"
              className={cn(
                "min-w-[220px] h-10 justify-between gap-2 px-4 font-medium tabular-nums",
                theme === "dark" ? "border-gray-800 bg-gray-900 hover:bg-gray-800" : "bg-white border-gray-200"
              )}
            >
              <span className="truncate">{capitalizeMonthYearPt(safeDate)}</span>
              <Calendar className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="center"
            className={cn(
              "w-auto p-3 z-50",
              theme === "dark" ? "border-gray-700 bg-gray-900 text-popover-foreground" : ""
            )}
          >
            <div className="space-y-3 min-w-[220px]">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Mês</Label>
                <select
                  aria-label="Mês"
                  className={selectClass}
                  value={month}
                  onChange={(e) => applyMonthYear(year, Number(e.target.value))}
                >
                  {MONTHS_PT.map((name, idx) => (
                    <option key={name} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Ano</Label>
                <select
                  aria-label="Ano"
                  className={selectClass}
                  value={year}
                  onChange={(e) => applyMonthYear(Number(e.target.value), month)}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="icon"
          onClick={handleNext}
          className="h-10 w-10"
          type="button"
          title="Próximo mês"
          disabled={restrictToWorkspaceYearWindow && atMax}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
