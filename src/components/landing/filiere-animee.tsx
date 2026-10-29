"use client";

import { animate } from "motion/react";
import { useCallback, useRef, type ReactNode } from "react";
import { CircleCheck } from "lucide-react";
import { useRevelation } from "@/components/motion/use-reveal";
import { cn } from "@/lib/utils";

/**
 * Une filière : la photo reste fixe ; les coches de la liste se tracent une à une.
 * La liste elle-même déclenche l'animation : sur mobile, elle arrive bien après la photo.
 * L'état de départ n'est posé qu'au client, sous la ligne de flottaison.
 */
export function FiliereAnimee({
  photo,
  mention,
  photoADroite,
  teinte,
  points,
  children,
}: {
  photo: ReactNode;
  mention: ReactNode;
  photoADroite: boolean;
  teinte: "rose" | "bleu";
  points: string[];
  children: ReactNode;
}) {
  const ref = useRef<HTMLUListElement>(null);

  const construire = useCallback(
    (el: HTMLUListElement) => {
      const lignes = Array.from(el.querySelectorAll<HTMLElement>("[data-point]"));
      const traits = lignes.map((l) => Array.from(l.querySelectorAll<SVGGeometryElement>("circle, path")));
      const textes = lignes.map((l) => l.querySelector<HTMLElement>("[data-texte]")!);

      return {
        cacher: () => {
          traits.forEach((t) =>
            t.forEach((g) => {
              g.setAttribute("pathLength", "1");
              g.style.strokeDasharray = "1";
              g.style.strokeDashoffset = "1";
            }),
          );
          textes.forEach((t) => (t.style.opacity = "0"));
        },
        montrer: () => {
          lignes.forEach((_, i) => {
            const debut = 0.15 + i * 0.18;
            const [cercle, coche] = traits[i];
            animate(cercle, { strokeDashoffset: [1, 0] }, { duration: 0.45, ease: "easeOut", delay: debut });
            if (coche) animate(coche, { strokeDashoffset: [1, 0] }, { duration: 0.3, ease: "easeOut", delay: debut + 0.25 });
            animate(textes[i], { opacity: 1 }, { duration: 0.5, ease: "easeOut", delay: debut + 0.1 }).then(() => {
              textes[i].style.opacity = "";
            });
          });
        },
      };
    },
    [],
  );
  useRevelation(ref, construire);

  return (
    <article className="grid items-center gap-8 md:grid-cols-2 lg:gap-16">
      <div className={cn("relative aspect-[4/3] overflow-hidden rounded-2xl", photoADroite && "md:order-2")}>
        {photo}
        {mention}
      </div>
      <div>
        {children}
        <ul ref={ref} className="mt-6 space-y-3">
          {points.map((p) => (
            <li key={p} data-point className="flex items-start gap-3">
              <CircleCheck
                className={cn("mt-0.5 size-5 shrink-0", teinte === "rose" ? "text-rose-fonce" : "text-bleu")}
                aria-hidden
              />
              <span data-texte>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
