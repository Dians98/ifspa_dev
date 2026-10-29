import Image from "next/image";
import { COORDONNEES, DEVISE, ETABLISSEMENT } from "@/lib/etablissement";
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
  { href: "#admission", label: "Admission" },
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
      {/* Paragraphe et non h2 : ces titres de colonne doubleraient ceux de la page dans le plan des titres. */}
      <p className="font-sans text-sm font-semibold uppercase tracking-wider text-rose-fonce">{titre}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function PiedDePage({ coord }: { coord: Coordonnees }) {
  return (
    <footer className="bg-muted/70">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1.3fr] lg:px-8">
        <div className="flex max-w-md items-center gap-4 self-start">
          <Image src={logo} alt="Logo de l'IFSPA" width={95} height={64} className="h-16 w-auto shrink-0" />
          <div>
            <p className="font-heading text-lg font-semibold leading-snug text-primary">{ETABLISSEMENT.nom}</p>
            {DEVISE && <p className="mt-1.5 text-sm italic text-muted-foreground">{DEVISE}</p>}
          </div>
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
            {coord.telephone && <p>{coord.telephone}</p>}
            {coord.email && <p className="[overflow-wrap:anywhere]">{coord.email}</p>}
            <p className="[overflow-wrap:anywhere]">{COORDONNEES.emailAdmin}</p>
          </address>
        </Colonne>
      </div>

      <div className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-6 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          <p>
            © {new Date().getFullYear()} {ETABLISSEMENT.sigle} — Conçu et réalisé par {" "}
            <a
              href="https://dians98.vercel.app/"
              target="_blank"
              rel="noopener"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Diano ANDRIANTSALAMA
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
