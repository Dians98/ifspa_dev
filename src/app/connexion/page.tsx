import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { FormulaireConnexion } from "@/components/connexion/formulaire-connexion";
import { getSession } from "@/lib/permissions";
import { destinationApresConnexion } from "@/lib/roles";
import logo from "../../../public/brand/logo-ifspa.png";
import photo from "../../../public/images/illustration/hero-etudiants-1920.webp";

export const metadata: Metadata = { title: "Connexion" };

export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<{ [cle: string]: string | string[] | undefined }>;
}) {
  const { retour } = await searchParams;
  const destination = destinationApresConnexion(typeof retour === "string" ? retour : null);

  if (await getSession()) redirect(destination);

  return (
    <div className="grid h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex min-h-0 flex-col overflow-y-auto px-5 py-4 sm:px-10 lg:px-16">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour au site
        </Link>

        <main className="m-auto w-full max-w-100 py-6">
          <Image src={logo} alt="Logo de l'IFSPA" className="h-auto w-20" priority />
          <h1 className="mt-5 font-heading text-3xl font-bold text-primary after:mt-2.5 after:block after:h-1 after:w-11 after:rounded-full after:bg-rose after:content-['']">
            Connexion
          </h1>
          <p className="mt-3 mb-7 text-muted-foreground">
            Espace du personnel : gérez les étudiants et l&apos;écolage.
          </p>

          <FormulaireConnexion destination={destination} />

          <p className="mt-6 text-sm text-muted-foreground">
            Les comptes sont créés et réinitialisés par l&apos;administrateur. Mot de passe perdu ? Adressez-vous à lui.
          </p>
        </main>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} IFSPA — Conçu et réalisé par{" "}
          <a
            href="https://portfolio-blue-iota-21.vercel.app/"
            target="_blank"
            rel="noopener"
            className="underline hover:text-primary"
          >
            Diano ANDRIANTSALAMA
          </a>
        </p>
      </div>

      <aside aria-hidden className="relative hidden overflow-hidden bg-primary lg:block">
        <Image
          src={photo}
          alt=""
          fill
          sizes="52vw"
          className="object-cover object-[center_35%]"
        />
        <div className="absolute inset-0 bg-linear-to-b from-primary/15 via-primary/55 to-primary/95" />
        <small className="absolute top-4 right-4 text-xs text-white/80">Photo d&apos;illustration</small>
        <div className="absolute inset-x-0 bottom-0 p-12 text-white">
          <span className="mb-6 block h-1.5 w-18 rounded-full bg-rose" />
          <p className="max-w-[24ch] font-heading text-3xl leading-tight font-semibold">
            Institut de Formation Supérieur des Paramédicaux Atsinanana
          </p>
          <p className="mt-3 text-white/85">Toamasina · Infirmier(e)s et Sage-femmes</p>
        </div>
      </aside>
    </div>
  );
}
