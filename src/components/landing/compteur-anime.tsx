"use client";

import { animate } from "motion/react";
import { useCallback, useRef } from "react";
import { useRevelation } from "@/components/motion/use-reveal";
import { formaterNombre, type FormatChiffre } from "./formater-chiffre";

/**
 * Nombre qui monte de 0 à `valeur` la première fois qu'il entre à l'écran, après `delai` secondes
 * (celui de sa carte : sinon un petit nombre a fini de compter avant que la carte soit visible).
 * Rendu serveur, « réduire les animations » et section déjà visible : la valeur finale, directement.
 */
export function CompteurAnime({
  valeur,
  formater,
  delai = 0,
}: {
  valeur: number;
  formater: FormatChiffre;
  delai?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const construire = useCallback(
    (el: HTMLSpanElement) => ({
      cacher: () => {
        el.textContent = formaterNombre(0, formater);
      },
      montrer: () => {
        animate(0, valeur, {
          duration: 1.8,
          delay: delai,
          ease: "easeOut",
          onUpdate: (n) => {
            el.textContent = formaterNombre(Math.round(n), formater);
          },
        });
      },
    }),
    [valeur, formater, delai],
  );
  useRevelation(ref, construire);

  return (
    <span ref={ref} className="tabular-nums">
      {formaterNombre(valeur, formater)}
    </span>
  );
}
