import React from "react";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useTheme } from "../ThemeProvider";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function MonthlyChart({ companies, year }) {
  const { theme } = useTheme();

  const data = MONTHS.map((month, i) => {
    const entries = companies.filter((c) => {
      if (!c.tasks_start_date) return false;
      const d = new Date(c.tasks_start_date);
      return d.getFullYear() === year && d.getMonth() === i;
    }).length;

    const exits = companies.filter((c) => {
      if (!c.exit_date || c.status === "active") return false;
      const d = new Date(c.exit_date);
      return d.getFullYear() === year && d.getMonth() === i;
    }).length;

    return { month, entradas: entries, saidas: exits };
  });

  return (
    <Card className={`p-5 ${theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white"}`}>
      <h3 className="font-semibold mb-4">Início das tarefas e saídas — {year}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme === "dark" ? "#374151" : "#e5e7eb"} />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: theme === "dark" ? "#9ca3af" : "#6b7280" }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: theme === "dark" ? "#9ca3af" : "#6b7280" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: theme === "dark" ? "#1f2937" : "#fff",
                border: "none",
                borderRadius: 8,
                color: theme === "dark" ? "#f3f4f6" : "#111827",
              }}
            />
            <Bar dataKey="entradas" fill="#6366f1" radius={[4, 4, 0, 0]} name="Início tarefas" />
            <Bar dataKey="saidas" fill="#ef4444" radius={[4, 4, 0, 0]} name="Saídas" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}