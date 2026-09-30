"use client";

import { useEffect, useState } from "react";
import Image, { type StaticImageData } from "next/image";
import { cn } from "@/lib/utils";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";

export type PhotoGalerie = { src: StaticImageData; legende: string; alt: string };

/**
 * Diaporama de la galerie : grande photo, flèches, compteur et vignettes cliquables.
 * Pas de défilement automatique (accessibilité, connexion lente).
 */
export function Galerie({ photos }: { photos: PhotoGalerie[] }) {
  const [principal, setPrincipal] = useState<CarouselApi>();
  const [vignettes, setVignettes] = useState<CarouselApi>();
  const [courante, setCourante] = useState(0);

  useEffect(() => {
    if (!principal) return;
    const surSelection = () => {
      const i = principal.selectedScrollSnap();
      setCourante(i);
      vignettes?.scrollTo(i);
    };
    principal.on("select", surSelection);
    return () => {
      principal.off("select", surSelection);
    };
  }, [principal, vignettes]);

  const photo = photos[courante];

  return (
    <div>
      <Carousel setApi={setPrincipal} opts={{ loop: true }} aria-label="Galerie de photos" className="group">
        <CarouselContent>
          {photos.map((p, i) => (
            <CarouselItem key={p.legende}>
              {/* Pleine largeur : d'un bord à l'autre de l'écran */}
              <div className="relative h-[60svh] min-h-80 overflow-hidden bg-muted sm:h-[72svh] sm:max-h-205">
                <Image
                  src={p.src}
                  alt={p.alt}
                  fill
                  placeholder="blur"
                  sizes="100vw"
                  priority={i === 0}
                  className="object-cover"
                />
                <span className="absolute right-4 top-4 rounded bg-black/55 px-2 py-1 text-[11px] text-white sm:right-8">
                  Photo d&apos;illustration
                </span>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious
          className="left-4 size-12 border-0 bg-white/90 text-primary shadow-md hover:bg-white disabled:opacity-0 sm:left-8"
          aria-label="Photo précédente"
        />
        <CarouselNext
          className="right-4 size-12 border-0 bg-white/90 text-primary shadow-md hover:bg-white disabled:opacity-0 sm:right-8"
          aria-label="Photo suivante"
        />
      </Carousel>

      {/* Légende et vignettes restent alignées sur la grille du site */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="mt-4 flex items-baseline justify-between gap-4" aria-live="polite">
        <p className="font-medium text-foreground">{photo?.legende}</p>
        <p className="tabular shrink-0 text-sm text-muted-foreground">
          {courante + 1} / {photos.length}
        </p>
      </div>

      <Carousel setApi={setVignettes} opts={{ dragFree: true, containScroll: "keepSnaps" }} className="mt-4">
        <CarouselContent className="-ml-3">
          {photos.map((p, i) => (
            <CarouselItem key={p.legende} className="basis-1/3 pl-3 sm:basis-1/5 lg:basis-1/8">
              <button
                type="button"
                onClick={() => principal?.scrollTo(i)}
                aria-label={`Afficher la photo ${i + 1} : ${p.legende}`}
                aria-current={i === courante}
                className={cn(
                  "relative block aspect-4/3 w-full overflow-hidden rounded-lg ring-offset-2 transition-[opacity,box-shadow]",
                  i === courante ? "ring-2 ring-rose" : "opacity-60 hover:opacity-100",
                )}
              >
                <Image src={p.src} alt="" fill sizes="160px" className="object-cover" />
              </button>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      </div>
    </div>
  );
}
