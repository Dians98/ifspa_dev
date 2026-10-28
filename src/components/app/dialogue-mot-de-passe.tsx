"use client";

import { useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { attributsChamp, ChampFormulaire } from "@/components/app/parametres/champ-formulaire";
import { appliquerErreursServeur } from "@/components/app/parametres/erreurs-serveur";
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
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LONGUEUR_MIN_MOT_DE_PASSE, schemaChangementMotDePasse } from "@/lib/mot-de-passe";
import { changerMonMotDePasse } from "@/server/actions/compte";

type Entree = z.input<typeof schemaChangementMotDePasse>;
type Sortie = z.output<typeof schemaChangementMotDePasse>;

const CHAMPS = ["actuel", "nouveau", "confirmation"] as const;

export function DialogueMotDePasse({ declencheur }: { declencheur: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {/* Démonté à la fermeture : aucun mot de passe ne reste dans le formulaire. */}
        {ouvert && <FormulaireMotDePasse onTermine={() => setOuvert(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function FormulaireMotDePasse({ onTermine }: { onTermine: () => void }) {
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const form = useForm<Entree, unknown, Sortie>({
    resolver: zodResolver(schemaChangementMotDePasse),
    defaultValues: { actuel: "", nouveau: "", confirmation: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const soumettre = form.handleSubmit(async (valeurs) => {
    setErreurGenerale(null);
    try {
      const etat = await changerMonMotDePasse(valeurs);
      if (etat.statut === "succes") {
        toast.success(etat.message);
        onTermine();
      } else setErreurGenerale(appliquerErreursServeur(form, etat, CHAMPS));
    } catch {
      setErreurGenerale(MESSAGE_RESEAU);
    }
  });

  return (
    <form onSubmit={soumettre} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="text-lg">Changer mon mot de passe</DialogTitle>
        <DialogDescription>Vos autres sessions ouvertes seront fermées ; celle-ci reste active.</DialogDescription>
      </DialogHeader>

      {erreurGenerale && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
          {erreurGenerale}
        </p>
      )}

      <FieldGroup className="gap-4">
        <ChampFormulaire id="mdp-actuel" libelle="Mot de passe actuel" erreur={errors.actuel?.message}>
          <Input
            {...attributsChamp("mdp-actuel", { erreur: errors.actuel?.message })}
            {...form.register("actuel")}
            type="password"
            autoComplete="current-password"
            autoFocus
            className="max-md:h-11"
          />
        </ChampFormulaire>

        <ChampFormulaire
          id="mdp-nouveau"
          libelle="Nouveau mot de passe"
          aide={`Au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`}
          erreur={errors.nouveau?.message}
        >
          <Input
            {...attributsChamp("mdp-nouveau", { erreur: errors.nouveau?.message, aide: true })}
            {...form.register("nouveau")}
            type="password"
            autoComplete="new-password"
            className="max-md:h-11"
          />
        </ChampFormulaire>

        <ChampFormulaire id="mdp-confirmation" libelle="Confirmer le nouveau mot de passe" erreur={errors.confirmation?.message}>
          <Input
            {...attributsChamp("mdp-confirmation", { erreur: errors.confirmation?.message })}
            {...form.register("confirmation")}
            type="password"
            autoComplete="new-password"
            className="max-md:h-11"
          />
        </ChampFormulaire>
      </FieldGroup>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="max-md:h-11">
            Annuler
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmitting} className="max-md:h-11">
          {isSubmitting && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
          Changer le mot de passe
        </Button>
      </DialogFooter>
    </form>
  );
}
