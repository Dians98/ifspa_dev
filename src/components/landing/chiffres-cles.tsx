import { BriefcaseMedical, CalendarDays, GraduationCap, Handshake, type LucideIcon } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { CHIFFRES_CLES, ETABLISSEMENT, type ChiffreCle } from "@/lib/etablissement-constantes";
import { CompteurAnime } from "./compteur-anime";
import { formaterNombre, type FormatChiffre } from "./formater-chiffre";

type Chiffre = {
  cle: string;
  valeur: number | null;
  /** « + » devant le nombre : un ordre de grandeur, pas un chiffre exact. */
  plus: boolean;
  format: FormatChiffre;
  libelle: string;
  precision: string | null;
  icone: LucideIcon;
};

const ICONES: Record<ChiffreCle["nature"], LucideIcon> = {
  etudiants: GraduationCap,
  insertion: BriefcaseMedical,
  partenaires: Handshake,
};

/** L'ancienneté se calcule depuis l'année de fondation ; les autres chiffres viennent de l'institut. */
function chiffres(): Chiffre[] {
  return [
    {
      cle: "existence",
      valeur: new Date().getFullYear() - ETABLISSEMENT.anneeFondation,
      plus: false,
      format: "entier",
      libelle: "ans d'existence",
      precision: `depuis ${ETABLISSEMENT.anneeFondation}`,
      icone: CalendarDays,
    },
    ...CHIFFRES_CLES.map((c) => ({
      cle: c.nature,
      valeur: c.valeur,
      plus: true,
      format: (c.nature === "insertion" ? "pourcentage" : "entier") as FormatChiffre,
      libelle: c.libelle,
      precision: c.precision,
      icone: ICONES[c.nature],
    })),
  ];
}

function Nombre({ c }: { c: Chiffre }) {
  const classe = "font-heading text-5xl leading-none font-semibold text-primary xl:text-6xl";
  if (c.valeur === null) {
    return (
      <p className={classe}>
        <span aria-hidden>—</span>
        <span className="sr-only">Chiffre bientôt disponible</span>
      </p>
    );
  }
  return (
    <p className={classe}>
      <span aria-hidden>
        {c.plus && <span className="mr-1 align-[0.32em] text-[0.55em] text-rose">+</span>}
        <CompteurAnime valeur={c.valeur} formater={c.format} />
      </span>
      <span className="sr-only">
        {c.plus ? "Plus de " : ""}
        {formaterNombre(c.valeur, c.format)}
      </span>
    </p>
  );
}

export function ChiffresCles() {
  return (
    <section id="chiffres" aria-labelledby="chiffres-titre" className="scroll-mt-20 border-t bg-bleu-pale/70">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        <h2
          id="chiffres-titre"
          className="titre-section text-3xl font-bold tracking-tight text-primary after:mt-4 after:block after:h-1 after:w-12 after:rounded-full after:bg-rose after:content-[''] sm:text-4xl"
        >
          L&apos;IFSPA en chiffres
        </h2>
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {chiffres().map((c, i) => {
            const Icone = c.icone;
            return (
              <Reveal
                as="li"
                key={c.cle}
                delai={i * 0.1}
                className="relative flex min-h-48 flex-col rounded-xl border-t-4 border-rose bg-card p-7 shadow-[0_12px_32px_-18px_rgb(30_58_95/0.35)]"
              >
                {/* Repère en filigrane, dans la carte : le chiffre garde la vedette. */}
                <Icone className="absolute right-6 bottom-6 size-14 text-bleu/15" strokeWidth={1.25} aria-hidden />
                <Nombre c={c} />
                <p className="mt-4 pr-16 text-base font-semibold text-foreground">{c.libelle}</p>
                {c.precision && <p className="mt-1 pr-16 text-sm text-muted-foreground">{c.precision}</p>}
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
