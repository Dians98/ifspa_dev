"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MESSAGE_RESEAU } from "@/components/app/parametres/executer-action";
import { demanderFocusTitre } from "@/components/app/admissions/titre-classe";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ComptesDecisions } from "@/lib/admissions";
import { libelleNiveau } from "@/lib/parametres";
import { annulerOperation, chargerBlocageAnnulation } from "@/server/actions/admissions";
import type { BlocageAnnulation } from "@/server/lectures/admissions";

export type PassageAAnnuler = {
  id: string;
  classe: string;
  niveau: number;
  anneeSource: string;
  anneeCible: string;
  /** « 11/10/2026 à 10:24 » */
  quand: string;
  comptes: ComptesDecisions;
};

type Verification =
  | { etat: "chargement" }
  | { etat: "possible" }
  | { etat: "bloque"; refus: string; recus: BlocageAnnulation["recusBloquants"] }
  | { etat: "erreur"; message: string };

const pluriel = (n: number, s: string, p: string) => (n > 1 ? p : s);

/** Les effets de l'annulation, déduits des décisions du passage (le serveur restaure exactement ces états). */
function effets(p: PassageAAnnuler): string[] {
  const { admis, redoublants, diplomes, abandons } = p.comptes;
  const niveau = `${libelleNiveau(p.niveau)} ${p.anneeSource}`;
  const liste: string[] = [];
  const creees = admis + redoublants;
  if (creees > 0) {
    liste.push(
      `${creees} ${pluriel(creees, "inscription créée", "inscriptions créées")} en ${p.anneeCible}, avec leurs mensualités, ${pluriel(creees, "est supprimée", "sont supprimées")}.`,
    );
  }
  if (admis > 0) liste.push(`${admis} ${pluriel(admis, "admis reprend", "admis reprennent")} son inscription en cours en ${niveau}.`);
  if (redoublants > 0) {
    liste.push(`${redoublants} ${pluriel(redoublants, "redoublant reprend", "redoublants reprennent")} son inscription en cours en ${niveau}.`);
  }
  if (diplomes > 0) liste.push(`${diplomes} ${pluriel(diplomes, "diplômé(e) reprend", "diplômé(e)s reprennent")} le statut « Actif ».`);
  if (abandons > 0) liste.push(`${abandons} ${pluriel(abandons, "abandon reprend", "abandons reprennent")} le statut « Actif ».`);
  liste.push("La classe redevient « À faire ».");
  return liste;
}

/** Admin seulement (le serveur revérifie). Le blocage est relu à l'ouverture : un reçu a pu être émis depuis l'affichage. */
export function DialogueAnnulationPassage({
  passage,
  declencheur,
  focaliserTitre = false,
}: {
  passage: PassageAAnnuler;
  declencheur: ReactNode;
  focaliserTitre?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [verification, setVerification] = useState<Verification>({ etat: "chargement" });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function changerOuverture(valeur: boolean) {
    if (enCours) return;
    setOuvert(valeur);
    if (!valeur) return;
    setErreur(null);
    setVerification({ etat: "chargement" });
    try {
      const blocage = await chargerBlocageAnnulation(passage.id);
      if (!blocage) setVerification({ etat: "erreur", message: "Ce passage n'existe plus. Rechargez la page." });
      else if (blocage.annulable) setVerification({ etat: "possible" });
      else setVerification({ etat: "bloque", refus: blocage.refus ?? "Ce passage ne peut pas être annulé.", recus: blocage.recusBloquants });
    } catch {
      setVerification({ etat: "erreur", message: MESSAGE_RESEAU });
    }
  }

  async function annuler() {
    setEnCours(true);
    setErreur(null);
    try {
      const etat = await annulerOperation({ operationId: passage.id });
      if (etat.statut === "succes") {
        if (focaliserTitre) demanderFocusTitre();
        toast.success(etat.message);
        setOuvert(false);
      } else setErreur(etat.message);
    } catch {
      setErreur(MESSAGE_RESEAU);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={changerOuverture}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {verification.etat === "bloque" ? "Annulation impossible" : "Annuler ce passage ?"}
          </DialogTitle>
          <DialogDescription>
            {passage.classe} · {passage.anneeSource} vers {passage.anneeCible} · validé le {passage.quand}
          </DialogDescription>
        </DialogHeader>

        {verification.etat === "chargement" && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            Vérification des paiements en cours…
          </p>
        )}

        {verification.etat === "possible" && (
          <div className="grid gap-3 text-sm">
            <p>Les étudiants reviennent à leur état d&apos;avant le passage :</p>
            <ul className="list-disc space-y-1 pl-5">
              {effets(passage).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <p className="rounded-lg bg-secondary px-3 py-2 text-secondary-foreground">
              Aucun reçu n&apos;existe sur ces nouvelles inscriptions : l&apos;annulation est possible.
            </p>
          </div>
        )}

        {verification.etat === "bloque" && (
          <Alert variant="destructive" className="border-destructive/30 bg-retard-pale">
            <AlertDescription className="text-destructive">{verification.refus}</AlertDescription>
          </Alert>
        )}

        {verification.etat === "bloque" && verification.recus.length > 0 && (
          <section aria-labelledby="recus-bloquants" className="text-sm">
            <h3 id="recus-bloquants" className="mb-1.5 font-semibold">
              Reçus concernés ({verification.recus.length})
            </h3>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {verification.recus.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/app/paiements/${r.id}/recu`}
                    className="inline-flex min-h-6 items-center font-semibold text-primary tabular-nums underline underline-offset-4 max-md:min-h-11"
                  >
                    {r.numeroRecu}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {verification.etat === "erreur" && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
            {verification.message}
          </p>
        )}

        {erreur && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
            {erreur}
          </p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={enCours} className="max-md:h-11">
              {verification.etat === "possible" ? "Garder le passage" : "Fermer"}
            </Button>
          </DialogClose>
          {verification.etat === "possible" && (
            <Button type="button" variant="destructive" onClick={annuler} disabled={enCours} className="max-md:h-11">
              {enCours && <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />}
              Annuler le passage
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
