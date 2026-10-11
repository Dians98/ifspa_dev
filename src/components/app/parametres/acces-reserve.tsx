import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHEMIN_ACCUEIL_APP } from "@/lib/roles";

/** Ce que voit le secrétariat : une explication et une sortie, jamais une redirection muette. */
export function AccesReserve() {
  return (
    <section className="mx-auto mt-6 flex max-w-xl flex-col items-center rounded-xl border bg-card px-6 py-10 text-center sm:mt-12">
      <span className="grid size-12 place-items-center rounded-full bg-secondary text-primary">
        <Lock className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 font-heading text-2xl leading-tight font-bold text-primary after:mx-auto after:mt-2.5 after:block after:h-1 after:w-11 after:rounded-full after:bg-rose after:content-['']">
        Accès réservé à l&apos;administrateur
      </h1>
      <p className="mt-4 text-muted-foreground">
        Les paramètres (filières, années scolaires, tarifs et comptes utilisateurs) ne peuvent être modifiés que par un
        administrateur. Si un réglage doit changer, adressez-vous à lui.
      </p>
      <Button asChild size="lg" className="mt-6 h-10 px-4">
        <Link href={CHEMIN_ACCUEIL_APP}>Retour au tableau de bord</Link>
      </Button>
    </section>
  );
}
