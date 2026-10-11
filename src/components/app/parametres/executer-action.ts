"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { EtatAction } from "@/lib/etat-action";

export const MESSAGE_RESEAU =
  "La connexion a échoué. Rechargez la page pour vérifier si le changement a bien été pris en compte.";

/** Action sans formulaire ni confirmation : le résultat s'annonce par une notification. */
export function useExecuterAction() {
  const [enCours, setEnCours] = useState(false);

  async function executer<D>(action: () => Promise<EtatAction<D>>): Promise<EtatAction<D> | null> {
    setEnCours(true);
    try {
      const etat = await action();
      if (etat.statut === "succes") toast.success(etat.message);
      else toast.error(etat.message);
      return etat;
    } catch {
      toast.error(MESSAGE_RESEAU);
      return null;
    } finally {
      setEnCours(false);
    }
  }

  return { enCours, executer };
}
