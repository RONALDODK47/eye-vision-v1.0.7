import React, { useEffect, useMemo, useState } from "react";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import SoftwareLogo from "@/components/SoftwareLogo";
import { SOFTWARE_CATALOG, SOFTWARE_DEFAULT_ID } from "@/config/softwareCatalog";
import "./SoftwareCarousel.css";
export default function SoftwareCarousel({ softwares = SOFTWARE_CATALOG, onLaunch }) {
  const [selected, setSelected] = useState(softwares[0]?.id || SOFTWARE_DEFAULT_ID);
  const [api, setApi] = useState(null);

  const selectedSoftware = useMemo(
    () => softwares.find((item) => item.id === selected) || softwares[0],
    [selected, softwares]
  );

  const onUseSoftware = (software) => {
    setSelected(software.id);
    onLaunch?.(software);
  };

  useEffect(() => {
    if (!api) return undefined;
    const syncSelected = () => {
      const index = api.selectedScrollSnap();
      const current = softwares[index];
      if (current) setSelected(current.id);
    };
    syncSelected();
    api.on("select", syncSelected);
    api.on("reInit", syncSelected);
    return () => {
      api.off("select", syncSelected);
      api.off("reInit", syncSelected);
    };
  }, [api, softwares]);

  return (
    <section
      className="software-carousel-shell rounded-2xl border p-4 md:p-6"
      style={{
        "--ambient-color": selectedSoftware?.cor || "#6366f1",
      }}
    >
      <div className="software-carousel-head mb-4 md:mb-5">
        <div>
          <p className="text-xs md:text-sm uppercase tracking-[0.18em] text-muted-foreground">Seletor Gestão Contábil</p>
          <h2 className="text-lg md:text-2xl font-semibold">Escolha o software INOV para usar agora</h2>
        </div>
        {selectedSoftware ? (
          <span className="rounded-full border px-3 py-1 text-xs md:text-sm">
            Selecionado: {selectedSoftware.nome}
          </span>
        ) : null}
      </div>

      <Carousel
        opts={{ align: "start", loop: true }}
        setApi={setApi}
        className="w-full px-10 md:px-14"
      >
        <CarouselContent>
          {softwares.map((software) => (
            <CarouselItem key={software.id} className="basis-full md:basis-1/2 xl:basis-1/3">
              <article
                className={`software-item-card rounded-xl border p-4 h-full flex flex-col ${
                  selected === software.id ? "is-active" : ""
                }`}
              >
                <div className="flex justify-center">
                  <SoftwareLogo nome={software.nome} cor={software.cor} icone={software.icone} />
                </div>
                <div className="mt-4 space-y-2">
                  <h3 className="text-base md:text-lg font-semibold">{software.nome}</h3>
                  <p className="text-sm text-muted-foreground min-h-16">{software.descricao}</p>
                  <p className="text-xs text-muted-foreground/80">Pasta: {software.pasta}</p>
                </div>
                <Button
                  type="button"
                  className="mt-auto"
                  style={{
                    backgroundColor: software.cor,
                    borderColor: software.cor,
                  }}
                  onClick={() => onUseSoftware(software)}
                >
                  Usar este software
                </Button>
              </article>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {softwares.map((software, index) => (
          <button
            key={software.id}
            type="button"
            aria-label={`Ir para ${software.nome}`}
            className={`software-dot ${software.id === selected ? "is-active" : ""}`}
            style={{ "--dot-color": software.cor }}
            onClick={() => {
              setSelected(software.id);
              api?.scrollTo(index);
            }}
          />
        ))}
      </div>
    </section>
  );
}
