"use client";

import { useEffect, useState } from "react";
import { paiementsAEnvoyer } from "@/lib/hors-ligne/base-locale";
import { CANAL_GUICHET } from "@/lib/hors-ligne/synchro";

/** Paiements de cet utilisateur encore à envoyer depuis ce poste ; mis à jour par les autres onglets. */
export function usePaiementsEnAttente(utilisateurId: string): number {
  const [nombre, setNombre] = useState(0);

  useEffect(() => {
    let actif = true;
    const relire = () => {
      paiementsAEnvoyer(utilisateurId)
        .then((n) => actif && setNombre(n))
        .catch(() => {});
    };
    relire();
    const canal = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CANAL_GUICHET);
    if (canal) canal.onmessage = relire;
    window.addEventListener("online", relire);
    window.addEventListener("offline", relire);
    return () => {
      actif = false;
      canal?.close();
      window.removeEventListener("online", relire);
      window.removeEventListener("offline", relire);
    };
  }, [utilisateurId]);

  return nombre;
}
