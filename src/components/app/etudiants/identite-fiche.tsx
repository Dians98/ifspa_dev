import type { DossierEtudiant } from "@/server/lectures/etudiants";
import { PanneauParametre } from "@/components/app/parametres/panneau-parametre";

const NON_RENSEIGNE = <span className="text-muted-foreground">Non renseigné</span>;

export function IdentiteFiche({ e }: { e: DossierEtudiant }) {
  const lignes: [string, React.ReactNode][] = [
    ["Nom", e.nom],
    ["Prénoms", e.prenoms],
    ["Sexe", e.libelleSexe],
    ["Date de naissance", e.dateNaissanceAffichee],
    ["Lieu de naissance", e.lieuNaissance],
    ["CIN", e.cin ?? NON_RENSEIGNE],
    [
      "Téléphone",
      e.telephone ? (
        <a href={`tel:${e.telephone.replace(/\s/g, "")}`} className="text-primary underline underline-offset-2">
          {e.telephoneAffiche}
        </a>
      ) : (
        NON_RENSEIGNE
      ),
    ],
    [
      "E-mail",
      e.email ? (
        <a href={`mailto:${e.email}`} className="text-primary underline underline-offset-2">
          {e.email}
        </a>
      ) : (
        NON_RENSEIGNE
      ),
    ],
    ["Adresse", e.adresse ?? NON_RENSEIGNE],
    [
      "Tuteur",
      e.tuteur ? (
        <>
          {e.tuteur.nom}
          {e.tuteur.profession && <span className="block font-normal text-muted-foreground">{e.tuteur.profession}</span>}
          {e.tuteur.telephone && (
            <a href={`tel:${e.tuteur.telephone}`} className="block text-primary underline underline-offset-2">
              {e.tuteur.telephoneAffiche}
            </a>
          )}
        </>
      ) : (
        NON_RENSEIGNE
      ),
    ],
    ["Année d'entrée", e.anneeEntree],
    ["Inscrit par", e.creePar ?? NON_RENSEIGNE],
  ];

  return (
    <PanneauParametre titre="État civil et contact">
      <dl className="grid gap-x-8 gap-y-4 p-4 text-sm sm:grid-cols-2 sm:p-5">
        {lignes.map(([libelle, valeur]) => (
          <div key={libelle}>
            <dt className="text-muted-foreground">{libelle}</dt>
            <dd className="mt-0.5 font-medium break-words tabular-nums">{valeur}</dd>
          </div>
        ))}
      </dl>
    </PanneauParametre>
  );
}
