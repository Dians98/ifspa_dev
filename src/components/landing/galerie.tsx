"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { animate, stagger } from "motion/react";
import Image, { type StaticImageData } from "next/image";
import { cn } from "@/lib/utils";
import { EASE_REVELATION } from "@/components/motion/reveal";
import { useRevelation } from "@/components/motion/use-reveal";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";

/** `illustration` : photo de banque d'images, signalée comme telle tant que les vraies photos manquent. */
export type PhotoGalerie = { src: StaticImageData; legende: string; alt: string; illustration?: boolean };

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

  // Arrivée en cascade : la grande photo, puis les vignettes une à une.
  const racine = useRef<HTMLDivElement>(null);
  const construire = useCallback((el: HTMLElement) => {
    const grande = el.querySelector<HTMLElement>("[data-grande]")!;
    const vignettesEl = Array.from(el.querySelectorAll<HTMLElement>("[data-vignette]"));
    return {
      cacher: () => {
        grande.style.opacity = "0";
        vignettesEl.forEach((v) => {
          v.style.opacity = "0";
          v.style.transform = "translateY(10px)";
        });
      },
      montrer: () => {
        animate(grande, { opacity: 1 }, { duration: 0.8, ease: EASE_REVELATION }).then(() => {
          grande.style.opacity = "";
        });
        animate(vignettesEl, { opacity: 1, y: 0 }, { duration: 0.6, ease: EASE_REVELATION, delay: stagger(0.06, { startDelay: 0.25 }) }).then(() => {
          vignettesEl.forEach((v) => {
            v.style.opacity = "";
            v.style.transform = "";
          });
        });
      },
    };
  }, []);
  useRevelation(racine, construire);

  return (
    <div ref={racine}>
      <Carousel setApi={setPrincipal} opts={{ loop: true }} aria-label="Galerie de photos" className="group" data-grande>
        <CarouselContent>
          {photos.map((p) => (
            <CarouselItem key={p.legende}>
              {/* Pleine largeur : d'un bord à l'autre de l'écran */}
              <div className="group/photo relative h-[60svh] min-h-80 overflow-hidden bg-muted sm:h-[72svh] sm:max-h-205">
                <Image
                  src={p.src}
                  alt={p.alt}
                  fill
                  placeholder="blur"
                  sizes="100vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover/photo:scale-104 motion-reduce:transition-none motion-reduce:group-hover/photo:scale-100"
                />
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
        <p className="font-medium text-foreground">
          {photo?.legende}
          {photo?.illustration && <span className="ml-2 text-sm font-normal text-muted-foreground">(photo d&apos;illustration)</span>}
        </p>
        <p className="tabular shrink-0 text-sm text-muted-foreground">
          {courante + 1} / {photos.length}
        </p>
      </div>

      <Carousel setApi={setVignettes} opts={{ dragFree: true, containScroll: "keepSnaps" }} className="mt-4">
        <CarouselContent className="-ml-3">
          {photos.map((p, i) => (
            <CarouselItem key={p.legende} className="basis-1/3 pl-3 sm:basis-1/5 lg:basis-1/8">
              <div data-vignette>
              <button
                type="button"
                onClick={() => principal?.scrollTo(i)}
                aria-label={`Afficher la photo ${i + 1} : ${p.legende}`}
                aria-current={i === courante}
                className={cn(
                  "group/vignette relative block aspect-4/3 w-full overflow-hidden rounded-lg ring-offset-2 transition-[opacity,box-shadow]",
                  i === courante ? "ring-2 ring-rose" : "opacity-60 hover:opacity-100",
                )}
              >
                <Image
                  src={p.src}
                  alt=""
                  fill
                  sizes="160px"
                  className="object-cover transition-transform duration-500 ease-out group-hover/vignette:scale-104 group-focus-visible/vignette:scale-104 motion-reduce:transition-none motion-reduce:group-hover/vignette:scale-100 motion-reduce:group-focus-visible/vignette:scale-100"
                />
              </button>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      </div>
    </div>
  );
}
