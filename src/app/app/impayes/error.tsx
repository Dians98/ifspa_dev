"use client";

import { ErreurPage } from "@/components/app/etat-page";

export default function ErreurImpayes({ reset }: { error: Error; reset: () => void }) {
  return <ErreurPage reset={reset} rassurance="Les paiements enregistrés ne sont pas touchés." />;
}
