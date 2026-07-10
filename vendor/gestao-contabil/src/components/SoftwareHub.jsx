import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import SoftwareCarousel from "@/components/SoftwareCarousel";
import { SOFTWARE_CATALOG } from "@/config/softwareCatalog";

export const SELECTED_SOFTWARE_KEY = "inov:selectedSoftware";

export function readSelectedSoftwareId() {
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem(SELECTED_SOFTWARE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function clearSelectedSoftware() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SELECTED_SOFTWARE_KEY);
  } catch {
    // noop
  }
}

export default function SoftwareHub({ className }) {
  const navigate = useNavigate();
  const softwares = useMemo(() => SOFTWARE_CATALOG, []);

  const launch = (software) => {
    if (!software) return;

    try {
      window.localStorage.setItem(SELECTED_SOFTWARE_KEY, software.id);
    } catch {
      // noop
    }

    if (software.route) {
      navigate(software.route);
      return;
    }

    if (software.url) {
      window.open(software.url, "_blank", "noopener,noreferrer");
      return;
    }

    toast({
      title: "Software não integrado ainda",
      description: `O "${software.nome}" está no MULTIVERSO, mas ainda não está ligado a esta interface.`,
    });
  };

  return (
    <div className={className}>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestão Contábil INOV</h1>
          <p className="text-sm text-muted-foreground">Selecione um software para abrir a interface.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            clearSelectedSoftware();
            toast({ title: "Seleção reiniciada", description: "Escolha um software para começar." });
          }}
        >
          Trocar software
        </Button>
      </div>

      <SoftwareCarousel softwares={softwares} onLaunch={launch} />
    </div>
  );
}
