"use client";

import { useState, type ReactNode } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { MESSAGE_RESEAU } from "@/components/app/parametres/executer-action";
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
import { formaterAriary } from "@/lib/montant";
import { marquerVerifie } from "@/server/actions/paiements";

export type PaiementAVerifier = {
  id: string;
  numeroRecu: string;
  date: string;
  heure: string;
  montant: number;
  modeLibelle: string;
  etudiant: string;
  matricule: string;
  note: string | null;
};

/** Clôt un paiement « à vérifier » (admin) : rappelle la note du serveur, ne change aucun montant. */
export function DialogueVerificationPaiement({ paiement, declencheur }: { paiement: PaiementAVerifier; declencheur: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function confirmer() {
    setEnCours(true);
    setErreur(null);
    try {
      const etat = await marquerVerifie({ paiementId: paiement.id });
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

  return (
    <Dialog
      open={ouvert}
      onOpenChange={(o) => {
        setOuvert(o);
        if (o) setErreur(null);
      }}
    >
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Vérifier le reçu {paiement.numeroRecu}</DialogTitle>
          <DialogDescription>Ce paiement a été saisi hors ligne puis enregistré avec une remarque.</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Reçu</dt>
          <dd className="font-semibold">
            {paiement.numeroRecu} du {paiement.date} à {paiement.heure}
          </dd>
          <dt className="text-muted-foreground">Étudiant</dt>
          <dd className="font-semibold">
            {paiement.etudiant} <span className="font-normal text-muted-foreground">{paiement.matricule}</span>
          </dd>
          <dt className="text-muted-foreground">Montant</dt>
          <dd className="font-semibold tabular-nums">
            {formaterAriary(paiement.montant)} · {paiement.modeLibelle}
          </dd>
        </dl>

        <div className="flex items-start gap-2 rounded-lg border border-attention/40 bg-attention-pale px-3 py-2.5 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-attention" aria-hidden />
          <p>
            <b>À vérifier : </b>
            {paiement.note ?? "aucune remarque enregistrée."}
          </p>
        </div>

        {erreur && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
            {erreur}
          </p>
        )}

        <p className="text-sm text-muted-foreground">
          « Marquer comme vérifié » ne change aucun montant : le reçu reste valide et la vérification est enregistrée à votre nom. Si le
          paiement est faux, fermez cette fenêtre et annulez le reçu.
        </p>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="max-md:h-11">
              Pas maintenant
            </Button>
          </DialogClose>
          <Button type="button" disabled={enCours} onClick={() => void confirmer()} className="max-md:h-11">
            {enCours && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
            Marquer le reçu {paiement.numeroRecu} comme vérifié
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
