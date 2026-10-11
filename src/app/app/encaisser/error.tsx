"use client";

import { ErreurPage } from "@/components/app/etat-page";

export default function ErreurEncaisser({ reset }: { error: Error; reset: () => void }) {
  return <ErreurPage reset={reset} rassurance="Aucun paiement n'a été enregistré tant qu'un reçu n'est pas affiché." />;
}
