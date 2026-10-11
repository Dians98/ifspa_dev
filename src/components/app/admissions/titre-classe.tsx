"use client";

import { useEffect, useRef, type ReactNode } from "react";

let focusDemande = false;

/** À appeler avant une action qui remplace la classe affichée : le focus revient sur le titre au lieu de se perdre. */
export function demanderFocusTitre() {
  focusDemande = true;
}

export function TitreClasse({ cle, etat, children }: { cle: string; etat: string; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!focusDemande) return;
    focusDemande = false;
    ref.current?.focus();
  }, [cle, etat]);

  return (
    <h2
      ref={ref}
      tabIndex={-1}
      className="rounded-sm font-heading text-xl leading-tight font-bold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-2xl"
    >
      {children}
    </h2>
  );
}
