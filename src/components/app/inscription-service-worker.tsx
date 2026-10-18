"use client";

import { useEffect } from "react";
import { viderPoste } from "@/lib/hors-ligne/base-locale";
import { enregistrerServiceWorker, viderCachesEncaisser } from "@/lib/hors-ligne/service-worker";

const CLE_DERNIER_COMPTE = "ifspa-dernier-compte";

export function InscriptionServiceWorker({ utilisateurId }: { utilisateurId: string }) {
  useEffect(() => {
    void (async () => {
      // Compte changé sans déconnexion propre : la page en cache porte encore l'identité du précédent.
      let precedent: string | null = null;
      try {
        precedent = localStorage.getItem(CLE_DERNIER_COMPTE);
        localStorage.setItem(CLE_DERNIER_COMPTE, utilisateurId);
      } catch {
        // Stockage indisponible : on purge par prudence.
      }
      if (precedent !== utilisateurId) await Promise.all([viderCachesEncaisser(), viderPoste()]).catch(() => {});
      await enregistrerServiceWorker();
    })();
  }, [utilisateurId]);
  return null;
}
