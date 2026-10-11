"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { EtatAction } from "@/lib/etat-action";
import { MESSAGE_RESEAU } from "./executer-action";

type Props = {
  titre: string;
  description: ReactNode;
  libelleAction: string;
  /** Action irréversible ou qui coupe un accès : bouton rouge. */
  destructif?: boolean;
  action: () => Promise<EtatAction<unknown>>;
  /** Bouton qui ouvre la confirmation ; sinon, ouverture pilotée par `ouvert`. */
  declencheur?: ReactNode;
  ouvert?: boolean;
  onOuvertChange?: (ouvert: boolean) => void;
};

/** Une seule confirmation explicite ; l'erreur du serveur reste dans la fenêtre pour être lue. */
export function ConfirmationAction({
  titre,
  description,
  libelleAction,
  destructif,
  action,
  declencheur,
  ouvert: ouvertPilote,
  onOuvertChange,
}: Props) {
  const [ouvertInterne, setOuvertInterne] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const ouvert = ouvertPilote ?? ouvertInterne;

  function changer(valeur: boolean) {
    if (enCours) return;
    if (!valeur) setErreur(null);
    (onOuvertChange ?? setOuvertInterne)(valeur);
  }

  async function confirmer(e: React.MouseEvent) {
    // Garde la fenêtre ouverte : elle se ferme seulement si le serveur accepte.
    e.preventDefault();
    if (enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      const etat = await action();
      if (etat.statut === "succes") {
        toast.success(etat.message);
        (onOuvertChange ?? setOuvertInterne)(false);
      } else {
        setErreur(etat.message);
      }
    } catch {
      setErreur(MESSAGE_RESEAU);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <AlertDialog open={ouvert} onOpenChange={changer}>
      {declencheur && <AlertDialogTrigger asChild>{declencheur}</AlertDialogTrigger>}
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg">{titre}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {erreur && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
            {erreur}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enCours} className="max-md:h-11">
            Annuler
          </AlertDialogCancel>
          <AlertDialogAction
            variant={destructif ? "destructive" : "default"}
            disabled={enCours}
            onClick={confirmer}
            className="max-md:h-11"
          >
            {enCours && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
            {libelleAction}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
