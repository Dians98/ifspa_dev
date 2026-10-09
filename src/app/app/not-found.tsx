import Link from "next/link";
import { Construction } from "lucide-react";
import { TitrePage } from "@/components/app/titre-page";
import { Button } from "@/components/ui/button";
import { CHEMIN_ACCUEIL_APP } from "@/lib/roles";

export default function IntrouvableDansApp() {
  return (
    <>
      <TitrePage titre="Page indisponible" />
      <section className="flex flex-col items-center gap-4 rounded-xl border bg-card px-6 py-16 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-rose-pale text-rose-fonce">
          <Construction className="size-6" aria-hidden />
        </span>
        <p className="text-muted-foreground">Cet écran n&apos;est pas encore disponible.</p>
        <Button asChild>
          <Link href={CHEMIN_ACCUEIL_APP}>Retour au tableau de bord</Link>
        </Button>
      </section>
    </>
  );
}
