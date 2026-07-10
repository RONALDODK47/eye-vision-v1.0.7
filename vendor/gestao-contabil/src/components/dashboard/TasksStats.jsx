import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { useCloudAccess } from "@/lib/useCloudAccess";
import { useWorkspacePeerUids } from "@/hooks/useWorkspacePeerUids";
import { fetchOfficeScopedCompaniesAndTasks } from "@/lib/dashboardOfficeData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import StatsCard from "./StatsCard";
import { CheckCircle, Circle, ChevronLeft, ChevronRight, X } from "lucide-react";
import { TasksPieChart } from "./DashboardCharts";
import { isMonthBeforeAccountingTasksStart, isMonthlyTaskInPeriodScope } from "@/lib/companyTaskPeriod";

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

function isAnnualTaskCompletedInPeriod(task, year) {
  if (task.frequency !== "anual" || !task.completed) return false;
  const completedDate = parseTaskDate(task.completed_date);
  if (!completedDate) return true;
  return completedDate.getFullYear() === year;
}

function isAnnualTaskInScope(task, year) {
  if (task.frequency !== "anual") return false;
  const completedDate = parseTaskDate(task.completed_date);
  if (task.completed && completedDate && completedDate.getFullYear() !== year) return false;
  return true;
}

export default function TasksStats({ forcedCompanyId = "all" }) {
  const { user } = useAuth();
  const userUid = user?.uid;
  const { internalStaffFullAccess, isMasterUser } = useCloudAccess();
  const officeWideListing = Boolean(internalStaffFullAccess || isMasterUser);
  const { officePeerUids: officeUids, stableOfficeUidsKey, officeToken } = useWorkspacePeerUids();

  const officeDataQueryKey = useMemo(
    () => ["dashboardOfficeData", userUid, officeToken, stableOfficeUidsKey, officeWideListing],
    [userUid, officeToken, stableOfficeUidsKey, officeWideListing]
  );

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [viewMode, setViewMode] = useState("monthly-total"); // monthly-total, monthly-company, annual-total, annual-company
  const [selectedMonth, setSelectedMonth] = useState(String(currentMonth));
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  const { data: officeData } = useQuery({
    queryKey: officeDataQueryKey,
    queryFn: () =>
      fetchOfficeScopedCompaniesAndTasks({
        userUid,
        officePeerUids: officeUids,
        officeToken,
        officeWideListing,
      }),
    enabled: Boolean(userUid),
    retry: false,
  });

  const companies = useMemo(() => {
    const list = officeData?.companies || [];
    return [...list].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" })
    );
  }, [officeData?.companies]);

  const tasks = officeData?.tasks || [];

  const handlePreviousMonth = () => {
    let month = parseInt(selectedMonth) - 1;
    let year = parseInt(selectedYear);
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    setSelectedMonth(String(month));
    setSelectedYear(String(year));
  };

  const handleNextMonth = () => {
    let month = parseInt(selectedMonth) + 1;
    let year = parseInt(selectedYear);
    if (month > 12) {
      month = 1;
      year += 1;
    }
    setSelectedMonth(String(month));
    setSelectedYear(String(year));
  };

  const isForcedCompany = forcedCompanyId && forcedCompanyId !== "all";

  const getStats = () => {
    const month = parseInt(selectedMonth);
    const year = parseInt(selectedYear);
    
    const relevantCompanies = companies.filter(c => c.status === 'active');
    const companyIds = new Set(relevantCompanies.map(c => c.id));
    const companyById = new Map(relevantCompanies.map((c) => [c.id, c]));

    let allRelevantTasks = tasks.filter(t => companyIds.has(t.company_id));
    
    if (viewMode.includes("company") && selectedCompanyId) {
      allRelevantTasks = allRelevantTasks.filter((t) => t.company_id === selectedCompanyId);
    }
    if (isForcedCompany) {
      allRelevantTasks = allRelevantTasks.filter((t) => t.company_id === forcedCompanyId);
    }

    let completedCount = 0;
    let openCount = 0;
    const companyProgress = new Map();

    if (viewMode.includes("monthly")) {
      allRelevantTasks.forEach(t => {
        if (t.frequency !== "mensal") return;
        if (!isMonthlyTaskInPeriodScope(t, year, month)) return;

        const co = companyById.get(t.company_id);
        if (co && isMonthBeforeAccountingTasksStart(co, year, month)) return;

        const isCompletedInMonth = isMonthlyTaskCompletedInPeriod(t, year, month);
        if (!companyProgress.has(t.company_id)) {
          companyProgress.set(t.company_id, { total: 0, completed: 0 });
        }
        const progress = companyProgress.get(t.company_id);
        progress.total += 1;

        if (isCompletedInMonth) {
          completedCount++;
          progress.completed += 1;
        } else {
          openCount++;
        }
      });
    } else {
      allRelevantTasks.forEach(t => {
        if (!isAnnualTaskInScope(t, year)) return;

        if (!companyProgress.has(t.company_id)) {
          companyProgress.set(t.company_id, { total: 0, completed: 0 });
        }
        const progress = companyProgress.get(t.company_id);
        progress.total += 1;

        if (isAnnualTaskCompletedInPeriod(t, year)) {
          completedCount++;
          progress.completed += 1;
        } else {
          openCount++;
        }
      });
    }

    const completedCompanies = Array.from(companyProgress.values()).filter(
      (p) => p.total > 0 && p.completed === p.total
    ).length;

    return {
      completed: completedCount,
      open: openCount,
      completedCompanies,
    };
  };

  const { completed, open, completedCompanies } = getStats();
  const total = completed + open;
  const _percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  const years = [];
  for (let y = currentYear - 2; y <= currentYear + 1; y++) years.push(String(y));

  const monthName = viewMode.includes("monthly")
    ? new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1).toLocaleString("pt-BR", {
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-start sm:items-center">
        <Select value={viewMode} onValueChange={setViewMode}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly-total">Mensal Total</SelectItem>
            <SelectItem value="monthly-company">Mensal por Empresa</SelectItem>
            <SelectItem value="annual-total">Anual Total</SelectItem>
            <SelectItem value="annual-company">Anual por Empresa</SelectItem>
          </SelectContent>
        </Select>

        {viewMode.includes("monthly") && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePreviousMonth}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="px-4 py-2 bg-gray-800 text-white rounded-md min-w-40 text-center text-sm font-medium">
              {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
            </div>
            <Button variant="outline" size="icon" onClick={handleNextMonth}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => {
              setSelectedMonth(String(currentMonth));
              setSelectedYear(String(currentYear));
            }} title="Voltar ao mês atual">
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {!viewMode.includes("monthly") && (
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {viewMode.includes("company") && !isForcedCompany && (
          <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Selecione empresa" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatsCard
            title="Tarefas Concluídas"
            value={completed}
            icon={CheckCircle}
            color="green"
            subtitle={`Finalizadas em ${viewMode.includes("monthly") ? monthName.toLowerCase() : selectedYear}`}
          />
          <StatsCard
            title="Empresas Concluídas"
            value={completedCompanies}
            icon={Circle}
            color="blue"
            subtitle="Com todas as tarefas concluídas"
          />
        </div>
        <div className="lg:col-span-1">
          <TasksPieChart completed={completed} open={open} />
        </div>
      </div>
    </div>
  );
}