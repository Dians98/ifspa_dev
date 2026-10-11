import { useId, type ReactNode } from "react";

/** Bloc blanc d'un onglet : titre de section, phrase d'aide, action principale à droite. */
export function PanneauParametre({
  titre,
  description,
  action,
  children,
}: {
  titre: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();

  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <div className="min-w-0 max-w-prose">
          <h2 id={id} className="font-heading text-lg leading-tight font-semibold text-primary">
            {titre}
          </h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Premier usage ou liste vide : dit quoi faire, avec l'action pour commencer. */
export function EtatVide({ texte, action }: { texte: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <p className="max-w-md text-muted-foreground">{texte}</p>
      {action}
    </div>
  );
}
