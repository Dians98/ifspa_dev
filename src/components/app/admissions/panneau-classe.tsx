import Link from "next/link";
import { CircleCheck, Info } from "lucide-react";
import { DialogueAnnulationPassage } from "@/components/app/admissions/dialogue-annulation-passage";
import { EcranBloque } from "@/components/app/admissions/ecran-bloque";
import { TitreClasse } from "@/components/app/admissions/titre-classe";
import { ValidationClasse } from "@/components/app/admissions/validation-classe";
import { Button } from "@/components/ui/button";
import { libelleClasse } from "@/lib/admissions";
import { libelleNiveau } from "@/lib/parametres";
import { cn } from "@/lib/utils";
import type { ClasseDetail, OperationClasse } from "@/server/lectures/admissions";

function PassageValide({ detail, op, admin }: { detail: ClasseDetail; op: OperationClasse; admin: boolean }) {
  const { classe, source, cible } = detail;
  const exceptions = op.lignes.filter((l) => l.decision === "REDOUBLANT" || l.decision === "ABANDON");

  return (
    <section aria-label={`Passage validé le ${op.date} à ${op.heure}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-paye/30 bg-paye-pale px-4 py-3 text-sm sm:px-5">
        <p className="flex items-start gap-2.5">
          <CircleCheck aria-hidden className="mt-0.5 size-4.5 shrink-0 text-paye" />
          <span>
            <strong>Classe validée</strong> le {op.date} à {op.heure} par {op.par} : {op.resume}.
          </span>
        </p>
        {admin && (
          <DialogueAnnulationPassage
            focaliserTitre
            passage={{
              id: op.id,
              classe: classe.libelle,
              niveau: classe.niveau,
              anneeSource: source.libelle,
              anneeCible: cible?.libelle ?? "",
              quand: `${op.date} à ${op.heure}`,
              comptes: op.comptes,
            }}
            declencheur={
              <Button type="button" variant="destructive" size="sm" className="max-md:h-11">
                Annuler ce passage
              </Button>
            }
          />
        )}
      </div>
      <p className="px-4 pt-3 text-sm text-muted-foreground sm:px-5">
        Liste figée : {op.lignes.length} étudiant{op.lignes.length > 1 ? "s" : ""}
        {exceptions.length > 0 ? `, dont ${exceptions.length} ne ${exceptions.length > 1 ? "passent" : "passe"} pas.` : "."}
      </p>
      <ul aria-label="Décisions du passage" className="mt-2">
        {op.lignes.map((l) => {
          const ne = l.decision === "REDOUBLANT" || l.decision === "ABANDON";
          return (
            <li
              key={l.etudiantId}
              className={cn(
                "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t px-4 py-2.5 sm:px-5",
                ne && "bg-rose-pale",
              )}
            >
              <Link href={`/app/etudiants/${l.etudiantId}`} className={cn("font-semibold hover:underline", ne && "text-rose-fonce")}>
                {l.nom} {l.prenoms}
                <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">{l.matricule}</span>
              </Link>
              <span className={cn("text-sm font-semibold", ne ? "text-rose-fonce" : "text-primary")}>{l.libelleDecision}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Classe choisie : liste à valider, classe validée (figée) ou raison du blocage. */
export function PanneauClasse({
  detail,
  prochaineCle,
  admin,
}: {
  detail: ClasseDetail;
  prochaineCle: string | null;
  admin: boolean;
}) {
  const { classe, source, cible } = detail;
  const suivante = libelleClasse(classe.filiere.nom, classe.niveau + 1);
  const effectif = `${classe.effectif} étudiant${classe.effectif > 1 ? "s" : ""}`;
  const sousTitre = classe.derniereAnnee
    ? `${effectif} · dernière année, diplôme en fin d'année ${source.libelle}`
    : `${effectif} · passage en ${libelleNiveau(classe.niveau + 1)} pour ${cible?.libelle ?? ""}`;

  return (
    <section aria-labelledby="titre-classe" className="overflow-clip rounded-xl border bg-card">
      <div className="px-4 pt-4 pb-1 sm:px-5 sm:pt-5">
        <TitreClasse cle={classe.cle} etat={classe.etat}>
          <span id="titre-classe">{classe.libelle}</span>
        </TitreClasse>
        <p className="mt-1 text-sm text-muted-foreground">{classe.etat === "validee" ? `Année ${source.libelle}` : sousTitre}</p>
      </div>

      {classe.etat === "validee" && (
        <div className="mt-3 grid gap-4">
          {detail.operations.map((op) => (
            <PassageValide key={op.id} detail={detail} op={op} admin={admin} />
          ))}
        </div>
      )}

      {classe.etat === "vide" && (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">
          Aucun étudiant actif dans cette classe en {source.libelle} : il n&apos;y a rien à valider.
        </p>
      )}

      {(classe.etat === "tarif_manquant" || classe.etat === "cible_absente") && cible && (
        <EcranBloque
          titre={
            admin
              ? `Saisissez d'abord le tarif ${cible.libelle} des ${suivante}`
              : `Le tarif ${cible.libelle} des ${suivante} n'est pas encore saisi`
          }
          action={
            admin ? (
              <Button asChild className="max-md:h-11">
                <Link href={`/app/parametres/tarifs?annee=${cible.id}`}>Saisir le tarif {cible.libelle}</Link>
              </Button>
            ) : undefined
          }
        >
          <p>
            {admin
              ? "Sans ce tarif, l'application ne peut pas créer les mensualités de cette classe pour l'année suivante."
              : "Demandez à l'administrateur de le saisir dans Paramètres › Tarifs. Vous pourrez ensuite valider cette classe."}
          </p>
        </EcranBloque>
      )}

      {classe.etat === "a_faire" && (
        <>
          {detail.operations.length > 0 && (
            <p className="mx-4 mt-3 flex gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground sm:mx-5">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              Un passage de cette classe a déjà été validé : la liste ci-dessous ne contient que les étudiants restants.
            </p>
          )}
          {/* La clé suit la liste : si elle change (étudiant ajouté, classe validée ailleurs), les décisions repartent de zéro. */}
          <ValidationClasse
            key={`${classe.cle}:${detail.etudiants.map((e) => e.inscriptionId).join(",")}`}
            detail={detail}
            prochaineCle={prochaineCle}
            admin={admin}
          />
        </>
      )}
    </section>
  );
}
