import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

/** Passage impossible : ce qui manque, et qui peut le régler (lien pour l'admin, consigne pour le secrétariat). */
export function EcranBloque({ titre, children, action }: { titre: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center sm:px-6">
      <span className="grid size-12 place-items-center rounded-full bg-attention-pale text-attention">
        <TriangleAlert aria-hidden className="size-6" />
      </span>
      <h3 className="mt-4 max-w-lg font-heading text-xl leading-snug font-bold text-primary">{titre}</h3>
      {children && <div className="mt-2 max-w-lg text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
