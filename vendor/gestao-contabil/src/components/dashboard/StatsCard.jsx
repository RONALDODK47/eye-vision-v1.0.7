import React from "react";

const ICON_TONE = {
  indigo: "text-brand-text",
  green: "text-emerald-800",
  red: "text-red-800",
  purple: "text-violet-800",
  blue: "text-blue-800",
  amber: "text-amber-800",
  emerald: "text-emerald-800",
  orange: "text-orange-800",
};

export default function StatsCard({ title, value, subtitle, icon: Icon, color = "indigo" }) {
  const tone = ICON_TONE[color] || ICON_TONE.indigo;

  return (
    <div className="border border-brand-border bg-white p-4 md:p-5 relative">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[9px] font-black uppercase tracking-widest opacity-50 leading-snug">{title}</p>
        {Icon ? (
          <span className={`shrink-0 p-1.5 border border-brand-border/40 ${tone}`}>
            <Icon className="w-3.5 h-3.5" aria-hidden />
          </span>
        ) : null}
      </div>
      <p className="text-2xl md:text-3xl font-black mt-2 tabular-nums tracking-tight">{value}</p>
      {subtitle ? (
        <p className="text-[9px] font-mono opacity-50 mt-1 leading-relaxed">{subtitle}</p>
      ) : null}
    </div>
  );
}
