"use client";

import { useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { appliquerErreursServeur } from "@/components/app/parametres/erreurs-serveur";
import { MESSAGE_RESEAU } from "@/components/app/parametres/executer-action";
import { attributsChamp, ChampFormulaire } from "@/components/app/parametres/champ-formulaire";
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
import { Textarea } from "@/components/ui/textarea";
import { schemaAnnulationPaiement } from "@/lib/encaissement";
import { formaterAriary } from "@/lib/montant";
import { annulerPaiement } from "@/server/actions/paiements";

type Entree = z.input<typeof schemaAnnulationPaiement>;
type Sortie = z.output<typeof schemaAnnulationPaiement>;

export type PaiementAAnnuler = {
  id: string;
  numeroRecu: string;
  date: string;
  heure: string;
  montant: number;
  modeLibelle: string;
  etudiant: string;
  matricule: string;
};

/** Annulation d'un reçu (admin) : le motif est obligatoire, le reçu reste dans l'historique marqué annulé. */
export function DialogueAnnulationPaiement({ paiement, declencheur }: { paiement: PaiementAAnnuler; declencheur: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <FormulaireAnnulation paiement={paiement} fermer={() => setOuvert(false)} />
      </DialogContent>
    </Dialog>
  );
}

function FormulaireAnnulation({ paiement, fermer }: { paiement: PaiementAAnnuler; fermer: () => void }) {
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const form = useForm<Entree, unknown, Sortie>({
    resolver: zodResolver(schemaAnnulationPaiement),
    defaultValues: { paiementId: paiement.id, motif: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const soumettre = form.handleSubmit(
    async (valeurs) => {
      setErreurGenerale(null);
      try {
        const etat = await annulerPaiement(valeurs);
        if (etat.statut === "succes") {
          toast.success(etat.message);
          fermer();
        } else {
          const generale = appliquerErreursServeur(form, etat, ["motif"] as const);
          setErreurGenerale(generale);
          // La ligne se rafraîchit et peut retirer cette fenêtre (reçu déjà annulé) : le refus doit survivre.
          if (generale) toast.error(generale);
        }
      } catch {
        setErreurGenerale(MESSAGE_RESEAU);
      }
    },
    () => form.setFocus("motif"),
  );

  return (
    <form onSubmit={soumettre} noValidate className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <DialogHeader>
        <DialogTitle className="text-lg">Annuler le reçu {paiement.numeroRecu}</DialogTitle>
        <DialogDescription>À utiliser pour une erreur de saisie, un doublon ou un paiement rejeté.</DialogDescription>
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

      {erreurGenerale && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
          {erreurGenerale}
        </p>
      )}

      <ChampFormulaire id="motif-annulation" libelle="Motif de l'annulation" erreur={errors.motif?.message}>
        <Textarea
          {...attributsChamp("motif-annulation", { erreur: errors.motif?.message })}
          {...form.register("motif")}
          placeholder="Ex. doublon de saisie avec le reçu R-2026-00016"
          rows={3}
          className="max-h-40 min-w-0 max-w-full break-all"
        />
      </ChampFormulaire>

      <p className="text-sm text-muted-foreground">
        Le reçu reste dans l&apos;historique, marqué ANNULÉ. Les échéances qu&apos;il payait redeviennent dues. L&apos;annulation est
        enregistrée à votre nom.
      </p>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="max-md:h-11">
            Garder le reçu
          </Button>
        </DialogClose>
        <Button type="submit" variant="destructive" disabled={isSubmitting} className="max-md:h-11">
          {isSubmitting && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
          Annuler le reçu {paiement.numeroRecu}
        </Button>
      </DialogFooter>
    </form>
  );
}
