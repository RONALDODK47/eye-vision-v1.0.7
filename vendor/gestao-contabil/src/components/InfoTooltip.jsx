import React, { useState } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Ícone ⓘ que ao clicar abre um balão com o texto explicativo.
 * Uso: <InfoTooltip text="Explicação aqui" />
 * Ou com JSX: <InfoTooltip>{<p>...</p>}</InfoTooltip>
 */
export default function InfoTooltip({ text, children, className, side = "top", align = "center" }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          className={cn(
            "inline-flex items-center justify-center w-4 h-4 rounded-full text-muted-foreground hover:text-foreground transition-colors shrink-0 align-middle",
            className
          )}
          aria-label="Informação"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="max-w-xs text-xs leading-relaxed p-3 z-50"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {children ?? <p>{text}</p>}
      </PopoverContent>
    </Popover>
  );
}
