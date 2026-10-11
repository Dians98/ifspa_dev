"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { RadioGroup } from "@/components/ui/radio-group";
import { modifierTranchesDroits } from "@/server/actions/etudiants";
import { MESSAGE_RESEAU } from "@/components/app/parametres/executer-action";
import { ChoixRadio } from "./champs-identite";

/** Redécoupage des droits : proposé seulement tant qu'aucun paiement ne les touche (le serveur revérifie). */
export function DialogueTranchesDroits({
  inscriptionId,
  annee,
  actuel,
}: {
  inscriptionId: string;
  annee: string;
  actuel: number;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState(String(actuel));
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  function changerOuverture(valeur: boolean) {
    if (enCours) return;
    setOuvert(valeur);
    if (valeur) {
      setChoix(String(actuel));
      setErreur(null);
    }
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      const etat = await modifierTranchesDroits({ inscriptionId, droitsEnTranches: Number(choix) as 1 | 2 | 3 });
      if (etat.statut === "succes") {
        toast.success(etat.message);
        setOuvert(false);
      } else setErreur(etat.message);
    } catch {
      setErreur(MESSAGE_RESEAU);
    } finally {
      setEnCours(false);
    }
  }

  const identique = Number(choix) === actuel;

  return (
    <Dialog open={ouvert} onOpenChange={changerOuverture}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Modifier le paiement des droits ${annee}`} className="max-md:h-11">
          Modifier
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enregistrer} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg">Droits d&apos;inscription {annee}</DialogTitle>
            <DialogDescription>
              Choisissez en combien de fois les droits sont payés. Possible tant qu&apos;aucun paiement n&apos;a été enregistré dessus.
            </DialogDescription>
          </DialogHeader>

          {erreur && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
              {erreur}
            </p>
          )}

          <RadioGroup value={choix} onValueChange={setChoix} aria-label="Nombre de tranches" className="flex flex-wrap gap-2">
            {[1, 2, 3].map((n) => (
              <ChoixRadio key={n} id={`tranches-${inscriptionId}-${n}`} valeur={String(n)}>
                En {n} fois
              </ChoixRadio>
            ))}
          </RadioGroup>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="max-md:h-11">
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit" disabled={enCours || identique} className="max-md:h-11">
              {enCours && <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />}
              {identique ? "Choisissez un autre découpage" : `Payer les droits en ${choix} fois`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
