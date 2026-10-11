"use client";

import { ErreurPage } from "@/components/app/etat-page";

export default function ErreurAdmissions({ reset }: { error: Error; reset: () => void }) {
  return <ErreurPage reset={reset} rassurance="Les passages déjà validés ne sont pas touchés." />;
}
