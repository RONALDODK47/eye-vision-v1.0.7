import { cn } from "@/lib/utils";

/**
 * Sub-abas horizontais no padrão Eye Vision (Gerencial / Precificação / sidebar Gestão).
 */
export function GestaoSubTabs({ tabs, value, onChange, className, ariaLabel = "Secções" }) {
  return (
    <div
      className={cn(
        "cf-scroll-tabs flex flex-wrap gap-1 border border-brand-border p-1 bg-brand-sidebar/20",
        className,
      )}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "px-3 py-2 text-[10px] font-black uppercase tracking-widest border border-transparent transition-colors whitespace-nowrap",
              active
                ? "bg-brand-border text-brand-bg border-brand-border"
                : "hover:bg-brand-sidebar/40",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function GestaoPageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-brand-border pb-4 gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-black tracking-tighter uppercase italic">{title}</h1>
        {subtitle ? (
          <p className="text-[10px] font-bold uppercase opacity-50 tracking-widest mt-0.5">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 items-center">{actions}</div> : null}
    </div>
  );
}

export function GestaoPanel({ className, children }) {
  return (
    <div className={cn("border border-brand-border bg-white p-4 md:p-5", className)}>{children}</div>
  );
}

/** Texto secundário padrão Eye Vision (substitui `text-gray-400` / tema escuro). */
export const gestaoNativeMuted = "text-[10px] font-bold uppercase opacity-50 tracking-widest";

/** Botão primário nativo (substitui `bg-indigo-600`). */
export const gestaoNativeBtnPrimary =
  "gap-2 bg-brand-border text-brand-bg hover:opacity-90 border border-brand-border rounded-none text-[10px] font-black uppercase tracking-widest shadow-none";

/** Select / input compacto nativo. */
export const gestaoNativeSelectTrigger =
  "h-9 border-brand-border rounded-none text-[10px] font-bold uppercase tracking-wide bg-white shadow-none";

/** Card nativo (substitui Card shadcn com tema escuro). */
export const gestaoNativeCard = "border border-brand-border bg-white shadow-none rounded-none";

/** Painel de acesso restrito (substitui Card cinza legado). */
export function GestaoRestrictedPanel({ title = "Acesso restrito", message, className }) {
  return (
    <div className={cn("flex items-center justify-center min-h-[40vh]", className)}>
      <GestaoPanel className="max-w-md text-center space-y-3">
        <h2 className="text-lg font-black uppercase tracking-tighter italic">{title}</h2>
        <p className={gestaoNativeMuted}>{message}</p>
      </GestaoPanel>
    </div>
  );
}
