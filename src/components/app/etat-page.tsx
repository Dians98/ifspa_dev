"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Écran d'erreur d'une page de l'espace connecté (`error.tsx`) : ce qui s'est passé et quoi faire. */
export function ErreurPage({ reset, rassurance }: { reset: () => void; rassurance: string }) {
  return (
    <section role="alert" className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center">
      <h2 className="font-heading text-lg font-semibold text-primary">Cette page n&apos;a pas pu se charger</h2>
      <p className="max-w-md text-muted-foreground">
        Vérifiez votre connexion Internet, puis réessayez. {rassurance}
      </p>
      <Button onClick={reset} className="max-md:h-11">
        Réessayer
      </Button>
    </section>
  );
}

/** Squelette d'une page de liste (`loading.tsx`), annoncé une seule fois aux lecteurs d'écran. */
export function ChargementListe() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Chargement en cours…</span>
      <div className="space-y-3">
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap gap-3 border-b p-4">
          <Skeleton className="h-9 w-64 max-w-full" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="space-y-4 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}
