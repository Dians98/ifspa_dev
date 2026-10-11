"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EtatAction } from "@/lib/etat-action";
import { useExecuterAction } from "./executer-action";

type Props = Omit<React.ComponentProps<typeof Button>, "onClick"> & {
  action: () => Promise<EtatAction<unknown>>;
};

/** Bouton d'une action réversible : pas de confirmation, une notification dit ce qui s'est passé. */
export function BoutonAction({ action, children, disabled, ...props }: Props) {
  const { enCours, executer } = useExecuterAction();

  return (
    <Button type="button" disabled={disabled || enCours} onClick={() => void executer(action)} {...props}>
      {enCours && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
      {children}
    </Button>
  );
}
