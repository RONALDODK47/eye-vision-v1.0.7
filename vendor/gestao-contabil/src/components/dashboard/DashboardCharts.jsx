import React from "react";
import { parseCompanyYmd } from "@/lib/companyTaskPeriod";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { GestaoPanel } from "@/components/GestaoEyeVisionChrome";
import {
  isSaidaOuBaixaStatus,
  isCompanyInPortfolioAtMonthEnd,
  isCompanyEnteredInMonth,
  countExitsInMonth,
  isExitTasksStartInMonth,
  isExitInMonth,
} from "@/lib/dashboardCompanyDates";

const COLORS = ["#6366f1", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#ec4899"];
const TICK_FILL = "#6b7280";
const GRID_STROKE = "#e5e7eb";
const TOOLTIP_STYLE = {
  backgroundColor: "#fff",
  border: "1px solid #141414",
  borderRadius: 0,
  fontSize: "11px",
  fontFamily: "JetBrains Mono, ui-monospace, monospace",
};

function ChartShell({ title, className, children }) {
  return (
    <GestaoPanel className={className}>
      <h3 className="text-[10px] font-black uppercase tracking-widest mb-3">{title}</h3>
      {children}
    </GestaoPanel>
  );
}

export function StatusPieChart({ companies }) {
  const active = companies.filter((c) => c.status === "active").length;
  const inImplantation = companies.filter((c) => c.status === "implantacao").length;
  const exited = companies.filter((c) => isSaidaOuBaixaStatus(c)).length;

  const data = [
    { name: "Ativas", value: active },
    { name: "Implantação", value: inImplantation },
    { name: "Saídas", value: exited },
  ].filter((d) => d.value > 0);

  return (
    <ChartShell title="Distribuição por Status" className="h-80 flex flex-col">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend verticalAlign="bottom" height={36} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}

export function MonthlyTrendLineChart({ companies, year, variant = "tasksVsExits" }) {
  const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const isCompaniesChart = variant === "companiesVsExits";

  const data = MONTHS.map((month, i) => {
    const entries = isCompaniesChart
      ? companies.filter((c) => isCompanyEnteredInMonth(c, year, i)).length
      : companies.filter((c) => isExitTasksStartInMonth(c, year, i)).length;

    const exits = countExitsInMonth(companies, year, i);

    const totalEmpresas = isCompaniesChart
      ? companies.filter((c) => isCompanyInPortfolioAtMonthEnd(c, year, i)).length
      : 0;

    return { month, entradas: entries, saidas: exits, totalEmpresas };
  });

  const title = isCompaniesChart
    ? `Novas cadastros, saídas e total na base — ${year}`
    : `Tarefas de saída e registros de saída/baixa — ${year}`;
  const lineName = isCompaniesChart ? "Novas empresas no mês" : "Início tarefas de saída";

  return (
    <ChartShell title={title} className={`${isCompaniesChart ? "h-[22rem]" : "h-80"} flex flex-col`}>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={isCompaniesChart ? { top: 8, right: 8, left: 0, bottom: 0 } : undefined}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: TICK_FILL }} />
            <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11, fill: TICK_FILL }} />
            {isCompaniesChart && (
              <YAxis yAxisId="right" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: "#10b981" }} />
            )}
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="entradas" stroke="#6366f1" strokeWidth={2} name={lineName} dot={{ r: 4 }} />
            <Line yAxisId="left" type="monotone" dataKey="saidas" stroke="#ef4444" strokeWidth={2} name="Saídas / baixas" dot={{ r: 4 }} />
            {isCompaniesChart && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="totalEmpresas"
                stroke="#10b981"
                strokeWidth={2}
                name="Total na base (fim do mês)"
                dot={{ r: 4 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}

export function TasksPieChart({ completed, open }) {
  const data = [
    { name: "Concluídas", value: completed },
    { name: "Em Aberto", value: open },
  ].filter((d) => d.value > 0);

  const TASK_COLORS = ["#10b981", "#f59e0b"];

  return (
    <ChartShell title="Status das Tarefas" className="h-80 flex flex-col">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" labelLine={false} outerRadius={80} fill="#8884d8" dataKey="value">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={TASK_COLORS[index % TASK_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}

export function ExitReasonsPieChart({ companies, year, month }) {
  const relevantExits = companies.filter((c) => isSaidaOuBaixaStatus(c) && isExitInMonth(c, year, month));

  const reasonsMap = {};
  relevantExits.forEach((c) => {
    const reason = c.exit_reason || "Não informado";
    reasonsMap[reason] = (reasonsMap[reason] || 0) + 1;
  });

  const data = Object.entries(reasonsMap).map(([name, value]) => ({ name, value }));

  return (
    <ChartShell title="Motivos de Saída (Mês)" className="h-80 flex flex-col">
      {data.length > 0 ? (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-full flex items-center justify-center text-[10px] font-mono opacity-50">Sem dados para exibir</div>
      )}
    </ChartShell>
  );
}

export function ImplantationMonthlyChart({ companies, year }) {
  const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  const data = MONTHS.map((month, i) => {
    const count = companies.filter((c) => {
      const d = parseCompanyYmd(c.implantation_completed_date);
      if (!d) return false;
      return d.getFullYear() === year && d.getMonth() === i;
    }).length;

    return { month, concluídas: count };
  });

  return (
    <ChartShell title={`Implantações Concluídas por Mês — ${year}`} className="h-80 flex flex-col">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: TICK_FILL }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: TICK_FILL }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="concluídas" fill="#10b981" radius={[0, 0, 0, 0]} name="Concluídas" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}

export function ExitReasonsBarChart({ items = [], title = "Motivos de Saída" }) {
  const chartData = (items || []).slice(0, 10).map((item) => ({
    ...item,
    motivo_label: item.motivo.length > 16 ? `${item.motivo.slice(0, 16)}...` : item.motivo,
  }));
  const maxValue = chartData.length > 0 ? Math.max(...chartData.map((d) => d.total || 0), 1) : 1;

  return (
    <ChartShell title={title} className="h-80 flex flex-col">
      {chartData.length > 0 ? (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis
                dataKey="motivo_label"
                tick={{ fontSize: 11, fill: TICK_FILL }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-15}
                textAnchor="end"
                height={48}
              />
              <YAxis
                allowDecimals={false}
                domain={[0, Math.max(maxValue + 1, 2)]}
                tick={{ fontSize: 11, fill: TICK_FILL }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, _name, payload) => [`${value}`, payload?.payload?.motivo || "Motivo"]}
                labelFormatter={() => "Quantidade"}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#8b5cf6"
                strokeWidth={3}
                name="Quantidade"
                dot={{ r: 5, fill: "#8b5cf6", strokeWidth: 2, stroke: "#ffffff" }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-full flex items-center justify-center text-[10px] font-mono opacity-50">Sem dados para exibir</div>
      )}
    </ChartShell>
  );
}
