import type { Metadata } from "next";
import Link from "next/link";
import { EcranBloque } from "@/components/app/admissions/ecran-bloque";
import { ListeClasses } from "@/components/app/admissions/liste-classes";
import { PanneauClasse } from "@/components/app/admissions/panneau-classe";
import { EtatVide } from "@/components/app/parametres/panneau-parametre";
import { Button } from "@/components/ui/button";
import { exigerSessionPage } from "@/server/acces";
import { lireClasse, type ClasseAdmission } from "@/server/lectures/admissions";
import { lireEcran } from "./lecture";

export const metadata: Metadata = { title: "Passage en année supérieure" };

/** Classe demandée dans l'URL ; sinon la première à faire, puis la première qui a des étudiants. */
function classeChoisie(classes: ClasseAdmission[], cle: string | undefined): ClasseAdmission | undefined {
  return (
    classes.find((c) => c.cle === cle) ??
    classes.find((c) => c.etat === "a_faire") ??
    classes.find((c) => c.effectif > 0) ??
    classes[0]
  );
}

/** Après une validation : la suivante à faire dans l'ordre de la liste, en repartant du début s'il le faut. */
function classeSuivante(classes: ClasseAdmission[], courante: ClasseAdmission): string | null {
  const rang = classes.indexOf(courante);
  const ordre = [...classes.slice(rang + 1), ...classes.slice(0, rang)];
  return ordre.find((c) => c.etat === "a_faire")?.cle ?? null;
}

export default async function PageAdmissions({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string | string[] }>;
}) {
  const { admin } = await exigerSessionPage();
  const [ecran, { classe: cleDemandee }] = await Promise.all([lireEcran(), searchParams]);

  if (ecran.refus) {
    return (
      <section aria-label="Passage impossible" className="rounded-xl border bg-card">
        <EcranBloque
          titre="Le passage en année supérieure n'est pas possible pour le moment"
          action={
            admin ? (
              <Button asChild className="max-md:h-11">
                <Link href="/app/parametres/annees">Ouvrir Paramètres › Années scolaires</Link>
              </Button>
            ) : undefined
          }
        >
          <p>{ecran.refus}</p>
        </EcranBloque>
      </section>
    );
  }

  const courante = classeChoisie(ecran.classes, Array.isArray(cleDemandee) ? cleDemandee[0] : cleDemandee);
  if (!courante) {
    return (
      <section aria-label="Classes" className="rounded-xl border bg-card">
        <EtatVide
          texte={
            admin
              ? "Aucune classe n'est définie. Créez d'abord une filière dans Paramètres › Filières."
              : "Aucune classe n'est définie. Demandez à l'administrateur de créer les filières dans Paramètres › Filières."
          }
          action={
            admin ? (
              <Button asChild className="max-md:h-11">
                <Link href="/app/parametres/filieres">Ouvrir les filières</Link>
              </Button>
            ) : undefined
          }
        />
      </section>
    );
  }

  const detail = await lireClasse(courante.filiere.id, courante.niveau);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <ListeClasses classes={ecran.classes} courante={courante.cle} />
      {detail ? (
        <PanneauClasse detail={detail} prochaineCle={classeSuivante(ecran.classes, courante)} admin={admin} />
      ) : (
        <section className="rounded-xl border bg-card">
          <EtatVide texte="Cette classe n'existe plus dans le passage en cours. Choisissez-en une dans la liste." />
        </section>
      )}
    </div>
  );
}
