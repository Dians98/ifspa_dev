"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
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
import { reinitialiserMotDePasse } from "@/server/actions/utilisateurs";
import { MESSAGE_RESEAU } from "./executer-action";
import { ResultatMotDePasse } from "./resultat-mot-de-passe";

/** Confirmation, puis affichage unique du nouveau mot de passe provisoire. */
export function DialogueReinitialisation({
  userId,
  nom,
  declencheur,
}: {
  userId: string;
  nom: string;
  declencheur: ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [motDePasse, setMotDePasse] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  function changer(valeur: boolean) {
    if (enCours) return;
    setOuvert(valeur);
    if (!valeur) {
      setMotDePasse(null);
      setErreur(null);
    }
  }

  async function reinitialiser() {
    setEnCours(true);
    setErreur(null);
    try {
      const etat = await reinitialiserMotDePasse({ userId });
      if (etat.statut === "succes") setMotDePasse(etat.donnees.motDePasse);
      else setErreur(etat.message);
    } catch {
      setErreur(MESSAGE_RESEAU);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={changer}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => {
          if (motDePasse) e.preventDefault();
        }}
      >
        {motDePasse ? (
          <ResultatMotDePasse
            titre={`Nouveau mot de passe pour ${nom}`}
            description="L'ancien mot de passe ne fonctionne plus. Remettez-lui celui-ci."
            motDePasse={motDePasse}
          />
        ) : (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle className="text-lg">Réinitialiser le mot de passe de {nom} ?</DialogTitle>
              <DialogDescription>
                Son mot de passe actuel cessera de fonctionner et ses sessions ouvertes seront fermées. Un mot de passe
                provisoire s&apos;affichera une seule fois.
              </DialogDescription>
            </DialogHeader>
            {erreur && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
                {erreur}
              </p>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={enCours} className="max-md:h-11">
                  Annuler
                </Button>
              </DialogClose>
              <Button type="button" disabled={enCours} onClick={() => void reinitialiser()} className="max-md:h-11">
                {enCours && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
                Réinitialiser le mot de passe
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
