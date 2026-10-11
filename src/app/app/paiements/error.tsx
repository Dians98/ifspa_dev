"use client";

import { ErreurPage } from "@/components/app/etat-page";

export default function ErreurPaiements({ reset }: { error: Error; reset: () => void }) {
  return <ErreurPage reset={reset} rassurance="Vos paiements enregistrés ne sont pas touchés." />;
}
