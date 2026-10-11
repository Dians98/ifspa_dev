"use client";

import { ErreurPage } from "@/components/app/etat-page";

export default function ErreurTableauDeBord({ reset }: { error: Error; reset: () => void }) {
  return <ErreurPage reset={reset} rassurance="Aucun paiement n'est modifié par cet écran." />;
}
