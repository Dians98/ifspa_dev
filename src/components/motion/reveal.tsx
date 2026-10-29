"use client";

import { animate } from "motion/react";
import { useCallback, useRef, type ElementType, type ReactNode } from "react";
import { useRevelation } from "./use-reveal";

export const EASE_REVELATION = [0.22, 1, 0.36, 1] as const;

/** Fondu et légère montée, une seule fois, au premier passage dans l'écran. */
export function Reveal({
  children,
  as: Balise = "div",
  className,
  delai = 0,
  y = 20,
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  delai?: number;
  y?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const construire = useCallback(
    (el: HTMLElement) => ({
      cacher: () => {
        el.style.opacity = "0";
        el.style.transform = `translateY(${y}px)`;
      },
      montrer: () => {
        animate(el, { opacity: 1, y: 0 }, { duration: 0.9, ease: EASE_REVELATION, delay: delai }).then(() => {
          el.style.opacity = "";
          el.style.transform = "";
        });
      },
    }),
    [y, delai],
  );
  useRevelation(ref, construire);
  return (
    <Balise ref={ref} className={className}>
      {children}
    </Balise>
  );
}
