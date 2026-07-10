import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { dbClient } from "@/api/dbClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, ClipboardCheck, Rocket, Ban, Building2, Shield } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatsCard from "../components/dashboard/StatsCard";
import TasksStats from "../components/dashboard/TasksStats";
import MonthPicker from "../components/MonthPicker";
import { MonthlyTrendLineChart, ImplantationMonthlyChart, ExitReasonsBarChart } from "../components/dashboard/DashboardCharts";
import CsvImportActions from "@/components/CsvImportActions";
import { getRowValue, normalizeDateInput } from "@/lib/csvUtils";
import { useCloudAccess } from "@/lib/useCloudAccess";
import { useWorkspacePeerUids } from "@/hooks/useWorkspacePeerUids";
import { fetchOfficeScopedCompaniesAndTasks } from "@/lib/dashboardOfficeData";
import { parseCompanyYmd } from "@/lib/companyTaskPeriod";
import {
  isSaidaOuBaixaStatus,
  getCompanyEntryDate,
  isExitInMonth,
  isExitInYear,
  countPortfolioAtMonthEnd,
  countEntriesInMonth,
} from "@/lib/dashboardCompanyDates";
import { GestaoPageHeader, GestaoPanel, GestaoSubTabs, gestaoNativeSelectTrigger } from "@/components/GestaoEyeVisionChrome";

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const DASHBOARD_SECTIONS = [
  { id: "empresas", label: "Empresas" },
  { id: "implantacao", label: "Implantação" },
  { id: "saidas", label: "Saídas" },
  { id: "tarefas", label: "Tarefas" },
];

const selectTriggerClass = gestaoNativeSelectTrigger;

export default function Dashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userUid = user?.uid;
  const { isAdminEmail, canEditTab, internalStaffFullAccess, isMasterUser } = useCloudAccess();
  const officeWideListing = Boolean(internalStaffFullAccess || isMasterUser);
  const canEditDashboard = canEditTab("Dashboard");
  const { officePeerUids: officeUids, stableOfficeUidsKey, officeToken } = useWorkspacePeerUids();

  const officeDataQueryKey = useMemo(
    () => ["dashboardOfficeData", userUid, officeToken, stableOfficeUidsKey],
    [userUid, officeToken, stableOfficeUidsKey]
  );
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState(String(currentMonth));
  const [dashboardSection, setDashboardSection] = useState("empresas");
  const [implantacaoPeriod, setImplantacaoPeriod] = useState("mensal");
  const [saidasPeriod, setSaidasPeriod] = useState("mensal");
  const [empresasPeriod, setEmpresasPeriod] = useState("mensal");
  const [dashboardCompanyId, setDashboardCompanyId] = useState("all");

  const { data: officeData } = useQuery({
    queryKey: [...officeDataQueryKey, officeWideListing],
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

  const companies = officeData?.companies || [];

  const year = parseInt(selectedYear);
  const month = parseInt(selectedMonth);
  const companiesForDashboard = dashboardCompanyId === "all"
    ? companies
    : companies.filter((c) => c.id === dashboardCompanyId);

  const onboardingScope = companiesForDashboard.filter(
    (c) => c.created_via === "onboarding" || c.status === "implantacao" || !!c.implantation_start_date
  );

  const inImplantation = onboardingScope.filter((c) => c.status === "implantacao");

  const exitCompanies = companiesForDashboard.filter((c) => isSaidaOuBaixaStatus(c));

  const yearExits = exitCompanies.filter((c) => isExitInYear(c, year));
  const monthExits = exitCompanies.filter((c) => isExitInMonth(c, year, month));
  const periodExits = saidasPeriod === "mensal" ? monthExits : yearExits;
  const totalSaidas = periodExits.filter((c) => String(c.status || "").toLowerCase() === "saida").length;
  const totalBaixas = periodExits.filter((c) => String(c.status || "").toLowerCase() === "baixa").length;

  const portfolioMonthIndex =
    empresasPeriod === "mensal"
      ? month
      : year < currentYear
        ? 11
        : year > currentYear
          ? 0
          : currentMonth;
  const portfolioAtPeriodEnd = countPortfolioAtMonthEnd(companiesForDashboard, year, portfolioMonthIndex);
  const newCompaniesInPeriod =
    empresasPeriod === "mensal"
      ? countEntriesInMonth(companiesForDashboard, year, month)
      : companiesForDashboard.filter((c) => {
          const entry = getCompanyEntryDate(c);
          return entry && entry.getFullYear() === year;
        }).length;
  const missingTasksStartDate = companiesForDashboard.filter((c) => !getCompanyEntryDate(c)).length;
  const reasonCounter = periodExits.reduce((acc, company) => {
    const reason = (company.exit_reason || "").trim();
    if (!reason) return acc;
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});
  const sortedReasons = Object.entries(reasonCounter).sort((a, b) => b[1] - a[1]);
  const reasonChartData = sortedReasons.map(([motivo, total]) => ({ motivo, total }));

  const companiesSaidaBaixa = exitCompanies
    .slice()
    .sort((a, b) => String(b.exit_date || "").localeCompare(String(a.exit_date || "")));

  const yearImplantations = onboardingScope.filter((c) => {
    const completed = parseCompanyYmd(c.implantation_completed_date);
    return completed && completed.getFullYear() === year;
  });
  const monthImplantations = yearImplantations.filter((c) => {
    const completed = parseCompanyYmd(c.implantation_completed_date);
    return completed && completed.getMonth() === month;
  });

  const years = [];
  for (let y = currentYear - 3; y <= currentYear + 1; y++) years.push(String(y));

  const periodFilterRow = (label, periodValue, onPeriodChange, showMonthPicker, showYearSelect) => (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-[10px] font-black uppercase tracking-widest opacity-50">{label}</span>
      <Select value={periodValue} onValueChange={onPeriodChange}>
        <SelectTrigger className={`w-[140px] ${selectTriggerClass}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mensal">Mensalmente</SelectItem>
          <SelectItem value="anual">Anualmente</SelectItem>
        </SelectContent>
      </Select>
      {showMonthPicker ? (
        <MonthPicker
          date={new Date(year, month)}
          onChange={(d) => {
            setSelectedMonth(String(d.getMonth()));
            setSelectedYear(String(d.getFullYear()));
          }}
        />
      ) : null}
      {showYearSelect ? (
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className={`w-[120px] ${selectTriggerClass}`}>
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
      ) : null}
    </div>
  );

  const handleImportDashboard = async (rows) => {
    const uid = userUid;
    if (!uid) {
      throw new Error("Você precisa estar logado para importar.");
    }
    if (!canEditDashboard) {
      throw new Error("Você não tem permissão para importar empresas no Dashboard.");
    }

    const byCode = new Map(
      companies
        .filter((c) => c.code)
        .map((c) => [String(c.code).trim().toLowerCase(), c])
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const today = new Date().toISOString().split("T")[0];

    for (const row of rows) {
      const code = getRowValue(row, ["codigo", "código", "code"]);
      const name = getRowValue(row, ["nome", "empresa", "name"]);
      if (!name) {
        skipped += 1;
        continue;
      }

      const statusRaw = getRowValue(row, ["status"], "active").toLowerCase();
      const status = ["active", "implantacao", "saida", "baixa"].includes(statusRaw) ? statusRaw : "active";

      const payload = {
        code,
        name,
        status,
        tasks_start_date:
          normalizeDateInput(
            getRowValue(row, ["inicio_tarefas", "tasks_start_date", "data_entrada", "entry_date"])
          ) || today,
        exit_date: normalizeDateInput(getRowValue(row, ["data_saida", "exit_date"])),
        exit_reason: getRowValue(row, ["motivo_saida", "exit_reason"]),
      };

      const existing = code ? byCode.get(String(code).trim().toLowerCase()) : null;
      if (existing) {
        await dbClient.entities.Company.update(existing.id, payload);
        updated += 1;
      } else {
        const createPayload = { ...payload, uid };
        if (officeToken) createPayload.assigned_company_token = officeToken;
        await dbClient.entities.Company.create(createPayload);
        created += 1;
      }
    }

    await queryClient.invalidateQueries({ queryKey: ["companies"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboardOfficeData"] });
    return {
      message: `Importação concluída: ${created} criadas, ${updated} atualizadas, ${skipped} ignoradas.`,
    };
  };

  return (
    <div className="space-y-6">
          <GestaoPageHeader
            title="Dashboard"
            subtitle="Visão do controle empresarial"
            actions={
              <>
                <Select value={dashboardCompanyId} onValueChange={setDashboardCompanyId}>
                  <SelectTrigger className={`w-[260px] ${selectTriggerClass}`}>
                    <SelectValue placeholder="Filtrar por empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Empresas</SelectItem>
                    {companies
                      .slice()
                      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                      .map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <CsvImportActions
                  templateFileName="modelo_dashboard.csv"
                  templateHeaders={["codigo", "nome", "status", "data_entrada", "data_saida", "motivo_saida"]}
                  templateRows={[["101", "Empresa Exemplo", "active", "2026-03-10", "", ""]]}
                  onImportRows={handleImportDashboard}
                />
              </>
            }
          />

          {isAdminEmail && (
            <GestaoPanel className="flex items-start gap-3 border-brand-border bg-brand-sidebar/20">
              <Shield className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <p className="text-[10px] font-mono leading-relaxed">
                <span className="font-black uppercase">Conta administrador bootstrap.</span> Nesta aba vê só o seu
                escopo (como as demais abas operacionais). Gestão global de tokens e clientes fica em{" "}
                <strong>Administrador</strong> e <strong>Configurações</strong>.
              </p>
            </GestaoPanel>
          )}

          <GestaoSubTabs
            tabs={DASHBOARD_SECTIONS}
            value={dashboardSection}
            onChange={setDashboardSection}
            ariaLabel="Secções do dashboard"
          />

          {dashboardSection === "empresas" && (
            <div className="space-y-6">
              {periodFilterRow(
                "Analisar",
                empresasPeriod,
                setEmpresasPeriod,
                empresasPeriod === "mensal",
                empresasPeriod === "anual",
              )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatsCard
              title={empresasPeriod === "mensal" ? "Na base (fim do mês)" : "Na base (fim do ano)"}
              value={portfolioAtPeriodEnd}
              icon={Building2}
              color="green"
              subtitle={
                empresasPeriod === "mensal"
                  ? `${MONTH_NAMES[month]} ${year} — com início das tarefas até este mês`
                  : year === currentYear
                    ? `${year} — até ${MONTH_NAMES[currentMonth]} (ano em curso)`
                    : `${year} — posição em 31/dez`
              }
            />
            <StatsCard
              title={empresasPeriod === "mensal" ? "Novas no mês" : "Novas no ano"}
              value={newCompaniesInPeriod}
              icon={Rocket}
              color="blue"
              subtitle={
                empresasPeriod === "mensal"
                  ? `Início das tarefas em ${MONTH_NAMES[month]} ${year}`
                  : `Primeira contagem no ano ${year}`
              }
            />
            <StatsCard
              title="Cadastro atual (sistema)"
              value={companiesForDashboard.length}
              icon={Building2}
              color="purple"
              subtitle={
                missingTasksStartDate > 0
                  ? `${missingTasksStartDate} sem data de início — não entram nos totais por período`
                  : "Todas no escopo do escritório"
              }
            />
          </div>
          <MonthlyTrendLineChart companies={companiesForDashboard} year={year} variant="companiesVsExits" />
          <p className="text-[10px] font-mono opacity-50 leading-relaxed">
            Contagem por <strong className="font-bold">início das tarefas</strong> e{" "}
            <strong className="font-bold">data de saída</strong> (aba Empresas). Saída/baixa sem data de saída não
            entra no total do mês. Gráfico: azul = novas; vermelho = saídas no mês; verde = carteira ao fim do mês.
          </p>
            </div>
          )}

          {dashboardSection === "implantacao" && (
            <div className="space-y-6">
              {periodFilterRow(
                "Analisar",
                implantacaoPeriod,
                setImplantacaoPeriod,
                implantacaoPeriod === "mensal",
                implantacaoPeriod === "anual",
              )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatsCard title="Em Andamento" value={inImplantation.length} icon={Rocket} color="orange" subtitle="Atualmente implantando" />
            <StatsCard
              title={implantacaoPeriod === "mensal" ? "Concluídas (Mês)" : "Concluídas (Ano)"}
              value={implantacaoPeriod === "mensal" ? monthImplantations.length : yearImplantations.length}
              icon={ClipboardCheck}
              color="emerald"
              subtitle={implantacaoPeriod === "mensal" ? MONTH_NAMES[month] : String(year)}
            />
          </div>
          <ImplantationMonthlyChart companies={onboardingScope} year={year} />
          <GestaoPanel>
            <h3 className="text-[10px] font-black uppercase tracking-widest mb-3">Progresso de Implantação</h3>
            <p className="text-[10px] font-mono opacity-50 mb-4">
              {implantacaoPeriod === "mensal"
                ? `Empresas que concluíram em ${MONTH_NAMES[month]}:`
                : `Empresas que concluíram em ${year}:`}
            </p>
            {(implantacaoPeriod === "mensal" ? monthImplantations : yearImplantations).length > 0 ? (
              <ul className="space-y-2">
                {(implantacaoPeriod === "mensal" ? monthImplantations : yearImplantations).map((c) => (
                  <li
                    key={c.id}
                    className="flex justify-between gap-3 text-[10px] font-mono p-2 border border-brand-border/20 bg-brand-sidebar/10"
                  >
                    <span>{c.name}</span>
                    <span className="font-bold text-emerald-800">{c.implantation_completed_date}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10px] font-mono opacity-50">
                {implantacaoPeriod === "mensal"
                  ? "Nenhuma implantação concluída neste mês."
                  : "Nenhuma implantação concluída neste ano."}
              </p>
            )}
          </GestaoPanel>
            </div>
          )}

          {dashboardSection === "saidas" && (
            <div className="space-y-6">
              {periodFilterRow(
                "Analisar",
                saidasPeriod,
                setSaidasPeriod,
                saidasPeriod === "mensal",
                saidasPeriod === "anual",
              )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatsCard
              title={saidasPeriod === "mensal" ? "Saídas no mês" : "Saídas no ano"}
              value={totalSaidas}
              icon={LogOut}
              color="amber"
              subtitle={saidasPeriod === "mensal" ? `${MONTH_NAMES[month]} ${year}` : String(year)}
            />
            <StatsCard
              title={saidasPeriod === "mensal" ? "Baixas no mês" : "Baixas no ano"}
              value={totalBaixas}
              icon={Ban}
              color="red"
              subtitle={saidasPeriod === "mensal" ? `${MONTH_NAMES[month]} ${year}` : String(year)}
            />
            <StatsCard
              title={saidasPeriod === "mensal" ? "Total de Saídas e Baixas no Mês" : "Total de Saídas e Baixas no Ano"}
              value={saidasPeriod === "mensal" ? monthExits.length : yearExits.length}
              icon={LogOut}
              color="blue"
              subtitle={saidasPeriod === "mensal" ? `${MONTH_NAMES[month]} ${year}` : String(year)}
            />
          </div>
          <GestaoPanel className="inline-block w-fit max-w-full">
            <h3 className="text-[10px] font-black uppercase tracking-widest mb-2">Motivos por Quantidade</h3>
            <p className="text-[10px] font-mono opacity-50 mb-4">
              {saidasPeriod === "mensal"
                ? `Período: ${MONTH_NAMES[month]} ${year}`
                : `Período: ${year}`}
            </p>
            {sortedReasons.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                {sortedReasons.map(([motivo, total]) => (
                  <div
                    key={motivo}
                    className="flex items-start justify-between gap-3 px-3 py-2 border border-brand-border/20 bg-brand-sidebar/10"
                  >
                    <span className="text-[10px] font-mono break-words">{motivo}</span>
                    <span className="text-[10px] font-black shrink-0">{total}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] font-mono opacity-50">Nenhum motivo registrado no período.</p>
            )}
          </GestaoPanel>

          <GestaoPanel>
            <h3 className="text-[10px] font-black uppercase tracking-widest mb-2">Empresas em saída ou baixa</h3>
            <p className="text-[10px] font-mono opacity-50 mb-4">
              Marcadas na aba <strong className="font-bold">Empresas</strong> como Saída ou Baixa. Abra as tarefas para
              criar o checklist de encerramento.
            </p>
            {companiesSaidaBaixa.length > 0 ? (
              <ul className="space-y-2 max-h-72 overflow-auto pr-1">
                {companiesSaidaBaixa.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border border-brand-border/20 bg-brand-sidebar/10"
                  >
                    <div className="min-w-0">
                      <span className="text-[10px] font-black uppercase block truncate">{c.name}</span>
                      <span className="text-[9px] font-mono opacity-50">
                        {c.status === "baixa" ? "Baixa" : "Saída"}
                        {c.exit_date ? ` · Saída em ${c.exit_date}` : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="technical-button text-[9px] py-1 px-3 shrink-0"
                      onClick={() => navigate("/Companies", { state: { openTasksForCompanyId: c.id } })}
                    >
                      Tarefas de saída
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10px] font-mono opacity-50">Nenhuma empresa em saída ou baixa no momento.</p>
            )}
          </GestaoPanel>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <MonthlyTrendLineChart companies={companiesForDashboard} year={year} />
            <ExitReasonsBarChart
              items={reasonChartData}
              title={saidasPeriod === "mensal" ? `Gráfico de Motivos (${MONTH_NAMES[month]})` : `Gráfico de Motivos (${year})`}
            />
          </div>
            </div>
          )}

          {dashboardSection === "tarefas" && (
            <GestaoPanel className="space-y-4">
              <div>
                <h2 className="text-[10px] font-black uppercase tracking-widest">Estatísticas de Tarefas</h2>
                <p className="text-[10px] font-mono opacity-50 mt-1">
                  Analisar: Mensalmente ou Anualmente (use o seletor abaixo)
                </p>
              </div>
              <TasksStats forcedCompanyId={dashboardCompanyId} />
            </GestaoPanel>
          )}
    </div>
  );
}
