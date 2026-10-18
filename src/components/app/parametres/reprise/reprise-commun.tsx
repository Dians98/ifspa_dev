import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Au-delà, un fichier de 2 000 étudiants alourdirait la page sur une connexion lente. */
export const LIGNES_VISIBLES = 50;
export const MESSAGES_VISIBLES = 100;

export function pluriel(n: number, un: string, plusieurs: string): string {
  return `${n} ${n > 1 ? plusieurs : un}`;
}

export function PlusDeLignes({ restant, onClick }: { restant: number; onClick: () => void }) {
  if (restant <= 0) return null;
  return (
    <div className="border-t px-4 py-3 sm:px-5">
      <Button type="button" variant="outline" size="sm" className="max-md:h-11" onClick={onClick}>
        {`Afficher les ${restant} autres lignes`}
      </Button>
    </div>
  );
}

/** Bloc replié ou ouvert d'un rapport ; le résumé se lit et s'active au clavier comme un bouton. */
export function BlocReplie({ titre, ouvert, children }: { titre: string; ouvert?: boolean; children: ReactNode }) {
  return (
    <details open={ouvert} className="group border-t">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-2 text-sm font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5">
        <ChevronRight
          aria-hidden
          className="size-4 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        {titre}
      </summary>
      {children}
    </details>
  );
}
