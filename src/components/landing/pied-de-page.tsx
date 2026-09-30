import Image from "next/image";
import { ARRETES, DEVISE, ETABLISSEMENT } from "@/lib/etablissement";
import logo from "../../../public/brand/logo-ifspa.png";

type Coordonnees = {
  adresse: string | null;
  ville: string;
  telephone: string | null;
  email: string | null;
};

const NAVIGATION = [
  { href: "#institut", label: "L'institut" },
  { href: "#filieres", label: "Filières" },
  { href: "#galerie", label: "Galerie" },
  { href: "#agrements", label: "Agréments" },
  { href: "#contact", label: "Contact" },
];

const FILIERES = [
  { href: "#filieres", label: "Infirmier(e)s", pastille: "bg-bleu" },
  { href: "#filieres", label: "Sage-femmes", pastille: "bg-rose" },
];

function Colonne({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-rose-fonce">{titre}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function PiedDePage({ coord }: { coord: Coordonnees }) {
  return (
    <footer className="bg-muted/70">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1.3fr] lg:px-8">
        <div className="max-w-sm">
          <Image src={logo} alt="Logo de l'IFSPA" className="h-20 w-auto" />
          <p className="mt-5 font-heading text-lg font-semibold leading-snug text-primary">{ETABLISSEMENT.nom}</p>
          <blockquote className="mt-3">
            {DEVISE ? (
              <p className="font-heading text-lg italic text-foreground">« {DEVISE} »</p>
            ) : (
              <p className="italic text-rose-fonce">Devise de l&apos;institut à compléter</p>
            )}
          </blockquote>
        </div>

        <Colonne titre="Navigation">
          <ul className="space-y-3">
            {NAVIGATION.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="text-muted-foreground transition-colors hover:text-primary hover:underline">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </Colonne>

        <Colonne titre="Filières">
          <ul className="space-y-3">
            {FILIERES.map((f) => (
              <li key={f.label}>
                <a href={f.href} className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-primary hover:underline">
                  <span className={`size-2 rounded-full ${f.pastille}`} aria-hidden />
                  {f.label}
                </a>
              </li>
            ))}
          </ul>
        </Colonne>

        <Colonne titre="Contact">
          <address className="space-y-3 not-italic text-muted-foreground">
            <p>{coord.adresse ? `${coord.adresse}, ${coord.ville}` : `${coord.ville}, Madagascar`}</p>
            <p>{coord.telephone ?? <span className="italic text-rose-fonce">Téléphone à compléter</span>}</p>
            <p>{coord.email ?? <span className="italic text-rose-fonce">Courriel à compléter</span>}</p>
          </address>
        </Colonne>
      </div>

      <div className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:px-6 md:flex-row md:justify-between lg:px-8">
          <p>
            © {new Date().getFullYear()} {ETABLISSEMENT.sigle} — Conçu et réalisé par {" "}
            <a
              href="https://portfolio-blue-iota-21.vercel.app/"
              target="_blank"
              rel="noopener"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Diano ANDRIANTSALAMA
            </a>
          </p>
          <p className="tabular">Établissement autorisé par arrêté {ARRETES[0].reference}</p>
        </div>
      </div>
    </footer>
  );
}
