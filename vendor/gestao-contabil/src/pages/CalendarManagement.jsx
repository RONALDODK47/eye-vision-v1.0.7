import React, { useMemo, useState, useEffect } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/lib/AuthContext";
import { useCloudAccess } from "@/lib/useCloudAccess";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dbClient } from "@/api/dbClient";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  Bell,
  CheckCircle2,
  RotateCcw,
  ListChecks,
  Pencil,
  Trash2,
  MessageSquareText,
  Settings2,
} from "lucide-react";
import {
  buildInovDeadlines,
  clearInovDeadlinesCache,
} from "@/lib/calendarInovData";
import MonthPicker from "@/components/MonthPicker";
import DatePicker from "@/components/DatePicker";
import {
  getReferenceMonthAsDate,
  setReferenceMonthFromDate,
  getInovCalendarStartYmd,
  setInovCalendarStartYmd,
  useWorkspaceCalendarSync,
} from "@/lib/workspaceCalendarSettings";
import { INOV_AREA_IDS, INOV_AREA_LABELS } from "@/lib/calendarInovArea";
import {
  getInovUserArea,
  setInovUserArea,
  INOV_AREA_STORAGE_KEY,
} from "@/lib/calendarInovStorage";
import { isBusinessDay, parseYmd, toYmd } from "@/lib/brBusinessDays";
import { mergeInovWorkTextFromAreas, splitInovWorkTextByArea } from "@/lib/calendarInovColumnLayout";
import { useInovCalendarAccess } from "@/lib/useInovCalendarAccess";
import { INOV_REFERENCE_SECTIONS, INOV_REFERENCE_TABLES_NOTE } from "@/data/inovReferenceTables";
import { InovLargeCalendar } from "@/components/InovLargeCalendar";
import {
  GestaoPageHeader,
  GestaoPanel,
  GestaoRestrictedPanel,
} from "@/components/GestaoEyeVisionChrome";

function fmtBr(ymd) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function todayYmd() {
  return toYmd(new Date());
}

function buildRawFromSingleArea(areaKey, text) {
  const areas = {
    contabil: "",
    fiscal: "",
    folha: "",
    ti: "",
    paralegal: "",
    outros: "",
  };
  const k = INOV_AREA_IDS.includes(areaKey) ? areaKey : "outros";
  areas[k] = String(text || "").trim();
  return mergeInovWorkTextFromAreas("", areas);
}

function makeCustomTaskDraft() {
  return {
    localId: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    recurrencePreset: "auto",
    monthsPerYear: "4",
    intervalN: "2",
    groupNumber: "",
    referenceMonth: "",
    description: "",
  };
}

/** Botões «Recados por setor» → secções da referência INOV (col. K–M). */
const INOV_RECADO_BY_SECTOR = [
  { sectorKey: "contabil", label: "Contábil", sectionTitles: ["Gestão Contábil"] },
  { sectorKey: "folha", label: "Folha / DP", sectionTitles: ["Gestão Pessoal"] },
  {
    sectorKey: "paralegal",
    label: "Paralegal",
    sectionTitles: ["Paralegal — abertura de empresas e alterações", "Paralegal — processo de baixa"],
  },
  {
    sectorKey: "fiscal",
    label: "Fiscal",
    sectionTitles: ["Fiscal — obrigações e prazos"],
  },
  {
    sectorKey: "ti",
    label: "TI / Projetos",
    sectionTitles: [],
    emptyHint: "Sem tabela de grupos fixa nesta referência; alinhe com a planilha INOV e cronogramas internos.",
  },
  {
    sectorKey: "outros",
    label: "Outros",
    sectionTitles: [],
    emptyHint: "Consulte a planilha CALENDARIO INOV para critérios que não entram nos quadros standard.",
  },
];

function InovAreaCell({ text, theme }) {
  if (!text?.trim()) {
    return <span className="text-muted-foreground text-[11px]">—</span>;
  }
  return (
    <p
      className={cn(
        "text-[11px] leading-snug whitespace-pre-wrap break-words min-w-[88px] max-w-[260px]",
        theme === "dark" ? "text-gray-200" : "text-gray-800"
      )}
    >
      {text}
    </p>
  );
}

function RecurrenceSelector({ value, onChange, monthsPerYear, onMonthsPerYearChange, intervalN, onIntervalNChange, theme }) {
  return (
    <div className="space-y-1">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={cn("text-xs", theme === "dark" ? "bg-gray-950 border-gray-700" : "")}>
          <SelectValue placeholder="Recorrência" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">Automática (pelo texto)</SelectItem>
          <SelectItem value="monthly">Todo mês</SelectItem>
          <SelectItem value="per_year">Várias vezes por ano</SelectItem>
          <SelectItem value="every_n_months">A cada N meses</SelectItem>
          <SelectItem value="every_n_days">A cada N dias</SelectItem>
        </SelectContent>
      </Select>
      {value === "per_year" ? (
        <Input type="number" min={1} max={12} step={1} value={monthsPerYear}
          onChange={(e) => onMonthsPerYearChange(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
          placeholder="Vezes/ano (1-12)"
          className={cn("max-w-[140px] text-xs", theme === "dark" ? "bg-gray-950 border-gray-700" : "")} />
      ) : null}
      {(value === "every_n_months" || value === "every_n_days") ? (
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={intervalN}
          onChange={(e) => onIntervalNChange(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
          placeholder={value === "every_n_months" ? "Ex.: 2 (meses)" : "Ex.: 45 (dias)"}
          className={cn("max-w-[140px] text-xs", theme === "dark" ? "bg-gray-950 border-gray-700" : "")} />
      ) : null}
    </div>
  );
}

function makeAreaRecDraft(rp, mpy, n) {
  return { recurrencePreset: rp || "auto", monthsPerYear: mpy || "4", intervalN: n || "2" };
}

function InovCalendarRowEditDialog({ row, open, onOpenChange, theme, onSaveAsync, saving, canPersistRowEdits, focusArea }) {
  const [due, setDue] = useState("");
  const [groupEdit, setGroupEdit] = useState("");
  const [areas, setAreas] = useState({ contabil: "", fiscal: "", folha: "", ti: "", paralegal: "", outros: "" });
  const [areaRec, setAreaRec] = useState({});

  useEffect(() => {
    if (!row || !open) return;
    setDue(row.dueDate);
    setAreas({ ...splitInovWorkTextByArea(row.raw) });
    const rp = row.recurrencePreset;
    const safeRp = (rp === "monthly" || rp === "per_year" || rp === "every_n_months" || rp === "every_n_days") ? rp : "auto";
    const safeMpy = row.recurrenceMonthsPerYear != null && Number(row.recurrenceMonthsPerYear) >= 1 ? String(row.recurrenceMonthsPerYear) : "4";
    const safeN = row.recurrenceIntervalN != null ? String(row.recurrenceIntervalN) : "2";
    const rec = makeAreaRecDraft(safeRp, safeMpy, safeN);
    const initRec = {};
    for (const aid of INOV_AREA_IDS) initRec[aid] = { ...rec };
    setAreaRec(initRec);
    setGroupEdit(row.groupNumber != null && String(row.groupNumber).trim() !== "" ? String(row.groupNumber).trim() : "");
  }, [row?.id, row?.dueDate, row?.raw, row?.groupNumber, row?.recurrencePreset, row?.recurrenceMonthsPerYear, row?.recurrenceIntervalN, open]);

  if (!row) return null;

  const patchArea = (key, value) => setAreas((prev) => ({ ...prev, [key]: value }));
  const patchRec = (aid, field, value) => setAreaRec((prev) => ({ ...prev, [aid]: { ...(prev[aid] || {}), [field]: value } }));

  const visibleAreas = focusArea && focusArea !== "todas"
    ? INOV_AREA_IDS.filter((aid) => aid === focusArea)
    : INOV_AREA_IDS.filter((aid) => String(areas[aid] || "").trim() !== "");
  const showAreas = visibleAreas.length > 0 ? visibleAreas : INOV_AREA_IDS;

  const isCustomRow = String(row.id || "").startsWith("inovcustom_");
  const handleSave = async () => {
    if (!canPersistRowEdits) return;
    try {
      if (isCustomRow) {
        const entryId = String(row.templateKey || "").replace("custom:", "");
        const aid = focusArea && focusArea !== "todas" ? focusArea : (showAreas[0] || "contabil");
        const text = String(areas[aid] || "").trim();
        if (!text) { window.alert("A descrição não pode estar vazia."); return; }
        const rec = areaRec[aid] || makeAreaRecDraft();
        const rawForArea = buildRawFromSingleArea(aid, text);
        await onSaveAsync({
          rowId: row.id,
          updateCustomEntry: {
            entryId,
            raw: rawForArea,
            due_date: due,
            recurrencePreset: rec.recurrencePreset,
            monthsPerYear: Math.min(12, Math.max(1, Math.round(Number(rec.monthsPerYear) || 4))),
            intervalN: Math.max(1, Math.round(Number(rec.intervalN) || 2)),
            group_number: groupEdit.trim(),
            reference_month: row.referenceMonth ?? null,
          },
        });
      } else {
        const aid = focusArea && focusArea !== "todas" ? focusArea : null;
        const newRaw = aid
          ? mergeInovWorkTextFromAreas(row.raw, { ...splitInovWorkTextByArea(row.raw), [aid]: String(areas[aid] || "") })
          : mergeInovWorkTextFromAreas(row.raw, areas);
        const recAid = aid || showAreas[0];
        const rec = (recAid && areaRec[recAid]) || makeAreaRecDraft();
        const nMonths = Math.min(12, Math.max(1, Math.round(Number(rec.monthsPerYear) || 4)));
        await onSaveAsync({
          rowId: row.id,
          templateKey: row.templateKey,
          patch: {
            due_date: due,
            raw: newRaw,
            group_number: groupEdit.trim(),
            recurrence_preset: rec.recurrencePreset,
            months_per_year: rec.recurrencePreset === "per_year" ? nMonths : null,
            interval_n: (rec.recurrencePreset === "every_n_months" || rec.recurrencePreset === "every_n_days") ? Math.max(1, Math.round(Number(rec.intervalN) || 2)) : null,
          },
        });
      }
      onOpenChange(false);
    } catch { /* onSaveAsync já alerta */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className={cn("max-w-lg max-h-[min(90vh,720px)] overflow-y-auto", theme === "dark" ? "border-gray-700 bg-gray-900" : "")}>
        <DialogHeader>
          <DialogTitle>
            Editar{focusArea && focusArea !== "todas" ? ` — ${INOV_AREA_LABELS[focusArea] || focusArea}` : ""}
          </DialogTitle>
        </DialogHeader>
        {!canPersistRowEdits ? (
          <p className="text-sm text-amber-700 dark:text-amber-300 rounded-md border border-amber-600/40 bg-amber-950/30 p-2">
            Só o <strong>proprietário</strong> pode gravar.
          </p>
        ) : null}
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Data</Label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value.slice(0, 10))} className="max-w-[200px]" />
          </div>
          <div className="space-y-1">
            <Label>Grupo</Label>
            <Input value={groupEdit} onChange={(e) => setGroupEdit(e.target.value)} placeholder="Ex.: 1" maxLength={32}
              className={cn("max-w-[200px]", theme === "dark" ? "bg-gray-950 border-gray-700" : "")} />
          </div>
          {showAreas.map((aid) => (
            <div key={aid} className={cn("rounded-md border p-3 space-y-2", theme === "dark" ? "border-gray-700 bg-gray-950/40" : "border-gray-200 bg-gray-50/50")}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{INOV_AREA_LABELS[aid] || aid}</p>
              <Textarea
                value={aid === "outros" ? areas.outros : areas[aid]}
                onChange={(e) => patchArea(aid, e.target.value)}
                rows={2}
                className={theme === "dark" ? "bg-gray-950 border-gray-700" : ""}
              />
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground font-normal">Recorrência</Label>
                <RecurrenceSelector
                  theme={theme}
                  value={(areaRec[aid] || makeAreaRecDraft()).recurrencePreset}
                  onChange={(v) => patchRec(aid, "recurrencePreset", v)}
                  monthsPerYear={(areaRec[aid] || makeAreaRecDraft()).monthsPerYear}
                  onMonthsPerYearChange={(v) => patchRec(aid, "monthsPerYear", v)}
                  intervalN={(areaRec[aid] || makeAreaRecDraft()).intervalN}
                  onIntervalNChange={(v) => patchRec(aid, "intervalN", v)}
                />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button type="button" className="bg-indigo-600 hover:bg-indigo-700" onClick={handleSave} disabled={saving || !canPersistRowEdits}>
            {saving ? "A gravar…" : "Gravar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InovCalendarTableRow({
  row,
  theme,
  visibleAreaColumns,
  canEdit,
  completionMap,
  busy,
  openCompleteOne,
  removeCompletionMut,
  onOpenEditDialog,
  onDeleteCustomEntry,
  showReferenceMonth,
}) {
  const isCustomRow = String(row.id || "").startsWith("inovcustom_");
  const cells = useMemo(() => splitInovWorkTextByArea(row.raw), [row.raw]);
  const doneOn = completionMap.get(row.id);
  const isDone = !!doneOn;
  const groupNumber =
    row.groupNumber != null && String(row.groupNumber).trim() !== ""
      ? String(row.groupNumber).trim()
      : null;

  const cellClass = cn(
    "border-t align-top",
    theme === "dark" ? "border-gray-800" : "border-gray-200",
    isDone &&
      (theme === "dark"
        ? "bg-emerald-950/35 border-emerald-900/40"
        : "bg-emerald-50/90 border-emerald-200/80")
  );

  return (
      <tr className={cellClass}>
        <td
          className={cn(
            "p-2 align-middle text-center min-w-[96px] w-[96px] max-w-[96px] border-x sticky left-0 z-20 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.25)]",
            theme === "dark" ? "border-slate-600/80 bg-slate-900" : "border-slate-300 bg-slate-100",
            isDone && (theme === "dark" ? "bg-emerald-950/85 border-emerald-800/40" : "bg-emerald-100/90 border-emerald-200/80")
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-9 min-w-[72px] px-2 font-semibold text-lg leading-none tracking-widest",
                  theme === "dark" ? "text-slate-100 hover:bg-slate-800 hover:text-white" : "text-slate-700 hover:bg-slate-200/90"
                )}
                aria-label="Opções da linha"
              >
                <span aria-hidden>⋯</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className={cn("min-w-[11rem]", theme === "dark" ? "border-gray-700 bg-gray-900 text-gray-100" : "")}
            >
              {canEdit ? (
                <>
                  <DropdownMenuItem className="cursor-pointer" onSelect={() => onOpenEditDialog(row)}>
                    <Pencil className="mr-2 h-4 w-4 shrink-0" />
                    Editar
                  </DropdownMenuItem>
                  {onDeleteCustomEntry ? (
                    <DropdownMenuItem
                      className="cursor-pointer text-red-600 focus:text-red-600"
                      onSelect={() => onDeleteCustomEntry(row.id, row.templateKey, isCustomRow, row.raw, row.dueDate, row.groupNumber)}
                    >
                      <Trash2 className="mr-2 h-4 w-4 shrink-0" />
                      Excluir tarefa
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator className={theme === "dark" ? "bg-gray-700" : ""} />
                </>
              ) : null}
              {isDone ? (
                <DropdownMenuItem
                  className="cursor-pointer"
                  disabled={removeCompletionMut.isPending}
                  onSelect={() => removeCompletionMut.mutate(row.id)}
                >
                  <RotateCcw className="mr-2 h-4 w-4 shrink-0" />
                  Reabrir
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="cursor-pointer" disabled={busy} onSelect={() => openCompleteOne(row.id)}>
                  <CheckCircle2 className="mr-2 h-4 w-4 shrink-0" />
                  Concluir
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
        <td
          className={cn(
            "p-2 align-top min-w-[140px] max-w-[140px] w-[140px] sticky left-[96px] z-20 border-r shadow-[4px_0_8px_-4px_rgba(0,0,0,0.2)]",
            theme === "dark" ? "bg-gray-900/98 border-gray-700" : "bg-white/98 border-gray-200",
            isDone && (theme === "dark" ? "bg-emerald-950/90 border-emerald-900/50" : "bg-emerald-50/95 border-emerald-200/80")
          )}
        >
          <div className="whitespace-nowrap tabular-nums text-sm">
            {fmtBr(row.dueDate)}
            {!isBusinessDay(parseYmd(row.dueDate)) && (
              <span className="block text-[10px] text-amber-600 dark:text-amber-400">não útil</span>
            )}
          </div>
        </td>
        <td
          className={cn(
            "p-2 whitespace-nowrap tabular-nums font-semibold align-top min-w-[132px] max-w-[132px] w-[132px] sticky left-[236px] z-20 border-r shadow-[4px_0_8px_-4px_rgba(0,0,0,0.2)]",
            theme === "dark" ? "bg-gray-900/98 border-gray-700" : "bg-white/98 border-gray-200",
            isDone && (theme === "dark" ? "bg-emerald-950/90 border-emerald-900/50" : "bg-emerald-50/95 border-emerald-200/80")
          )}
        >
          {fmtBr(row.effectiveDueDate)}
          {row.dueDate !== row.effectiveDueDate && (
            <span className="block text-[10px] font-normal text-sky-600 dark:text-sky-400">ajustado</span>
          )}
        </td>
        {visibleAreaColumns.map((aid, ai) => (
          <td
            key={aid}
            className={cn("p-2 align-top", ai === 0 && "border-l border-gray-200/30 dark:border-gray-700/40")}
          >
            <InovAreaCell text={aid === "outros" ? cells.outros : cells[aid]} theme={theme} />
          </td>
        ))}
        {showReferenceMonth ? (
          <td className="p-2 align-top whitespace-nowrap min-w-[120px]">
            {row.referenceMonth ? (
              <span className={cn(
                "inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded",
                theme === "dark" ? "bg-indigo-900/60 text-indigo-200" : "bg-indigo-100 text-indigo-800"
              )}>
                {row.referenceMonth}
              </span>
            ) : (
              <span className="text-muted-foreground text-xs">—</span>
            )}
          </td>
        ) : null}
        <td className="p-2 align-top text-center tabular-nums whitespace-nowrap min-w-[72px]">
          <span className={cn(
            "text-sm font-medium",
            groupNumber ? (theme === "dark" ? "text-gray-200" : "text-gray-800") : "text-muted-foreground"
          )}>
            {groupNumber ?? "—"}
          </span>
        </td>
        <td className="p-2 whitespace-nowrap tabular-nums align-top">
          {isDone ? (
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">{fmtBr(doneOn)}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      </tr>
  );
}

export default function CalendarManagement() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { tabAccess, isAdminEmail, hasOfficeCalendarAccess, currentCompanyId } = useCloudAccess();
  const uid = user?.uid;
  const queryClient = useQueryClient();
  const { canEditCalendarRows } = useInovCalendarAccess();

  const [userArea, setUserArea] = useState(() => getInovUserArea());
  const workspaceCalendarSync = useWorkspaceCalendarSync();
  const [inovTasksStartYmd, setInovTasksStartYmd] = useState(() => getInovCalendarStartYmd());

  const [calendarMoreOpen, setCalendarMoreOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeBulk, setCompleteBulk] = useState(false);
  const [completeDeadlineId, setCompleteDeadlineId] = useState("");
  const [completeDate, setCompleteDate] = useState(todayYmd);
  const [editRow, setEditRow] = useState(null);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(undefined);
  const [dayTasksDialogOpen, setDayTasksDialogOpen] = useState(false);
  const [recadosDialog, setRecadosDialog] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [customTaskDialogOpen, setCustomTaskDialogOpen] = useState(false);
  const [customTaskForm, setCustomTaskForm] = useState({
    dueDate: todayYmd(),
    area: "contabil",
    tasks: [makeCustomTaskDraft()],
  });
  const [editingRecados, setEditingRecados] = useState(false);
  const [recadosDraftSections, setRecadosDraftSections] = useState([]);

  const referenceMonthDate = useMemo(() => {
    const d = getReferenceMonthAsDate();
    return d && !Number.isNaN(d.getTime()) ? d : new Date();
  }, [workspaceCalendarSync]);

  const calendarMonthStart = useMemo(
    () => new Date(referenceMonthDate.getFullYear(), referenceMonthDate.getMonth(), 1),
    [referenceMonthDate]
  );

  const refMonthNavKey = `${referenceMonthDate.getFullYear()}-${referenceMonthDate.getMonth()}`;
  useEffect(() => {
    setSelectedCalendarDay(undefined);
    setDayTasksDialogOpen(false);
  }, [refMonthNavKey]);

  useEffect(() => {
    const sync = () => setUserArea(getInovUserArea());
    window.addEventListener("storage", sync);
    window.addEventListener("inov-calendar-area", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("inov-calendar-area", sync);
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      setInovTasksStartYmd(getInovCalendarStartYmd());
    };
    window.addEventListener("gc-workspace-calendar", sync);
    return () => window.removeEventListener("gc-workspace-calendar", sync);
  }, []);

  const { data: completions = [] } = useQuery({
    queryKey: ["calendarInovCompletions", uid, currentCompanyId],
    queryFn: () => {
      if (currentCompanyId) {
        return dbClient.entities.CalendarInovCompletion.listByCompanyId(currentCompanyId);
      }
      return uid ? dbClient.entities.CalendarInovCompletion.listByUid(uid) : [];
    },
    enabled: !!uid && Boolean(hasOfficeCalendarAccess),
    retry: false,
  });

  const completionMap = useMemo(() => {
    if (!hasOfficeCalendarAccess) return new Map();
    const m = new Map();
    completions.forEach((c) => {
      if (c.deadline_id) m.set(c.deadline_id, c.completed_on);
    });
    return m;
  }, [completions, hasOfficeCalendarAccess]);

  const { data: liveSnap } = useQuery({
    queryKey: ["inovCalendarLiveSnapshot", currentCompanyId],
    queryFn: () => currentCompanyId ? dbClient.entities.InovCalendarSnapshot.getByCompanyId(currentCompanyId) : dbClient.entities.InovCalendarSnapshot.getLive(),
    staleTime: 0,
    retry: false,
    enabled: Boolean(hasOfficeCalendarAccess),
  });
  const occurrenceOverrides =
    liveSnap?.occurrence_overrides && typeof liveSnap.occurrence_overrides === "object"
      ? liveSnap.occurrence_overrides
      : {};
  const templateOverrides =
    liveSnap?.template_overrides && typeof liveSnap.template_overrides === "object"
      ? liveSnap.template_overrides
      : {};
  const customEntries =
    liveSnap?.custom_entries && typeof liveSnap.custom_entries === "object"
      ? liveSnap.custom_entries
      : {};
  const referenceTableOverrides =
    liveSnap?.reference_table_overrides && typeof liveSnap.reference_table_overrides === "object"
      ? liveSnap.reference_table_overrides
      : {};
  const overrideGeneration = liveSnap?.updated_at || "";

  const all = useMemo(
    () => {
      if (!hasOfficeCalendarAccess) return [];
      return buildInovDeadlines({
        occurrenceOverrides,
        templateOverrides,
        customEntries,
        referenceTableOverrides,
        overrideGeneration,
      });
    },
    [workspaceCalendarSync, overrideGeneration, occurrenceOverrides, templateOverrides, customEntries, referenceTableOverrides, hasOfficeCalendarAccess]
  );

  const saveRowMut = useMutation({
    mutationFn: async ({ rowId, patch, templateKey, updateCustomEntry }) => {
      if (updateCustomEntry) {
        await dbClient.entities.InovCalendarSnapshot.upsertCustomEntry(uid, updateCustomEntry.entryId, {
          due_date: updateCustomEntry.due_date,
          raw: updateCustomEntry.raw,
          recurrence_preset: updateCustomEntry.recurrencePreset,
          months_per_year: updateCustomEntry.recurrencePreset === "per_year" ? updateCustomEntry.monthsPerYear : null,
          interval_n: (updateCustomEntry.recurrencePreset === "every_n_months" || updateCustomEntry.recurrencePreset === "every_n_days") ? updateCustomEntry.intervalN : null,
          group_number: updateCustomEntry.group_number,
          reference_month: updateCustomEntry.reference_month ?? null,
        }, currentCompanyId);
        return;
      }
      await dbClient.entities.InovCalendarSnapshot.mergeOccurrenceOverride(uid, rowId, patch, {
        templateKey: templateKey || "",
        companyId: currentCompanyId,
      });
    },
    onSuccess: () => {
      clearInovDeadlinesCache();
      queryClient.invalidateQueries({ queryKey: ["inovCalendarLiveSnapshot"] });
    },
    onError: (e) => window.alert(e?.message || "Não foi possível gravar a linha."),
  });

  const deleteCustomEntryMut = useMutation({
    mutationFn: async ({ rowId, templateKey, isCustom, raw, dueDate, groupNumber }) => {
      if (isCustom) {
        const entryId = String(templateKey || "").replace("custom:", "");
        await dbClient.entities.InovCalendarSnapshot.deleteCustomEntry(uid, entryId, currentCompanyId);
      } else {
        await dbClient.entities.InovCalendarSnapshot.mergeOccurrenceOverride(uid, rowId, {
          hidden: true,
          raw: raw || "",
          due_date: dueDate || "",
          group_number: groupNumber || "",
        }, {
          companyId: currentCompanyId,
        });
        const orphans = Object.entries(customEntries).filter(([, e]) => e?.origin_row_id === rowId);
        for (const [eid] of orphans) {
          await dbClient.entities.InovCalendarSnapshot.deleteCustomEntry(uid, eid, currentCompanyId);
        }
      }
    },
    onSuccess: () => {
      clearInovDeadlinesCache();
      queryClient.invalidateQueries({ queryKey: ["inovCalendarLiveSnapshot"] });
    },
    onError: (e) => window.alert(e?.message || "Não foi possível excluir a tarefa."),
  });

  const saveCustomTaskMut = useMutation({
    mutationFn: async ({ dueDate, area, tasks }) => {
      for (const task of tasks) {
        const raw = buildRawFromSingleArea(area, task.description);
        const entryId = `manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        await dbClient.entities.InovCalendarSnapshot.upsertCustomEntry(uid, entryId, {
          due_date: dueDate,
          recurrence_preset: task.recurrencePreset,
          months_per_year: task.recurrencePreset === "per_year" ? Number(task.monthsPerYear) : null,
          interval_n: (task.recurrencePreset === "every_n_months" || task.recurrencePreset === "every_n_days") ? Number(task.intervalN) : null,
          group_number: task.groupNumber,
          reference_month: task.referenceMonth || null,
          raw,
        }, currentCompanyId);
      }
    },
    onSuccess: () => {
      clearInovDeadlinesCache();
      queryClient.invalidateQueries({ queryKey: ["inovCalendarLiveSnapshot"] });
      setCustomTaskDialogOpen(false);
      setDayTasksDialogOpen(true);
    },
    onError: (e) => window.alert(e?.message || "Não foi possível salvar a tarefa manual."),
  });

  const saveRecadosMut = useMutation({
    mutationFn: async ({ sections }) => {
      for (const sec of sections) {
        await dbClient.entities.InovCalendarSnapshot.upsertReferenceSection(uid, sec.sectionTitle, sec.rows, currentCompanyId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inovCalendarLiveSnapshot"] });
      setEditingRecados(false);
    },
    onError: (e) => window.alert(e?.message || "Não foi possível salvar os recados."),
  });

  const saveCompletionMut = useMutation({
    mutationFn: async ({ deadlineId, completedOn }) => {
      await dbClient.entities.CalendarInovCompletion.set(uid, deadlineId, completedOn);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendarInovCompletions", uid] });
      setCompleteOpen(false);
    },
    onError: (e) => {
      window.alert(e?.message || "Não foi possível gravar a conclusão. Verifique o Firestore (regras deploy).");
    },
  });

  const bulkCompleteMut = useMutation({
    mutationFn: async ({ rows, completedOn }) => {
      for (const r of rows) {
        await dbClient.entities.CalendarInovCompletion.set(uid, r.id, completedOn);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendarInovCompletions", uid] });
      setCompleteOpen(false);
    },
    onError: (e) => {
      window.alert(e?.message || "Falha ao concluir em lote.");
    },
  });

  const removeCompletionMut = useMutation({
    mutationFn: async (deadlineId) => {
      await dbClient.entities.CalendarInovCompletion.remove(uid, deadlineId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendarInovCompletions", uid] }),
    onError: (e) => window.alert(e?.message || "Não foi possível reabrir a tarefa."),
  });

  const filtered = useMemo(() => {
    let rows = all;
    if (userArea && userArea !== "todas") {
      rows = rows.filter((r) => r.areas.includes(userArea));
    }
    return rows;
  }, [all, userArea, workspaceCalendarSync]);

  const orderedFiltered = filtered;

  const rowsByEffectiveYmd = useMemo(() => {
    const m = new Map();
    for (const r of orderedFiltered) {
      const k = r.effectiveDueDate;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  }, [orderedFiltered]);

  const deadlineYmdSet = useMemo(
    () => new Set(orderedFiltered.map((r) => r.effectiveDueDate)),
    [orderedFiltered]
  );

  const calendarModifiers = useMemo(
    () => ({
      hasDeadline: (date) => {
        const ymd = toYmd(date);
        return ymd ? deadlineYmdSet.has(ymd) : false;
      },
    }),
    [deadlineYmdSet]
  );

  const calendarModifiersClassNames = useMemo(
    () => ({
      hasDeadline: cn(
        "relative font-semibold",
        theme === "dark"
          ? "bg-indigo-500/25 text-indigo-50 after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:rounded-full after:bg-indigo-400"
          : "bg-indigo-100 text-indigo-950 after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:rounded-full after:bg-indigo-600"
      ),
    }),
    [theme]
  );

  const selectedDayYmd = selectedCalendarDay ? toYmd(selectedCalendarDay) : "";
  const selectedDayRows = selectedDayYmd ? rowsByEffectiveYmd.get(selectedDayYmd) || [] : [];
  const selectedDayLabel = selectedCalendarDay
    ? selectedCalendarDay.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  const mergedReferenceSections = useMemo(
    () =>
      INOV_REFERENCE_SECTIONS.map((sec) => {
        const ov = referenceTableOverrides?.[sec.sectionTitle];
        const rows =
          ov && Array.isArray(ov.rows)
            ? ov.rows.map((r) => ({
                c1: String(r?.c1 || ""),
                c2: String(r?.c2 || ""),
                c3: String(r?.c3 || ""),
              }))
            : sec.rows;
        return { ...sec, rows };
      }),
    [referenceTableOverrides]
  );
  const mergedSectionByTitle = useMemo(() => {
    const m = new Map();
    for (const sec of mergedReferenceSections) m.set(sec.sectionTitle, sec);
    return m;
  }, [mergedReferenceSections]);

  /** Só a coluna da área escolhida — não misturar tarefas de outras áreas na mesma linha. */
  const visibleAreaColumns = useMemo(() => {
    if (userArea && userArea !== "todas") return [userArea];
    return [...INOV_AREA_IDS];
  }, [userArea]);

  const pendingFiltered = useMemo(
    () => orderedFiltered.filter((r) => !completionMap.has(r.id)),
    [orderedFiltered, completionMap]
  );

  if (!tabAccess.CalendarManagement) {
    return (
      <GestaoRestrictedPanel message="Você não tem permissão para acessar o calendário. Entre em contato com o administrador." />
    );
  }

  const handleAreaChange = (v) => {
    setInovUserArea(v);
    setUserArea(v);
  };

  const openDayTasksDialog = (d) => {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return;
    setSelectedCalendarDay(d);
    setDayTasksDialogOpen(true);
  };

  const openCustomTaskDialog = (baseDate) => {
    const ymd = baseDate && !Number.isNaN(baseDate.getTime()) ? toYmd(baseDate) : todayYmd();
    setCustomTaskForm({
      dueDate: ymd,
      area: userArea && userArea !== "todas" ? userArea : "contabil",
      tasks: [makeCustomTaskDraft()],
    });
    setCustomTaskDialogOpen(true);
  };

  const submitCustomTask = () => {
    const due = String(customTaskForm.dueDate || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) {
      window.alert("Informe uma data válida.");
      return;
    }
    const tasks = Array.isArray(customTaskForm.tasks) ? customTaskForm.tasks : [];
    if (tasks.length === 0) {
      window.alert("Adicione ao menos uma tarefa.");
      return;
    }
    const payloadTasks = [];
    for (const t of tasks) {
      const desc = String(t.description || "").trim();
      if (!desc) {
        window.alert("Toda tarefa precisa de descrição.");
        return;
      }
      const rp = String(t.recurrencePreset || "").toLowerCase();
      const preset =
        rp === "monthly" ? "monthly"
        : rp === "per_year" ? "per_year"
        : rp === "every_n_months" ? "every_n_months"
        : rp === "every_n_days" ? "every_n_days"
        : "auto";
      const intervalN = Math.max(1, Math.round(Number(t.intervalN) || 2));
      payloadTasks.push({
        description: desc,
        recurrencePreset: preset,
        monthsPerYear: Math.min(12, Math.max(1, Math.round(Number(t.monthsPerYear) || 4))),
        intervalN,
        groupNumber: String(t.groupNumber || "").trim(),
      });
    }
    saveCustomTaskMut.mutate({
      dueDate: due,
      area: customTaskForm.area,
      tasks: payloadTasks,
    });
  };

  const openCompleteOne = (deadlineId) => {
    setCompleteBulk(false);
    setCompleteDeadlineId(deadlineId);
    setCompleteDate(todayYmd());
    setCompleteOpen(true);
  };

  const openCompleteBulk = () => {
    if (pendingFiltered.length === 0) return;
    setCompleteBulk(true);
    setCompleteDeadlineId("");
    setCompleteDate(todayYmd());
    setCompleteOpen(true);
  };

  const confirmComplete = () => {
    const ymd = String(completeDate || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      window.alert("Informe uma data válida.");
      return;
    }
    if (completeBulk) {
      bulkCompleteMut.mutate({ rows: pendingFiltered, completedOn: ymd });
    } else if (completeDeadlineId) {
      saveCompletionMut.mutate({ deadlineId: completeDeadlineId, completedOn: ymd });
    }
  };

  const busy = saveCompletionMut.isPending || bulkCompleteMut.isPending;

  const areaConfigured = Boolean(userArea);

  if (!uid) {
    return (
      <div className="space-y-4">
        <GestaoPageHeader title="Calendário" subtitle="Prazos INOV e conclusões por área" />
        <GestaoPanel className="p-6 text-center text-muted-foreground">
          Entre na sua conta para ver o calendário, escolher a sua área e marcar conclusões.
        </GestaoPanel>
      </div>
    );
  }

  if (!areaConfigured) {
    return (
      <div className="space-y-6">
        <GestaoPageHeader
          title="Calendário"
          subtitle="Indique a sua área antes de ver prazos e marcar conclusões"
        />

        <GestaoPanel className="p-6 space-y-4 border-2 border-amber-400 bg-amber-50/80">
          <div className="flex items-start gap-3">
            <Bell className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-2 min-w-0">
              <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
                Configure a sua área (obrigatório)
              </h2>
              <p className="text-sm text-amber-900/90 dark:text-amber-200/90">
                Escolha a opção que corresponde ao seu trabalho (Contábil, Fiscal, Folha, etc.). Pode alterar mais tarde;
                até escolher, os prazos do calendário INOV e os respetivos alertas no sininho permanecem desativados para
                si.
              </p>
            </div>
          </div>
          <div className="space-y-2 max-w-sm">
            <Label htmlFor="inov-area-required">Minha área</Label>
            <Select
              value={userArea}
              onValueChange={handleAreaChange}
            >
              <SelectTrigger id="inov-area-required" className="bg-background">
                <SelectValue placeholder="Selecione a sua área…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">{INOV_AREA_LABELS.todas}</SelectItem>
                {INOV_AREA_IDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {INOV_AREA_LABELS[k] || k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Guardado neste navegador: <code className="text-[10px]">{INOV_AREA_STORAGE_KEY}</code>
            </p>
          </div>
        </GestaoPanel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <GestaoPageHeader title="Calendário" subtitle="Prazos INOV, área e conclusões" />

      <GestaoPanel className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2 min-w-[200px]">
            <Label className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Minha área (lista + sininho)
            </Label>
            <Select value={userArea} onValueChange={handleAreaChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">{INOV_AREA_LABELS.todas}</SelectItem>
                {INOV_AREA_IDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {INOV_AREA_LABELS[k] || k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 min-w-[220px]">
            <MonthPicker
              date={getReferenceMonthAsDate() || new Date()}
              onChange={(d) => setReferenceMonthFromDate(d)}
              restrictToWorkspaceYearWindow
            />
          </div>
          <div className="flex items-end gap-2 w-full sm:w-auto sm:ms-auto">
            <Button
              type="button"
              variant="outline"
              className={cn(
                "gap-2 w-full sm:w-auto justify-center sm:justify-start",
                theme === "dark" ? "border-gray-700 bg-gray-950/50 hover:bg-gray-900" : ""
              )}
              onClick={() => setReportOpen(true)}
            >
              <ListChecks className="w-4 h-4 shrink-0" />
              Relatório
            </Button>
            <Popover open={calendarMoreOpen} onOpenChange={setCalendarMoreOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "gap-2 w-full sm:w-auto justify-center sm:justify-start",
                    theme === "dark" ? "border-gray-700 bg-gray-950/50 hover:bg-gray-900" : ""
                  )}
                >
                  <Settings2 className="w-4 h-4 shrink-0" />
                  Mais opções do calendário
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className={cn(
                  "w-[min(100vw-2rem,26rem)] max-h-[min(85vh,32rem)] overflow-y-auto p-4 space-y-4 z-50",
                  theme === "dark" ? "border-gray-700 bg-gray-900 text-foreground" : ""
                )}
              >
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground">Como funciona</p>
                  <p
                    className={cn(
                      "text-sm leading-relaxed",
                      theme === "dark" ? "text-gray-400" : "text-gray-600"
                    )}
                  >
                    A sua área está definida; a lista e o <strong className="text-foreground">sininho</strong> usam esse
                    filtro. O sistema <strong className="text-foreground">provisiona</strong> prazos:{" "}
                    <strong className="text-foreground">mensais</strong> (folha, balancete mensal, guias, etc.),{" "}
                    <strong className="text-foreground">trimestrais</strong> (IRPJ/CSLL trim.),{" "}
                    <strong className="text-foreground">anuais</strong> e outros pontuais, com base no texto da planilha. O{" "}
                    <strong className="text-foreground">mês e ano</strong> coincidem com a aba Empresas. O{" "}
                    <strong className="text-foreground">início do calendário INOV</strong> define a partir de quando as
                    ocorrências entram na lista e no sininho — 1.º dia desse mês, como «Início das tarefas» na empresa.
                    Marque <strong className="text-foreground">Concluído</strong> com a data em que finalizou: a linha fica{" "}
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">verde</span> e o prazo deixa de
                    aparecer no sininho <strong className="text-foreground">para si</strong>.
                  </p>
                </div>
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-[11px] text-muted-foreground max-w-sm">
                    Só aparecem linhas da sua área; na tabela, <strong>só a coluna dessa área</strong> mostra tarefas (as
                    outras colunas não são exibidas, para não misturar conteúdos). O mesmo critério vale para o sininho.
                  </p>
                  <p className="text-[11px] text-muted-foreground max-w-xs">
                    Guardado neste navegador: <code className="text-[10px]">{INOV_AREA_STORAGE_KEY}</code>
                  </p>
                  <p className="text-[11px] text-muted-foreground max-w-xs">
                    Mês e ano: sincronizado com a aba <strong>Empresas</strong>. Só é possível escolher{" "}
                    <strong>ano anterior ou ano atual</strong> (alinhado à data do sistema e aos prazos INOV).
                  </p>
                </div>
                <div className="space-y-2 border-t border-border pt-3">
                  <Label>Início do calendário INOV</Label>
                  <DatePicker
                    date={inovTasksStartYmd || undefined}
                    onChange={(v) => {
                      const y = v || "";
                      setInovTasksStartYmd(y);
                      setInovCalendarStartYmd(y);
                    }}
                    placeholder="Opcional — sem data inicial"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Igual à ideia de <strong>Início das tarefas contábeis</strong> no cadastro da empresa: a partir do{" "}
                    <strong>1.º dia deste mês</strong> as ocorrências (mensal, trimestral…) passam a aparecer. Vazio =
                    todas as datas geradas.
                  </p>
                  {inovTasksStartYmd ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => {
                        setInovTasksStartYmd("");
                        setInovCalendarStartYmd("");
                      }}
                    >
                      Limpar data inicial
                    </Button>
                  ) : null}
                </div>
                <div className="border-t border-border pt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 border-emerald-600/50 text-emerald-700 dark:text-emerald-400"
                    disabled={pendingFiltered.length === 0 || busy}
                    onClick={() => {
                      setCalendarMoreOpen(false);
                      openCompleteBulk();
                    }}
                  >
                    <ListChecks className="w-4 h-4" />
                    Concluir todas deste filtro ({pendingFiltered.length})
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </GestaoPanel>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,360px)] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CalendarDays className="w-5 h-5 shrink-0" />
              Calendário do mês
            </h2>
            <p className="text-[11px] text-muted-foreground max-w-2xl">
              Clique em qualquer data com prazo para abrir o quadro das tarefas daquele dia.
            </p>
          </div>
          <InovLargeCalendar
            theme={theme}
            month={calendarMonthStart}
            onMonthChange={(d) => {
              if (d) setReferenceMonthFromDate(d);
            }}
            selected={dayTasksDialogOpen ? selectedCalendarDay : undefined}
            onSelect={(d) => {
              if (!d) {
                setSelectedCalendarDay(undefined);
                setDayTasksDialogOpen(false);
                return;
              }
              openDayTasksDialog(d);
            }}
            modifiers={calendarModifiers}
            modifiersClassNames={calendarModifiersClassNames}
          />
        </div>

        <Card
          className={cn(
            "p-4 border xl:sticky xl:top-4 max-h-[min(92vh,860px)] flex flex-col",
            theme === "dark" ? "bg-gray-900/85 border-gray-800" : "bg-white shadow-sm"
          )}
        >
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <MessageSquareText className="w-4 h-4" />
            Recados por setor
          </h3>
          <p className="text-[10px] text-muted-foreground mb-2">{INOV_REFERENCE_TABLES_NOTE}</p>
          <div className="flex flex-col gap-2">
            {INOV_RECADO_BY_SECTOR.map((item) => (
              <Button
                key={item.sectorKey}
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "h-auto min-h-10 py-2.5 justify-start text-left text-lg font-semibold whitespace-normal",
                  theme === "dark" ? "border-gray-600 bg-gray-950/40" : ""
                )}
                onClick={() =>
                  (() => {
                    const sections = (item.sectionTitles || [])
                      .map((t) => mergedSectionByTitle.get(t))
                      .filter(Boolean);
                    setEditingRecados(false);
                    setRecadosDraftSections(sections.map((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r })) })));
                    setRecadosDialog({
                      title: `Recados — ${item.label}`,
                      sectionTitles: item.sectionTitles || [],
                      emptyHint: item.emptyHint,
                    });
                  })()
                }
              >
                {item.label}
              </Button>
            ))}
          </div>
        </Card>
      </div>

      <Dialog
        open={dayTasksDialogOpen}
        onOpenChange={(open) => {
          setDayTasksDialogOpen(open);
          if (!open) setSelectedCalendarDay(undefined);
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className={cn(
            "max-w-[min(96vw,1180px)] max-h-[min(90vh,760px)] overflow-y-auto",
            theme === "dark" ? "border-gray-700 bg-gray-900" : ""
          )}
        >
          <DialogHeader className="flex-row items-start justify-between gap-3">
            <DialogTitle>
              {selectedCalendarDay ? `Tarefas do dia — ${selectedDayLabel}` : "Tarefas do dia"}
            </DialogTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="px-2.5">
                  ⋯
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="cursor-pointer"
                  disabled={!canEditCalendarRows}
                  onSelect={() => openCustomTaskDialog(selectedCalendarDay)}
                >
                  Adicionar tarefa no dia
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </DialogHeader>
          {!selectedCalendarDay ? (
            <p className="text-sm text-muted-foreground py-2">Selecione um dia no calendário para ver as tarefas.</p>
          ) : selectedDayRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              Nenhuma tarefa neste dia. Use o botão <strong>⋯</strong> para adicionar.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border max-h-[min(66vh,560px)] overflow-y-auto">
              <table
                className={cn(
                  "w-full text-sm",
                  visibleAreaColumns.length <= 1 ? "min-w-[680px]" : "min-w-[1000px]"
                )}
              >
                <thead
                  className={cn(
                    "sticky top-0 z-10",
                    theme === "dark" ? "bg-gray-800" : "bg-gray-100"
                  )}
                >
                  <tr>
                    <th
                      className={cn(
                        "text-center p-2 font-medium whitespace-nowrap min-w-[96px] w-[96px] max-w-[96px] sticky left-0 z-30 border-x",
                        theme === "dark"
                          ? "text-slate-100 border-slate-600/80 bg-slate-900"
                          : "text-slate-800 border-slate-300 bg-slate-100"
                      )}
                    >
                      EDIÇÃO
                    </th>
                    <th
                      className={cn(
                        "text-left p-2 font-medium text-muted-foreground whitespace-nowrap sticky left-[96px] z-30 min-w-[140px] max-w-[140px] w-[140px] border-r",
                        theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-gray-100 border-gray-200"
                      )}
                    >
                      Data planilha
                    </th>
                    <th
                      className={cn(
                        "text-left p-2 font-medium text-muted-foreground whitespace-nowrap sticky left-[236px] z-30 min-w-[132px] max-w-[132px] w-[132px] border-r",
                        theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-gray-100 border-gray-200"
                      )}
                    >
                      Dia útil efetivo
                    </th>
                    {visibleAreaColumns.map((aid) => (
                      <th
                        key={aid}
                        className={cn(
                          "text-left p-2 font-medium text-muted-foreground",
                          aid === visibleAreaColumns[0] && "border-l border-gray-200/30 dark:border-gray-700/40"
                        )}
                      >
                        {INOV_AREA_LABELS[aid] || aid}
                      </th>
                    ))}
                    {selectedDayRows.some((r) => r.referenceMonth) ? (
                      <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap min-w-[120px]">
                        Referência
                      </th>
                    ) : null}
                    <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap min-w-[72px]">
                      Grupos
                    </th>
                    <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">
                      Conclusão
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDayRows.map((row) => (
                    <InovCalendarTableRow
                      key={row.id}
                      row={row}
                      theme={theme}
                      visibleAreaColumns={visibleAreaColumns}
                      canEdit={canEditCalendarRows}
                      completionMap={completionMap}
                      busy={busy}
                      openCompleteOne={openCompleteOne}
                      removeCompletionMut={removeCompletionMut}
                      onOpenEditDialog={setEditRow}
                      onDeleteCustomEntry={canEditCalendarRows ? (rowId, templateKey, isCustom, raw, dueDate, groupNumber) => setPendingDelete({ rowId, templateKey, isCustom, raw, dueDate, groupNumber }) : undefined}
                      showReferenceMonth={selectedDayRows.some((r) => r.referenceMonth)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDayTasksDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent
          aria-describedby={undefined}
          className={cn(
            "max-w-[min(96vw,860px)] max-h-[min(90vh,780px)] overflow-y-auto",
            theme === "dark" ? "border-gray-700 bg-gray-900" : ""
          )}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-indigo-500 shrink-0" />
              Relatório de tarefas —{" "}
              {calendarMonthStart.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              {userArea && userArea !== "todas" ? ` · ${INOV_AREA_LABELS[userArea] || userArea}` : ""}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const monthYmd = `${calendarMonthStart.getFullYear()}-${String(calendarMonthStart.getMonth() + 1).padStart(2, "0")}`;
            const monthRows = orderedFiltered.filter((r) => r.effectiveDueDate.startsWith(monthYmd));
            if (monthRows.length === 0) {
              return (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhuma tarefa encontrada neste mês para a área selecionada.
                </p>
              );
            }
            const byDate = new Map();
            for (const r of monthRows) {
              const k = r.effectiveDueDate;
              if (!byDate.has(k)) byDate.set(k, []);
              byDate.get(k).push(r);
            }
            const sortedDates = [...byDate.keys()].sort();
            return (
              <div className="space-y-4 pb-2">
                <p className="text-[11px] text-muted-foreground">
                  {monthRows.length} tarefa{monthRows.length !== 1 ? "s" : ""} no mês · {sortedDates.length} dia{sortedDates.length !== 1 ? "s" : ""} com prazo
                </p>
                {sortedDates.map((ymd) => {
                  const rows = byDate.get(ymd);
                  const dateLabel = new Date(ymd + "T12:00:00").toLocaleDateString("pt-BR", {
                    weekday: "short", day: "numeric", month: "short",
                  });
                  return (
                    <div key={ymd}>
                      <div className={cn(
                        "text-xs font-bold uppercase tracking-wide px-2 py-1 rounded mb-1",
                        theme === "dark" ? "bg-indigo-900/40 text-indigo-200" : "bg-indigo-100 text-indigo-800"
                      )}>
                        {dateLabel}
                      </div>
                      <table className={cn(
                        "w-full text-xs border-collapse",
                        theme === "dark" ? "text-gray-200" : "text-gray-800"
                      )}>
                        <tbody>
                          {rows.map((r) => {
                            const doneOn = completionMap.get(r.id);
                            return (
                              <tr
                                key={r.id}
                                className={cn(
                                  "border-b",
                                  theme === "dark" ? "border-gray-800" : "border-gray-100",
                                  doneOn && (theme === "dark" ? "opacity-50" : "opacity-60")
                                )}
                              >
                                <td className="py-1.5 px-2 w-[90px] shrink-0 whitespace-nowrap font-mono tabular-nums text-muted-foreground">
                                  {fmtBr(r.dueDate)}
                                </td>
                                <td className="py-1.5 px-2 w-[80px] shrink-0 whitespace-nowrap">
                                  {r.groupNumber ? (
                                    <span className={cn(
                                      "inline-block px-1.5 py-0.5 rounded font-semibold",
                                      theme === "dark" ? "bg-gray-700 text-gray-200" : "bg-gray-200 text-gray-700"
                                    )}>
                                      Grupo {r.groupNumber}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="py-1.5 px-2 leading-snug">
                                  <span className={cn(doneOn && "line-through")}>
                                    {r.raw.split("]").pop()?.trim() || r.raw}
                                  </span>
                                  {r.referenceMonth ? (
                                    <span className={cn(
                                      "ml-1.5 inline-block text-[10px] font-semibold px-1 py-0.5 rounded",
                                      theme === "dark" ? "bg-indigo-900/60 text-indigo-300" : "bg-indigo-100 text-indigo-700"
                                    )}>
                                      {r.referenceMonth}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="py-1.5 px-2 whitespace-nowrap text-right">
                                  {doneOn ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                      ✓ {fmtBr(doneOn)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">pendente</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setReportOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={customTaskDialogOpen} onOpenChange={setCustomTaskDialogOpen}>
        <DialogContent aria-describedby={undefined} className={cn("max-w-lg", theme === "dark" ? "border-gray-700 bg-gray-900" : "")}>
          <DialogHeader>
            <DialogTitle>Nova tarefa do calendário</DialogTitle>
          </DialogHeader>
          {!canEditCalendarRows ? (
            <p className="text-sm text-amber-700 dark:text-amber-300 rounded-md border border-amber-600/40 bg-amber-950/30 p-2">
              Só o <strong>proprietário</strong> pode criar/editar tarefas no calendário.
            </p>
          ) : null}
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label>Data base</Label>
              <Input
                type="date"
                value={customTaskForm.dueDate}
                onChange={(e) => setCustomTaskForm((p) => ({ ...p, dueDate: e.target.value.slice(0, 10) }))}
                className="max-w-[220px]"
              />
              <p className="text-[11px] text-muted-foreground">
                Se cair em feriado/fim de semana, o dia útil efetivo ajusta para <strong>trás</strong>.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Recorrência</Label>
              <p className="text-[11px] text-muted-foreground">
                A recorrência é definida por <strong>tarefa</strong> do setor (cada linha abaixo).
              </p>
            </div>
            <div className="space-y-1">
              <Label>Setor</Label>
              <Select
                value={customTaskForm.area}
                onValueChange={(v) => setCustomTaskForm((p) => ({ ...p, area: v }))}
              >
                <SelectTrigger className={theme === "dark" ? "bg-gray-950 border-gray-700" : ""}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INOV_AREA_IDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {INOV_AREA_LABELS[k] || k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <Label>Tarefas do setor neste dia</Label>
              {customTaskForm.tasks.map((task, idx) => (
                <div
                  key={task.localId}
                  className={cn(
                    "rounded-md border p-3 space-y-2",
                    theme === "dark" ? "border-gray-700 bg-gray-950/40" : "border-gray-200 bg-gray-50/50"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tarefa {idx + 1}</p>
                    {customTaskForm.tasks.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-red-600"
                        onClick={() =>
                          setCustomTaskForm((p) => ({
                            ...p,
                            tasks: p.tasks.filter((t) => t.localId !== task.localId),
                          }))
                        }
                      >
                        Remover
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Recorrência da tarefa</Label>
                      <Select
                        value={task.recurrencePreset}
                        onValueChange={(v) =>
                          setCustomTaskForm((p) => ({
                            ...p,
                            tasks: p.tasks.map((t) =>
                              t.localId === task.localId
                                ? {
                                    ...t,
                                    recurrencePreset:
                                      v === "monthly" ? "monthly"
                                      : v === "per_year" ? "per_year"
                                      : v === "every_n_months" ? "every_n_months"
                                      : v === "every_n_days" ? "every_n_days"
                                      : "auto",
                                  }
                                : t
                            ),
                          }))
                        }
                      >
                        <SelectTrigger className={theme === "dark" ? "bg-gray-950 border-gray-700" : ""}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Automática (pelo texto da tarefa)</SelectItem>
                          <SelectItem value="monthly">Mensalmente</SelectItem>
                          <SelectItem value="per_year">Várias vezes por ano — indicar quantas</SelectItem>
                          <SelectItem value="every_n_months">A cada N meses — indicar quantos</SelectItem>
                          <SelectItem value="every_n_days">A cada N dias — indicar quantos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Grupo (opcional)</Label>
                      <Input
                        value={task.groupNumber}
                        onChange={(e) =>
                          setCustomTaskForm((p) => ({
                            ...p,
                            tasks: p.tasks.map((t) =>
                              t.localId === task.localId ? { ...t, groupNumber: e.target.value.slice(0, 32) } : t
                            ),
                          }))
                        }
                        placeholder="Ex.: 1"
                        className={theme === "dark" ? "bg-gray-950 border-gray-700" : ""}
                      />
                    </div>
                  </div>
                  {task.recurrencePreset === "per_year" ? (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground font-normal">
                        Quantas vezes por ano (1 a 12)
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={12}
                        step={1}
                        value={task.monthsPerYear}
                        onChange={(e) =>
                          setCustomTaskForm((p) => ({
                            ...p,
                            tasks: p.tasks.map((t) =>
                              t.localId === task.localId
                                ? { ...t, monthsPerYear: e.target.value.replace(/[^\d]/g, "").slice(0, 2) }
                                : t
                            ),
                          }))
                        }
                        className={cn("max-w-[140px]", theme === "dark" ? "bg-gray-950 border-gray-700" : "")}
                      />
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <Label>Mês de referência (opcional)</Label>
                    <Input
                      value={task.referenceMonth}
                      onChange={(e) =>
                        setCustomTaskForm((p) => ({
                          ...p,
                          tasks: p.tasks.map((t) =>
                            t.localId === task.localId ? { ...t, referenceMonth: e.target.value.slice(0, 40) } : t
                          ),
                        }))
                      }
                      placeholder="Ex.: Fechamento de Maio, Abertura de Junho"
                      className={theme === "dark" ? "bg-gray-950 border-gray-700" : ""}
                    />
                  </div>
                  {(task.recurrencePreset === "every_n_months" || task.recurrencePreset === "every_n_days") ? (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground font-normal">
                        {task.recurrencePreset === "every_n_months" ? "Repetir a cada quantos meses (ex.: 2)" : "Repetir a cada quantos dias (ex.: 45)"}
                      </Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={task.intervalN}
                        onChange={(e) =>
                          setCustomTaskForm((p) => ({
                            ...p,
                            tasks: p.tasks.map((t) =>
                              t.localId === task.localId
                                ? { ...t, intervalN: e.target.value.replace(/[^\d]/g, "").slice(0, 3) }
                                : t
                            ),
                          }))
                        }
                        className={cn("max-w-[140px]", theme === "dark" ? "bg-gray-950 border-gray-700" : "")}
                      />
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <Label>Descrição da tarefa</Label>
                    <Textarea
                      rows={3}
                      value={task.description}
                      onChange={(e) =>
                        setCustomTaskForm((p) => ({
                          ...p,
                          tasks: p.tasks.map((t) =>
                            t.localId === task.localId ? { ...t, description: e.target.value } : t
                          ),
                        }))
                      }
                      placeholder="Descreva a tarefa para este setor."
                      className={theme === "dark" ? "bg-gray-950 border-gray-700" : ""}
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setCustomTaskForm((p) => ({
                    ...p,
                    tasks: [...p.tasks, makeCustomTaskDraft()],
                  }))
                }
              >
                Adicionar outra tarefa deste setor
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCustomTaskDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={submitCustomTask}
              disabled={!canEditCalendarRows || saveCustomTaskMut.isPending}
            >
              {saveCustomTaskMut.isPending ? "A gravar…" : "Salvar tarefas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(recadosDialog)}
        onOpenChange={(o) => {
          if (!o) {
            setRecadosDialog(null);
            setEditingRecados(false);
          }
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className={cn(
            "max-w-2xl max-h-[min(90vh,760px)] overflow-y-auto",
            theme === "dark" ? "border-gray-700 bg-gray-900" : ""
          )}
        >
          <DialogHeader>
            <DialogTitle>{recadosDialog?.title || "Recados"}</DialogTitle>
          </DialogHeader>
          <p className="text-[10px] text-muted-foreground -mt-1 mb-2">{INOV_REFERENCE_TABLES_NOTE}</p>
          {(() => {
            const activeSections = editingRecados
              ? recadosDraftSections
              : (recadosDialog?.sectionTitles || [])
                  .map((t) => mergedSectionByTitle.get(t))
                  .filter(Boolean);
            return !activeSections.length ? (
            <p className="text-sm text-muted-foreground py-2">
              {recadosDialog?.emptyHint || "Sem quadro nesta referência."}
            </p>
          ) : (
            <div className="space-y-4 text-[10px] leading-snug pr-1 pb-2">
              {activeSections.map((sec, si) => (
                <div key={sec.sectionTitle}>
                  <p className="font-bold uppercase mb-1.5 tracking-wide">{sec.sectionTitle}</p>
                  <table
                    className={cn(
                      "w-full border-collapse border-2 text-left",
                      theme === "dark" ? "border-gray-600" : "border-gray-800"
                    )}
                  >
                    <thead>
                      <tr className={theme === "dark" ? "bg-gray-800" : "bg-gray-200"}>
                        <th className="border p-1.5 font-semibold w-[12%]">{sec.col1}</th>
                        <th className="border p-1.5 font-semibold">{sec.col2}</th>
                        <th className="border p-1.5 font-semibold w-[26%]">{sec.col3}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.rows.map((r, ri) => (
                        <tr key={`${sec.sectionTitle}-${ri}`}>
                          <td className="border p-1.5 font-medium align-top whitespace-nowrap">
                            {editingRecados ? (
                              <Input
                                value={r.c1}
                                onChange={(e) =>
                                  setRecadosDraftSections((prev) =>
                                    prev.map((s, idx) =>
                                      idx !== si
                                        ? s
                                        : {
                                            ...s,
                                            rows: s.rows.map((row, rix) =>
                                              rix === ri ? { ...row, c1: e.target.value } : row
                                            ),
                                          }
                                    )
                                  )
                                }
                                className="h-8 text-xs"
                              />
                            ) : (
                              r.c1
                            )}
                          </td>
                          <td className="border p-1.5 align-top">
                            {editingRecados ? (
                              <Input
                                value={r.c2}
                                onChange={(e) =>
                                  setRecadosDraftSections((prev) =>
                                    prev.map((s, idx) =>
                                      idx !== si
                                        ? s
                                        : {
                                            ...s,
                                            rows: s.rows.map((row, rix) =>
                                              rix === ri ? { ...row, c2: e.target.value } : row
                                            ),
                                          }
                                    )
                                  )
                                }
                                className="h-8 text-xs"
                              />
                            ) : (
                              r.c2
                            )}
                          </td>
                          <td className="border p-1.5 align-top">
                            {editingRecados ? (
                              <Input
                                value={r.c3}
                                onChange={(e) =>
                                  setRecadosDraftSections((prev) =>
                                    prev.map((s, idx) =>
                                      idx !== si
                                        ? s
                                        : {
                                            ...s,
                                            rows: s.rows.map((row, rix) =>
                                              rix === ri ? { ...row, c3: e.target.value } : row
                                            ),
                                          }
                                    )
                                  )
                                }
                                className="h-8 text-xs"
                              />
                            ) : (
                              r.c3
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          );
          })()}
          <DialogFooter>
            {!editingRecados ? (
              <Button
                type="button"
                variant="outline"
                disabled={!canEditCalendarRows}
                onClick={() => setEditingRecados(true)}
              >
                Editar dados
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingRecados(false);
                    const sections = (recadosDialog?.sectionTitles || [])
                      .map((t) => mergedSectionByTitle.get(t))
                      .filter(Boolean);
                    setRecadosDraftSections(sections.map((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r })) })));
                  }}
                >
                  Cancelar edição
                </Button>
                <Button
                  type="button"
                  className="bg-indigo-600 hover:bg-indigo-700"
                  disabled={!canEditCalendarRows || saveRecadosMut.isPending}
                  onClick={() => saveRecadosMut.mutate({ sections: recadosDraftSections })}
                >
                  {saveRecadosMut.isPending ? "A gravar…" : "Salvar alterações"}
                </Button>
              </>
            )}
            <Button type="button" variant="secondary" onClick={() => setRecadosDialog(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InovCalendarRowEditDialog
        row={editRow}
        open={Boolean(editRow)}
        onOpenChange={(next) => {
          if (!next) setEditRow(null);
        }}
        theme={theme}
        onSaveAsync={(payload) => saveRowMut.mutateAsync(payload)}
        saving={Boolean(
          saveRowMut.isPending && editRow && saveRowMut.variables?.rowId === editRow.id
        )}
        canPersistRowEdits={canEditCalendarRows}
        focusArea={userArea}
      />

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja enviar esta tarefa para a Lixeira? Ela deixará de aparecer no calendário, mas você poderá restaurá-la ou excluí-la permanentemente a partir da aba Lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (pendingDelete) deleteCustomEntryMut.mutate(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Mandar para a Lixeira
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent aria-describedby={undefined} className={theme === "dark" ? "border-gray-700 bg-gray-900" : ``}>
          <DialogHeader>
            <DialogTitle>
              {completeBulk ? `Concluir ${pendingFiltered.length} tarefa(s) deste filtro` : "Marcar tarefa como concluída"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              A data abaixo é quando considera que concluiu (aparece a verde na coluna Conclusão). O sininho deixa de
              alertar <strong>para a sua conta</strong> sobre {completeBulk ? "estas tarefas" : "esta tarefa"}.
            </p>
            <div className="space-y-2">
              <Label htmlFor="inov-complete-date">Data da conclusão</Label>
              <Input
                id="inov-complete-date"
                type="date"
                value={completeDate}
                onChange={(e) => setCompleteDate(e.target.value)}
                className="max-w-[200px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setCompleteOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={confirmComplete}
              disabled={busy}
            >
              {busy ? "A gravar…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
