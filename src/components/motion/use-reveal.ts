"use client";

import { useEffect, type RefObject } from "react";

export interface CibleRevelation {
  cacher: () => void;
  montrer: () => void;
}

/**
 * Cache l'élément seulement s'il est sous la ligne de flottaison, puis le montre une fois au défilement.
 * Rien n'est caché côté serveur ni avec « réduire les animations ».
 */
export function useRevelation<T extends HTMLElement>(ref: RefObject<T | null>, construire: (el: T) => CibleRevelation) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    const cible = construire(el);
    cible.cacher();
    const io = new IntersectionObserver(
      (entrees) => {
        if (entrees.some((e) => e.isIntersecting)) {
          cible.montrer();
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, construire]);
}
