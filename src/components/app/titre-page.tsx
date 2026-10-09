import type { ReactNode } from "react";

/** Titre de page : h1 en serif bleu nuit, filet rose dessous, description et actions facultatives. */
export function TitrePage({
  titre,
  description,
  actions,
}: {
  titre: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-heading text-3xl leading-tight font-bold tracking-tight text-primary after:mt-2.5 after:block after:h-1 after:w-11 after:rounded-full after:bg-rose after:content-['']">
          {titre}
        </h1>
        {description && <p className="mt-3 text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
