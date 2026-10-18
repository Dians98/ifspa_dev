import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import logo from "../../public/brand/logo-ifspa.png";

export const metadata: Metadata = { title: "Page introuvable", robots: { index: false, follow: false } };

export default function PageIntrouvable() {
  return (
    <main id="contenu" className="grid flex-1 place-items-center px-6 py-16">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <Image src={logo} alt="" width={72} height={72} className="size-18 rounded-full" />
        <h1 className="font-heading text-3xl font-semibold text-primary">Page introuvable</h1>
        <span aria-hidden className="h-1 w-14 rounded-full bg-rose" />
        <p className="text-muted-foreground">
          L&apos;adresse saisie n&apos;existe pas ou la page a été déplacée. Revenez à l&apos;accueil pour retrouver
          l&apos;institut.
        </p>
        <Button asChild size="lg" className="h-11 bg-rose-fonce text-white hover:bg-rose-fonce/90">
          <Link href="/">Retour à l&apos;accueil</Link>
        </Button>
      </div>
    </main>
  );
}
