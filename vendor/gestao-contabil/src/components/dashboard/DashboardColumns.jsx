import React from "react";
import { Card } from "@/components/ui/card";
import { useTheme } from "../ThemeProvider";

export default function DashboardColumns({ companies, columns }) {
  const { theme } = useTheme();
  const dashCols = columns.filter((c) => c.show_on_dashboard && c.active);

  if (dashCols.length === 0) return null;

  return (
    <Card className={`p-5 ${theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white"}`}>
      <h3 className="font-semibold mb-4">Colunas Personalizadas</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {dashCols.map((col) => {
          const values = companies
            .filter((c) => c.status === "active" && c.custom_fields?.[col.key])
            .map((c) => c.custom_fields[col.key]);

          let summary = "";
          if (col.type === "number") {
            const nums = values.map(Number).filter((n) => !isNaN(n));
            summary = nums.length > 0 ? `Total: ${nums.reduce((a, b) => a + b, 0)}` : "Sem dados";
          } else if (col.type === "boolean") {
            const trueCount = values.filter((v) => v === true || v === "true").length;
            summary = `${trueCount} sim / ${values.length - trueCount} não`;
          } else {
            summary = `${values.length} registros`;
          }

          return (
            <div
              key={col.id}
              className={`p-4 rounded-lg border ${theme === "dark" ? "border-gray-800 bg-gray-800/50" : "border-gray-100 bg-gray-50"}`}
            >
              <p className={`text-xs font-semibold uppercase tracking-wider ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}>
                {col.name}
              </p>
              <p className="text-lg font-bold mt-1">{summary}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}