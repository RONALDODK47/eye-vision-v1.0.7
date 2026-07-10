import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dbClient } from "@/api/dbClient";
import { useAuth } from "@/lib/AuthContext";
import { useCloudAccess } from "@/lib/useCloudAccess";
import { useWorkspacePeerUids } from "@/hooks/useWorkspacePeerUids";
import { mergeIndexedDocs } from "@/lib/officeWorkspacePeers";
import { useTheme } from "@/components/ThemeProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown,
  Building2,
  Users as UsersIcon,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  CalendarRange,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isMonthBeforeAccountingTasksStart, isMonthlyTaskInPeriodScope } from "@/lib/companyTaskPeriod";
import { getMonthlyNote, getAnnualNote } from "@/lib/companyObservations";

function shortUid(uid) {
  if (!uid) return "—";
  return uid.length > 10 ? `${uid.slice(0, 8)}…` : uid;
}

function userLabel(row) {
  const p = row.profile;
  if (p?.display_name?.trim()) return p.display_name.trim();
  const em = p?.email?.trim();
  if (em && !em.endsWith("@gestao.local")) return em;
  if (em) return em.split("@")[0] || shortUid(row.uid);
  return shortUid(row.uid);
}

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

/** Tarefas mensais no período: total esperado e concluídas (igual lógica do dashboard). */
function companyMonthlyTaskProgress(company, companyTasks, year, month) {
  let total = 0;
  let completed = 0;
  for (const t of companyTasks) {
    if (t.frequency !== "mensal") continue;
    if (!isMonthlyTaskInPeriodScope(t, year, month)) continue;
    if (isMonthBeforeAccountingTasksStart(company, year, month)) continue;
    total += 1;
    if (isMonthlyTaskCompletedInPeriod(t, year, month)) completed += 1;
  }
  const pct = total === 0 ? null : Math.round((completed / total) * 100);
  return { total, completed, pct };
}

function tasksByCompanyId(tasks) {
  const m = new Map();
  for (const t of tasks) {
    if (!t.company_id) continue;
    if (!m.has(t.company_id)) m.set(t.company_id, []);
    m.get(t.company_id).push(t);
  }
  return m;
}

function userMonthlyRollup(companies, tasks, year, month) {
  const map = tasksByCompanyId(tasks);
  let total = 0;
  let completed = 0;
  for (const c of companies) {
    if (c.status !== "active") continue;
    const { total: tt, completed: cc } = companyMonthlyTaskProgress(c, map.get(c.id) || [], year, month);
    total += tt;
    completed += cc;
  }
  const pct = total === 0 ? null : Math.round((completed / total) * 100);
  return { total, completed, pct };
}

function parseSearchTerms(raw) {
  return String(raw || "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function termMatchesCompany(c, term) {
  const nameCode = `${c.name || ""} ${c.code || ""}`.toLowerCase();
  if (nameCode.includes(term)) return true;
  const cnpjDigits = String(c.cnpj || "").replace(/\D/g, "");
  const termDigits = term.replace(/\D/g, "");
  if (termDigits.length >= 2 && cnpjDigits.includes(termDigits)) return true;
  return false;
}

function termMatchesUserRow(row, term) {
  return userLabel(row).toLowerCase().includes(term);
}

export default function Users() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const userUid = user?.uid;
  const { isAdminEmail, isMasterUser, internalStaffFullAccess } = useCloudAccess();
  const canUseUsersDirectory = Boolean(isAdminEmail || isMasterUser || internalStaffFullAccess);
  const { officePeerUids, officeToken } = useWorkspacePeerUids();
  const [search, setSearch] = useState("");
  const [openUid, setOpenUid] = useState(null);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState(String(currentMonth));

  const year = parseInt(selectedYear, 10);
  const month = parseInt(selectedMonth, 10);

  const monthLabel = useMemo(() => {
    if (!Number.isFinite(year) || !Number.isFinite(month)) return "";
    const s = new Date(year, month - 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [year, month]);

  const handlePreviousMonth = () => {
    let m = month - 1;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    setSelectedMonth(String(m));
    setSelectedYear(String(y));
  };

  const handleNextMonth = () => {
    let m = month + 1;
    let y = year;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setSelectedMonth(String(m));
    setSelectedYear(String(y));
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["usersDirectory", userUid, officeToken, officePeerUids.join(",")],
    queryFn: async () => {
      const uidList = officePeerUids.length ? officePeerUids : userUid ? [userUid] : [];
      const userOfficeToken = String(officeToken || "").trim();
      const profiles = (
        await Promise.all(
          uidList.map(async (u) => {
            const data = await dbClient.entities.UserProfile.getByUid(u);
            if (!data || typeof data !== "object") return null;
            return { id: u, uid: u, ...data };
          })
        )
      ).filter(Boolean);
      const [companies, tasks] = await Promise.all([
        mergeIndexedDocs((u) => dbClient.entities.Company.list(u), uidList),
        mergeIndexedDocs((u) => dbClient.entities.CompanyTask.list(u), uidList),
      ]);
      const companiesScoped = companies.filter((c) => {
        const companyToken = String(c.assigned_company_token || "").trim();
        if (companyToken && userOfficeToken) return companyToken === userOfficeToken;
        if (companyToken && !userOfficeToken) return false;
        return uidList.includes(String(c.uid || "").trim());
      });
      const companyIds = new Set(companiesScoped.map((c) => c.id));
      const tasksScoped = tasks.filter(
        (t) => companyIds.has(t.company_id) || uidList.includes(String(t.uid || "").trim())
      );
      return { profiles, companies: companiesScoped, tasks: tasksScoped };
    },
    enabled: Boolean(userUid && canUseUsersDirectory),
    retry: false,
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const uidSet = new Set();
    data.profiles.forEach((p) => {
      if (p.uid) uidSet.add(p.uid);
    });
    data.companies.forEach((c) => {
      if (c.uid) uidSet.add(c.uid);
    });
    data.tasks.forEach((t) => {
      if (t.uid) uidSet.add(t.uid);
    });
    const profileByUid = Object.fromEntries(
      data.profiles.filter((p) => p.uid).map((p) => [p.uid, p])
    );
    const list = Array.from(uidSet).map((uid) => {
      const companies = data.companies
        .filter((c) => c.uid === uid)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
      const tasks = data.tasks.filter((t) => t.uid === uid);
      return {
        uid,
        profile: profileByUid[uid],
        companies,
        tasks,
      };
    });
    list.sort((a, b) => userLabel(a).localeCompare(userLabel(b), "pt-BR"));
    return list;
  }, [data]);

  /** Cada linha: mesmos dados do usuário + listas exibidas (filtradas por empresa quando a busca citar empresa). */
  const filtered = useMemo(() => {
    const terms = parseSearchTerms(search);

    return rows
      .map((row) => {
        let displayCompanies = row.companies;
        let displayTasks = row.tasks;

        if (terms.length > 0) {
          const anyUser = terms.some((t) => termMatchesUserRow(row, t));
          const anyCompany = terms.some((t) => row.companies.some((c) => termMatchesCompany(c, t)));

          if (anyCompany) {
            displayCompanies = row.companies.filter((c) => terms.some((t) => termMatchesCompany(c, t)));
            const idSet = new Set(displayCompanies.map((c) => c.id));
            displayTasks = row.tasks.filter((t) => idSet.has(t.company_id));
          }

          if (!anyUser && !anyCompany) {
            return null;
          }
        }

        return {
          ...row,
          displayCompanies,
          displayTasks,
        };
      })
      .filter(Boolean);
  }, [rows, search]);

  if (!canUseUsersDirectory) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className={theme === "dark" ? "p-8 bg-gray-900 border-gray-800" : "p-8"}>
          <CardTitle className="text-center mb-2">Acesso restrito</CardTitle>
          <CardDescription className="text-center">
            O diretório de utilizadores é só para administrador ou equipa interna do escritório.
          </CardDescription>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <UsersIcon className="w-7 h-7 text-indigo-600" />
          Usuários
        </h1>
        <p className={cn("text-sm mt-1", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
          Observações <strong>mensais</strong> valem só para o mês/ano selecionado; <strong>anuais</strong> só para o
          ano selecionado; <strong>gerais</strong> são únicas por empresa (não mudam com o calendário).
        </p>
      </div>

      <Card className={theme === "dark" ? "border-gray-700 bg-gray-800/50" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarRange className="w-4 h-4" />
            Período para conclusão e observações
          </CardTitle>
          <CardDescription>
            A porcentagem usa as tarefas <strong>mensais</strong> ativas por empresa (mesma regra do painel). As
            observações seguem o período: <strong>mensal</strong> para {monthLabel}, <strong>anual</strong> para{" "}
            {year}, <strong>geral</strong> sem filtro de data.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button variant="outline" size="icon" type="button" onClick={handlePreviousMonth}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div
              className={cn(
                "px-4 py-2 rounded-md min-w-[200px] text-center text-sm font-medium",
                theme === "dark" ? "bg-gray-900 text-white border border-gray-700" : "bg-gray-900 text-white"
              )}
            >
              {monthLabel}
            </div>
            <Button variant="outline" size="icon" type="button" onClick={handleNextMonth}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => {
                setSelectedMonth(String(currentMonth));
                setSelectedYear(String(currentYear));
              }}
              title="Mês atual"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card className={theme === "dark" ? "border-gray-700 bg-gray-800/50" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Buscar</CardTitle>
          <CardDescription>
            <strong>Usuário</strong> (nome exibido) ou <strong>empresa</strong> (nome, código ou CNPJ). Vários critérios:
            separe com <strong>vírgula</strong> (ex.: <code className="text-xs">POLO SUL, Maria</code>). Se algum
            trecho bater em <strong>empresa</strong>, só aparecem as empresas encontradas (e o usuário dono).
          </CardDescription>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="Ex.: POLO SUL, outra empresa, nome do usuário…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
      </Card>

      {isLoading && (
        <p className={cn("text-sm", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
          Carregando…
        </p>
      )}

      {isError && (
        <Card className="border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800">
          <CardContent className="pt-6 text-sm text-red-800 dark:text-red-200">
            Não foi possível carregar a visão de usuários. Se o erro for de permissão, publique as novas regras do
            Firestore (`firebase deploy --only firestore`) e tente de novo.
            <pre className="mt-2 text-xs whitespace-pre-wrap opacity-90">{String(error?.message || error)}</pre>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <p className={cn("text-sm", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
          Nenhum usuário encontrado.
        </p>
      )}

      <div className="space-y-3">
        {filtered.map((row) => {
          const open = openUid === row.uid;
          const email = row.profile?.email;
          const lastSeen = row.profile?.last_seen_at;
          const { displayCompanies, displayTasks } = row;
          const taskMap = tasksByCompanyId(displayTasks);
          const rollup = userMonthlyRollup(displayCompanies, displayTasks, year, month);
          const companyFilterActive =
            displayCompanies.length < row.companies.length && row.companies.length > 0;

          return (
            <Collapsible
              key={row.uid}
              open={open}
              onOpenChange={(next) => setOpenUid(next ? row.uid : null)}
            >
              <Card className={theme === "dark" ? "border-gray-700 bg-gray-800/40" : ""}>
                <CollapsibleTrigger className="w-full text-left">
                  <CardHeader className="flex flex-row items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-lg truncate">{userLabel(row)}</CardTitle>
                      <CardDescription className="truncate">
                        {email || `ID: ${shortUid(row.uid)}`}
                        {lastSeen && (
                          <span className="block text-[11px] mt-0.5">
                            Último acesso: {new Date(lastSeen).toLocaleString("pt-BR")}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-2">
                        {rollup.pct != null && (
                          <Badge
                            className={cn(
                              "gap-1 tabular-nums",
                              rollup.pct >= 80
                                ? "bg-emerald-600 hover:bg-emerald-600"
                                : rollup.pct >= 50
                                  ? "bg-amber-600 hover:bg-amber-600"
                                  : "bg-rose-600 hover:bg-rose-600"
                            )}
                          >
                            {rollup.pct}% mês
                          </Badge>
                        )}
                        <Badge variant="secondary" className="gap-1" title={companyFilterActive ? "Empresas após filtro de busca" : undefined}>
                          <Building2 className="w-3 h-3" />
                          {displayCompanies.length}
                          {companyFilterActive ? ` / ${row.companies.length}` : ""}
                        </Badge>
                        <ChevronDown
                          className={cn("w-5 h-5 transition-transform", open ? "rotate-180" : "")}
                        />
                      </div>
                      {rollup.pct != null && (
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">
                          {rollup.completed}/{rollup.total} tarefas mensais (empresas ativas)
                        </span>
                      )}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-4 space-y-4 border-t border-gray-200 dark:border-gray-700">
                    {rollup.pct != null && (
                      <div className="space-y-1 pt-2">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                          Conclusão geral no período ({monthLabel})
                        </p>
                        <Progress value={rollup.pct} className="h-2" />
                      </div>
                    )}

                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        Empresas ({displayCompanies.length}
                        {companyFilterActive ? ` de ${row.companies.length} no total` : ""})
                      </h3>
                      {companyFilterActive && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 mb-2">
                          Lista filtrada pela busca: apenas empresas que coincidem com os termos.
                        </p>
                      )}
                      {displayCompanies.length === 0 ? (
                        <p className="text-xs text-gray-500">
                          {row.companies.length === 0
                            ? "Nenhuma empresa cadastrada para este usuário."
                            : "Nenhuma empresa coincide com a busca neste usuário."}
                        </p>
                      ) : (
                        <ScrollArea className="h-[min(420px,65vh)] rounded-md border border-gray-200 dark:border-gray-700 p-3">
                          <ul className="text-sm space-y-4">
                            {displayCompanies.map((c) => {
                              const prog = companyMonthlyTaskProgress(c, taskMap.get(c.id) || [], year, month);
                              const notesMonthly = String(getMonthlyNote(c, year, month) || "").trim();
                              const notesAnnual = String(getAnnualNote(c, year) || "").trim();
                              const notesGeneral = String(c.notes || "").trim();
                              return (
                                <li
                                  key={c.id}
                                  className={cn(
                                    "rounded-lg border p-3 space-y-2",
                                    theme === "dark" ? "border-gray-700 bg-gray-900/40" : "border-gray-200 bg-gray-50/80"
                                  )}
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{c.name || "Sem nome"}</span>
                                    {c.code && (
                                      <span className="text-gray-500 dark:text-gray-400 text-xs">Cód. {c.code}</span>
                                    )}
                                    {c.status && (
                                      <Badge variant="outline" className="text-[10px] py-0">
                                        {c.status}
                                      </Badge>
                                    )}
                                  </div>

                                  <div className="space-y-1">
                                    <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                      Conclusão (tarefas mensais · {monthLabel})
                                    </p>
                                    {prog.total === 0 ? (
                                      <p className="text-xs text-gray-500">
                                        {c.status !== "active"
                                          ? "Sem tarefas mensais no período ou empresa inativa."
                                          : "Nenhuma tarefa mensal aplicável neste mês (fora do início contábil ou sem tarefas)."}
                                      </p>
                                    ) : (
                                      <>
                                        <div className="flex items-center justify-between gap-2 text-xs">
                                          <span className="text-gray-600 dark:text-gray-400">
                                            {prog.completed} de {prog.total} concluídas
                                          </span>
                                          <span className="font-semibold tabular-nums">{prog.pct}%</span>
                                        </div>
                                        <Progress value={prog.pct} className="h-1.5" />
                                      </>
                                    )}
                                  </div>

                                  <div className="space-y-3 pt-1 border-t border-gray-200/80 dark:border-gray-700/80">
                                    <div className="space-y-1">
                                      <p className="text-xs font-medium flex items-center gap-1 text-gray-600 dark:text-gray-300">
                                        <StickyNote className="w-3.5 h-3.5" />
                                        Observação mensal ({monthLabel})
                                      </p>
                                      {notesMonthly ? (
                                        <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                                          {notesMonthly}
                                        </p>
                                      ) : (
                                        <p className="text-xs text-gray-500 italic">Nenhuma observação neste mês.</p>
                                      )}
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-xs font-medium flex items-center gap-1 text-gray-600 dark:text-gray-300">
                                        <StickyNote className="w-3.5 h-3.5 opacity-80" />
                                        Observação anual ({year})
                                      </p>
                                      {notesAnnual ? (
                                        <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                                          {notesAnnual}
                                        </p>
                                      ) : (
                                        <p className="text-xs text-gray-500 italic">Nenhuma observação para este ano.</p>
                                      )}
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-xs font-medium flex items-center gap-1 text-gray-600 dark:text-gray-300">
                                        <StickyNote className="w-3.5 h-3.5 opacity-70" />
                                        Observação geral
                                      </p>
                                      <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">
                                        Permanente no cadastro (não depende de mês nem ano).
                                      </p>
                                      {notesGeneral ? (
                                        <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                                          {notesGeneral}
                                        </p>
                                      ) : (
                                        <p className="text-xs text-gray-500 italic">Nenhuma observação geral.</p>
                                      )}
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </ScrollArea>
                      )}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
