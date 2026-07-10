import React, { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, LogOut, Ban, CheckSquare, Mail, FileText, Trash2, Columns3, Copy } from "lucide-react";
import { format } from "date-fns";
import { useTheme } from "../ThemeProvider";
import NotesEmailDialog from "./NotesEmailDialog";
import CompanyFilesModal from "./CompanyFilesModal";
import { isMonthBeforeAccountingTasksStart, isMonthlyTaskInPeriodScope } from "@/lib/companyTaskPeriod";
import { getMonthlyNote, getAnnualNote } from "@/lib/companyObservations";
import { cn } from "@/lib/utils";
import {
  formatCompanySectorResponsiblesCompact,
  formatCompanySectorResponsiblesLong,
} from "@/lib/companySectorResponsibles";

const COL_PREFS_KEY = "gc_company_table_prefs_v2";

const COLUMN_DEFS = [
  { key: "edit", label: "EDIÇÃO", width: 96, minWidth: 80, defaultFixed: true, alwaysVisible: true },
  { key: "code", label: "Código", width: 96, minWidth: 80, defaultFixed: true },
  { key: "name", label: "Empresa", width: 320, minWidth: 180, defaultFixed: true },
  { key: "group", label: "Grupo de empresas", width: 220, minWidth: 120 },
  { key: "cnpj", label: "CNPJ", width: 180, minWidth: 120 },
  { key: "tasksStart", label: "Início tarefas", width: 150, minWidth: 120 },
  { key: "contact", label: "Contato", width: 180, minWidth: 120 },
  { key: "responsible", label: "Responsáveis", width: 260, minWidth: 140 },
  { key: "regime", label: "Regime", width: 170, minWidth: 110 },
  { key: "difficulty", label: "Dificuldade", width: 130, minWidth: 90 },
  { key: "openTasks", label: "Tarefas Abertas", width: 150, minWidth: 110 },
  { key: "doneTasks", label: "Tarefas Concluídas", width: 170, minWidth: 120 },
  { key: "manage", label: "Gerenciar", width: 130, minWidth: 100, alwaysVisible: true },
  { key: "notes", label: "Observações", width: 360, minWidth: 160 },
];

function parseTaskDate(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const localDate = new Date(year, month - 1, day);
    return Number.isNaN(localDate.getTime()) ? null : localDate;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getPeriodKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function isMonthlyTaskCompletedInPeriod(task, year, month) {
  const periodKey = getPeriodKey(year, month);
  if (task?.completed_months?.[periodKey]) return true;
  const legacyDate = parseTaskDate(task?.completed_date);
  if (!legacyDate) return false;
  return legacyDate.getMonth() + 1 === month && legacyDate.getFullYear() === year;
}

function loadColumnPrefs() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(COL_PREFS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return null;
    return {
      visible: p.visible && typeof p.visible === "object" ? p.visible : {},
      fixed: p.fixed && typeof p.fixed === "object" ? p.fixed : {},
      compact: p.compact && typeof p.compact === "object" ? p.compact : {},
    };
  } catch {
    return null;
  }
}

export default function CompanyTable({
  companies,
  tasks = [],
  onEdit,
  onExit,
  onDelete,
  onRestore,
  onPermanentlyDelete,
  onOpenTasks,
  onUpdateCompany,
  filterDate,
  showEditMenu = true,
  showColumnConfigurator = true,
  compactMode = false,
  isTrashMode = false,
}) {
  const { theme } = useTheme();
  const [emailCompany, setEmailCompany] = useState(null);
  const [filesCompany, setFilesCompany] = useState(null);
  const [activeNote, setActiveNote] = useState(null);
  const [folderCompany, setFolderCompany] = useState(null);
  const [folderDraft, setFolderDraft] = useState("");
  const [prefs, setPrefs] = useState(() => loadColumnPrefs() || { visible: {}, fixed: {}, compact: {} });

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(COL_PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  const columns = useMemo(() => {
    const compactAllowed = new Set(["code", "name", "group", "responsible", "openTasks", "doneTasks", "manage"]);
    return COLUMN_DEFS.map((def) => {
      const visible = def.alwaysVisible ? true : prefs.visible[def.key] !== false;
      const compact = Boolean(prefs.compact[def.key]);
      const fixed = visible && (def.defaultFixed ? prefs.fixed[def.key] !== false : prefs.fixed[def.key] === true);
      const width = compact ? def.minWidth : def.width;
      return { ...def, visible, compact, fixed, width };
    }).filter((c) => {
      if (!c.visible) return false;
      if (!showEditMenu && c.key === "edit") return false;
      if (compactMode && !compactAllowed.has(c.key)) return false;
      return true;
    });
  }, [prefs, showEditMenu, compactMode]);

  const colLeftMap = useMemo(() => {
    const m = new Map();
    let left = 0;
    columns.forEach((c) => {
      if (c.fixed) {
        m.set(c.key, left);
        left += c.width;
      }
    });
    return m;
  }, [columns]);

  const getTaskStats = (company) => {
    const currentMonth = filterDate ? filterDate.getMonth() + 1 : new Date().getMonth() + 1;
    const currentYear = filterDate ? filterDate.getFullYear() : new Date().getFullYear();
    if (isMonthBeforeAccountingTasksStart(company, currentYear, currentMonth)) {
      return { completed: 0, total: 0, open: 0, beforeTaskStart: true };
    }
    const companyTasks = tasks.filter(
      (t) =>
        t.company_id === company.id &&
        t.frequency === "mensal" &&
        isMonthlyTaskInPeriodScope(t, currentYear, currentMonth)
    );
    const completed = companyTasks.filter((t) => isMonthlyTaskCompletedInPeriod(t, currentYear, currentMonth)).length;
    const total = companyTasks.length;
    return { completed, total, open: total - completed, beforeTaskStart: false };
  };

  const updatePref = (kind, key, value) => {
    setPrefs((prev) => {
      const next = {
        visible: { ...prev.visible },
        fixed: { ...prev.fixed },
        compact: { ...prev.compact },
      };
      next[kind][key] = value;
      if (kind === "visible" && value === false) {
        next.fixed[key] = false;
      }
      return next;
    });
  };

  const resetPrefs = () => {
    setPrefs({ visible: {}, fixed: {}, compact: {} });
  };

  const openFolderDialog = (company) => {
    const c = company || null;
    setFolderCompany(c);
    setFolderDraft(String(c?.folder_path || "").trim());
  };

  const openNoteDialog = (company, title, content) => {
    const text = String(content || "").trim();
    if (!text) return;
    setActiveNote({
      companyName: String(company?.name || "").trim(),
      title,
      content: text,
    });
  };

  const saveFolderPath = async () => {
    if (!onUpdateCompany || !folderCompany?.id) return;
    await onUpdateCompany(folderCompany.id, { folder_path: String(folderDraft || "").trim() });
    setFolderCompany(null);
    setFolderDraft("");
  };

  const copyCompanyFolderPath = async (company) => {
    const raw = String(company?.folder_path || "").trim();
    if (!raw) {
      window.alert("Esta empresa ainda não tem caminho de pasta configurado.");
      return;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(raw);
        window.alert("Caminho da pasta copiado.");
        return;
      }
    } catch {
      // fallback abaixo
    }
    window.alert("Não foi possível copiar automaticamente. Copie manualmente:\n\n" + raw);
  };

  const renderCell = (company, col) => {
    const stats = getTaskStats(company);
    const viewY = filterDate ? filterDate.getFullYear() : new Date().getFullYear();
    const viewM = filterDate ? filterDate.getMonth() + 1 : new Date().getMonth() + 1;
    const geral = String(company.notes || "").trim();
    const mensal = String(getMonthlyNote(company, viewY, viewM) || "").trim();
    const anual = String(getAnnualNote(company, viewY) || "").trim();
    switch (col.key) {
      case "edit":
        if (!showEditMenu) return "—";
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="mx-auto" aria-label="Opções da empresa">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {!isTrashMode ? (
                <>
                  <DropdownMenuItem onClick={() => onEdit(company)}>
                    <Pencil className="w-4 h-4 mr-2" /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openFolderDialog(company)}>
                    <FileText className="w-4 h-4 mr-2" /> Caminho da pasta da empresa
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyCompanyFolderPath(company)}>
                    <Copy className="w-4 h-4 mr-2" /> Copiar caminho da pasta
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onExit(company, "saida")} className="text-orange-600">
                    <LogOut className="w-4 h-4 mr-2" /> Saída de Empresa
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onExit(company, "baixa")} className="text-red-600">
                    <Ban className="w-4 h-4 mr-2" /> Baixa de Empresa
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilesCompany(company)} className="text-indigo-600">
                    <FileText className="w-4 h-4 mr-2" /> Arquivos
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDelete?.(company)} className="text-red-600">
                    <Trash2 className="w-4 h-4 mr-2" /> Mover para Lixeira
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => onRestore?.(company)} className="text-green-600">
                    <Pencil className="w-4 h-4 mr-2" /> Restaurar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onPermanentlyDelete?.(company)} className="text-red-600">
                    <Trash2 className="w-4 h-4 mr-2" /> Excluir Permanentemente
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      case "code":
        return <span className="font-medium text-gray-500">{company.code || "—"}</span>;
      case "name":
        return <span className="font-medium">{company.name || "—"}</span>;
      case "group":
        return company.group_name?.trim() ? (
          <Badge
            variant="secondary"
            className={cn(
              "font-normal text-left h-auto min-h-7 py-1.5 max-w-full",
              "whitespace-normal break-words [overflow-wrap:anywhere]",
              "inline-block align-top w-full"
            )}
          >
            {company.group_name.trim()}
          </Badge>
        ) : (
          "—"
        );
      case "creator":
        return company.creatorName ? (
          <Badge variant="outline" className="font-normal text-xs bg-muted/40">
            {company.creatorName}
          </Badge>
        ) : (
          "—"
        );
      case "cnpj":
        return company.cnpj || "—";
      case "tasksStart":
        return company.tasks_start_date ? format(new Date(company.tasks_start_date), "dd/MM/yyyy") : "—";
      case "contact":
        return company.contact_name || "—";
      case "responsible": {
        const line = formatCompanySectorResponsiblesCompact(company);
        const title = formatCompanySectorResponsiblesLong(company);
        return line ? (
          <span className="text-xs leading-snug whitespace-normal break-words" title={title || undefined}>
            {line}
          </span>
        ) : (
          "—"
        );
      }
      case "regime":
        return company.regime || "—";
      case "difficulty":
        return company.difficulty_level ? (company.difficulty_level === "dificil" ? "Difícil" : "Fácil") : "—";
      case "openTasks":
        return (
          <div className="flex items-center justify-center gap-2">
            {stats.beforeTaskStart ? (
              <span className="text-gray-400 text-xs">—</span>
            ) : stats.open > 0 ? (
              <Badge variant="destructive" className="font-mono">
                {stats.open}
              </Badge>
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </div>
        );
      case "doneTasks":
        return (
          <div className="flex items-center justify-center">
            {stats.beforeTaskStart ? (
              <span className="text-gray-400 text-xs">—</span>
            ) : stats.completed > 0 ? (
              <Badge className="bg-green-100 text-green-800 font-mono">{stats.completed}</Badge>
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </div>
        );
      case "manage":
        return !isTrashMode ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
            onClick={() => onOpenTasks(company)}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            <span className="text-xs">Tarefas</span>
          </Button>
        ) : null;
      case "notes":
        return geral || mensal || anual ? (
          <div className="flex items-start gap-2 w-full min-w-0">
            <div className="min-w-0 flex-1 text-xs space-y-1.5">
              {mensal && (
                <button
                  type="button"
                  onClick={() => openNoteDialog(company, `Recado mensal (${viewM}/${viewY})`, mensal)}
                  className="w-full text-left rounded border border-transparent px-1.5 py-1 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-100 transition-colors"
                  title="Abrir recado mensal"
                >
                  <span className="text-gray-500 font-medium">Mensal ({viewM}/{viewY}):</span>{" "}
                  <span className="block truncate">{mensal}</span>
                </button>
              )}
              {anual && (
                <button
                  type="button"
                  onClick={() => openNoteDialog(company, `Recado anual (${viewY})`, anual)}
                  className="w-full text-left rounded border border-transparent px-1.5 py-1 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-100 transition-colors"
                  title="Abrir recado anual"
                >
                  <span className="text-gray-500 font-medium">Anual ({viewY}):</span>{" "}
                  <span className="block truncate">{anual}</span>
                </button>
              )}
              {geral && (
                <button
                  type="button"
                  onClick={() => openNoteDialog(company, "Recado geral", geral)}
                  className="w-full text-left rounded border border-transparent px-1.5 py-1 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-100 transition-colors"
                  title="Abrir recado geral"
                >
                  <span className="text-gray-500 font-medium">Geral:</span>{" "}
                  <span className="block truncate">{geral}</span>
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEmailCompany(company)}
              className="text-indigo-600 hover:text-indigo-700 shrink-0 mt-0.5"
              title="Enviar observações por e-mail"
            >
              <Mail className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        );
      default:
        return "—";
    }
  };

  return (
    <div className="space-y-3">
      {showColumnConfigurator ? (
      <div className="flex justify-end">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-2">
              <Columns3 className="w-4 h-4" />
              Colunas
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(92vw,500px)] p-3" align="end">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Visualização da tabela</p>
                <Button type="button" variant="ghost" size="sm" onClick={resetPrefs}>
                  Resetar
                </Button>
              </div>
              <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
                {COLUMN_DEFS.map((col) => {
                  const visible = col.alwaysVisible ? true : prefs.visible[col.key] !== false;
                  const fixed = col.defaultFixed ? prefs.fixed[col.key] !== false : prefs.fixed[col.key] === true;
                  const compact = Boolean(prefs.compact[col.key]);
                  return (
                    <div key={col.key} className="rounded-md border p-2">
                      <p className="text-xs font-medium mb-2">{col.label}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <label className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={visible}
                            disabled={col.alwaysVisible}
                            onCheckedChange={(v) => updatePref("visible", col.key, v === true)}
                          />
                          Mostrar
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={visible && fixed}
                            disabled={!visible}
                            onCheckedChange={(v) => updatePref("fixed", col.key, v === true)}
                          />
                          Fixa
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={compact}
                            disabled={!visible}
                            onCheckedChange={(v) => updatePref("compact", col.key, v === true)}
                          />
                          Minimizada
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Dica: marque como <strong>fixa</strong> a coluna que quer manter presa à esquerda e use{" "}
                <strong>minimizada</strong> para ocupar menos espaço.
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      ) : null}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className={theme === "dark" ? "border-gray-800" : ""}>
              {columns.map((col) => {
                const left = colLeftMap.get(col.key);
                return (
                  <TableHead
                    key={col.key}
                    className={cn(
                      "align-top whitespace-nowrap",
                      col.key === "edit" || col.key === "openTasks" || col.key === "doneTasks" || col.key === "manage"
                        ? "text-center"
                        : "text-left",
                      col.fixed && "border-r shadow-[2px_0_6px_-4px_rgba(0,0,0,0.2)]",
                      theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-muted/95 border-border"
                    )}
                    style={{
                      width: col.width,
                      minWidth: col.width,
                      maxWidth: col.width,
                      position: col.fixed ? "sticky" : undefined,
                      left: col.fixed ? left : undefined,
                      zIndex: col.fixed ? 30 : undefined,
                    }}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide">{col.label}</span>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((company) => (
              <TableRow
                key={company.id}
                className={cn("group", theme === "dark" ? "border-gray-800 hover:bg-gray-800/50" : "hover:bg-gray-50")}
              >
                {columns.map((col) => {
                  const left = colLeftMap.get(col.key);
                  return (
                    <TableCell
                      key={`${company.id}-${col.key}`}
                      className={cn(
                        "align-top",
                        col.key === "edit" || col.key === "openTasks" || col.key === "doneTasks" || col.key === "manage"
                          ? "text-center"
                          : "",
                        col.compact && "truncate",
                        col.fixed && "border-r shadow-[2px_0_6px_-4px_rgba(0,0,0,0.2)]",
                        col.fixed &&
                          (theme === "dark"
                            ? "bg-gray-900 group-hover:bg-gray-800/50 border-gray-800"
                            : "bg-background group-hover:bg-muted/50 border-border")
                      )}
                      style={{
                        width: col.width,
                        minWidth: col.width,
                        maxWidth: col.width,
                        position: col.fixed ? "sticky" : undefined,
                        left: col.fixed ? left : undefined,
                        zIndex: col.fixed ? 20 : undefined,
                      }}
                    >
                      {renderCell(company, col)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            {companies.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-10 text-gray-400 max-w-none w-full">
                  Nenhuma empresa encontrada
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <NotesEmailDialog
        open={!!emailCompany}
        onClose={() => setEmailCompany(null)}
        company={emailCompany}
        filterDate={filterDate}
      />

      <CompanyFilesModal
        open={!!filesCompany}
        onClose={() => setFilesCompany(null)}
        company={filesCompany}
      />

      <Dialog
        open={!!activeNote}
        onOpenChange={(open) => {
          if (!open) setActiveNote(null);
        }}
      >
        <DialogContent aria-describedby={undefined} className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{activeNote?.title || "Recado"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {activeNote?.companyName ? (
              <p className="text-sm text-muted-foreground">
                Empresa: <span className="font-medium text-foreground">{activeNote.companyName}</span>
              </p>
            ) : null}
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm whitespace-pre-wrap break-words max-h-[55vh] overflow-y-auto">
              {activeNote?.content || ""}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setActiveNote(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!folderCompany}
        onOpenChange={(open) => {
          if (!open) {
            setFolderCompany(null);
            setFolderDraft("");
          }
        }}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Caminho da pasta da empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Informe o caminho da pasta (ex.: <code>C:\Documentos\EmpresaX</code>).
            </p>
            <Input
              value={folderDraft}
              onChange={(e) => setFolderDraft(e.target.value)}
              placeholder="Cole ou digite o caminho da pasta..."
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFolderCompany(null);
                setFolderDraft("");
              }}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={saveFolderPath} className="bg-indigo-600 hover:bg-indigo-700">
              Salvar caminho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}