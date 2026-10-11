"use client";

import { Button } from "@/components/ui/button";

export default function ErreurEtudiants({ reset }: { error: Error; reset: () => void }) {
  return (
    <section role="alert" className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center">
      <h2 className="font-heading text-lg font-semibold text-primary">Cette page n&apos;a pas pu se charger</h2>
      <p className="max-w-md text-muted-foreground">
        Vérifiez votre connexion Internet, puis réessayez. Les étudiants et les paiements enregistrés ne sont pas touchés.
      </p>
      <Button onClick={reset} className="max-md:h-11">
        Réessayer
      </Button>
    </section>
  );
}
