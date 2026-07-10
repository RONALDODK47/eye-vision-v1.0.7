import { Calendar } from "@/components/ui/calendar";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { getReferenceYearBounds } from "@/lib/workspaceCalendarSettings";

/**
 * Calendário civil grande (mês/dias) para o INOV, com marcadores nos dias com prazo.
 */
export function InovLargeCalendar({
  theme,
  month,
  onMonthChange,
  selected,
  onSelect,
  modifiers,
  modifiersClassNames,
}) {
  const { minYear, maxYear } = getReferenceYearBounds();

  return (
    <Calendar
      mode="single"
      selected={selected}
      onSelect={onSelect}
      month={month}
      onMonthChange={onMonthChange}
      locale={ptBR}
      fromMonth={new Date(minYear, 0)}
      toMonth={new Date(maxYear, 11)}
      showOutsideDays
      className={cn(
        "rounded-xl border p-3 sm:p-5 w-full max-w-full mx-auto",
        theme === "dark" ? "border-gray-700 bg-gray-950/60" : "border-gray-200 bg-white shadow-sm"
      )}
      classNames={{
        months: "flex flex-col w-full",
        month: "w-full space-y-3",
        caption: "flex justify-center pt-1 relative items-center mb-1",
        caption_label: "text-base sm:text-lg font-semibold capitalize",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-9 w-9 bg-transparent p-0 opacity-80 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-0 sm:left-1",
        nav_button_next: "absolute right-0 sm:right-1",
        table: "w-full border-collapse",
        head_row: "flex w-full justify-between mt-2",
        head_cell:
          "text-muted-foreground rounded-md flex-1 text-center font-medium text-[11px] sm:text-xs uppercase tracking-wide",
        row: "flex w-full mt-1 justify-between",
        cell: cn(
          "relative flex-1 flex justify-center p-0.5 sm:p-1 text-center text-sm focus-within:relative focus-within:z-20",
          /* Sem fundo na célula: bg-accent gerava um quadrado cinza atrás do dia arredondado */
          "[&:has([aria-selected])]:bg-transparent"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 p-0 text-sm sm:text-base font-medium rounded-lg border-0 shadow-none outline-none aria-selected:opacity-100 focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        ),
        day_selected:
          "bg-indigo-600 text-white hover:bg-indigo-600 hover:text-white focus:bg-indigo-600 focus:text-white",
        /** Hoje sem caixa/contorno: inset-shadow parecia «borda» em dias sem tarefas no calendário */
        day_today: cn(
          "bg-transparent shadow-none ring-0 border-0 font-semibold",
          theme === "dark" ? "text-white" : "text-foreground"
        ),
        day_outside: "day-outside text-muted-foreground opacity-50",
        day_disabled: "text-muted-foreground opacity-40",
        day_hidden: "invisible",
      }}
      modifiers={modifiers}
      modifiersClassNames={modifiersClassNames}
    />
  );
}
