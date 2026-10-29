"use client";

import { animate } from "motion/react";
import { useCallback, useRef } from "react";
import { useRevelation } from "@/components/motion/use-reveal";
import { formaterNombre, type FormatChiffre } from "./formater-chiffre";

/**
 * Nombre qui monte de 0 à `valeur` la première fois qu'il entre à l'écran.
 * Rendu serveur, « réduire les animations » et section déjà visible : la valeur finale, directement.
 */
export function CompteurAnime({ valeur, formater }: { valeur: number; formater: FormatChiffre }) {
  const ref = useRef<HTMLSpanElement>(null);
  const construire = useCallback(
    (el: HTMLSpanElement) => ({
      cacher: () => {
        el.textContent = formaterNombre(0, formater);
      },
      montrer: () => {
        animate(0, valeur, {
          duration: 1.6,
          ease: [0.16, 1, 0.3, 1],
          onUpdate: (n) => {
            el.textContent = formaterNombre(Math.round(n), formater);
          },
        });
      },
    }),
    [valeur, formater],
  );
  useRevelation(ref, construire);

  return (
    <span ref={ref} className="tabular-nums">
      {formaterNombre(valeur, formater)}
    </span>
  );
}
