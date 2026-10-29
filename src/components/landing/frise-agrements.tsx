"use client";

import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useCallback, useEffect, useRef } from "react";

type Arrete = { reference: string; annee: number; objet: string };

/**
 * Liste des arrêtés reliés par un trait vertical qui se trace au défilement ; chaque année
 * prend sa couleur pleine quand le trait l'atteint. Sans JavaScript ou avec « réduire les
 * animations », tout est affiché en couleur pleine.
 */
export function FriseAgrements({ arretes }: { arretes: readonly Arrete[] }) {
  const liste = useRef<HTMLOListElement>(null);
  const actif = useRef(false);
  const { scrollYProgress } = useScroll({ target: liste, offset: ["start 75%", "end 55%"] });

  const mettreAJour = useCallback((progression: number) => {
    const ol = liste.current;
    if (!ol || !actif.current) return;
    const y = progression * ol.offsetHeight;
    ol.querySelectorAll<HTMLElement>("li").forEach((li) => {
      // 1,5rem : le trait atteint la ligne de l'année, pas le haut de la rangée.
      const atteint = li.offsetTop + 24 <= y;
      li.querySelector("[data-annee]")?.toggleAttribute("data-attenue", !atteint);
    });
  }, []);

  useEffect(() => {
    actif.current = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mettreAJour(scrollYProgress.get());
  }, [mettreAJour, scrollYProgress]);

  useMotionValueEvent(scrollYProgress, "change", mettreAJour);

  return (
    <div className="relative">
      <span aria-hidden className="absolute top-0 bottom-0 left-0 w-0.5 rounded-full bg-border motion-reduce:bg-rose/40" />
      <motion.span
        aria-hidden
        style={{ scaleY: scrollYProgress, transformOrigin: "top" }}
        className="absolute top-0 bottom-0 left-0 w-0.5 rounded-full bg-rose motion-reduce:hidden"
      />
      <ol ref={liste} className="divide-y border-y pl-6">
      {arretes.map((a) => (
        <li key={a.reference} className="grid gap-1 py-5 sm:grid-cols-[4.5rem_1fr] sm:gap-6">
          <span
            data-annee
            className="tabular font-heading text-2xl font-semibold text-rose-fonce transition-opacity duration-500 data-attenue:opacity-35"
          >
            {a.annee}
          </span>
          <div>
            <p className="tabular font-semibold text-primary">Arrêté {a.reference}</p>
            <p className="mt-1 text-muted-foreground">{a.objet}</p>
          </div>
        </li>
      ))}
      </ol>
    </div>
  );
}
