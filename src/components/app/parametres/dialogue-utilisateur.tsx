"use client";

import { useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLES, schemaNouvelUtilisateur } from "@/lib/parametres";
import { LIBELLE_ROLE } from "@/lib/roles";
import { creerUtilisateur } from "@/server/actions/utilisateurs";
import { attributsChamp, ChampFormulaire } from "./champ-formulaire";
import { appliquerErreursServeur } from "./erreurs-serveur";
import { MESSAGE_RESEAU } from "./executer-action";
import { ResultatMotDePasse } from "./resultat-mot-de-passe";

type Entree = z.input<typeof schemaNouvelUtilisateur>;
type Sortie = z.output<typeof schemaNouvelUtilisateur>;

const CHAMPS = ["nom", "email", "role"] as const;

const AIDE_ROLE = {
  user: "Inscrit les étudiants, encaisse, imprime les reçus et lance les admissions. Ne peut ni supprimer ni annuler, et n'accède pas aux Paramètres.",
  admin: "A tous les droits : annulations, suppressions et Paramètres.",
} as const;

export function DialogueUtilisateur({ declencheur }: { declencheur: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  const [cree, setCree] = useState<{ nom: string; motDePasse: string } | null>(null);

  function changer(valeur: boolean) {
    setOuvert(valeur);
    if (!valeur) setCree(null);
  }

  return (
    <Dialog open={ouvert} onOpenChange={changer}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        // Évite de perdre le mot de passe sur un clic à côté : il ne s'affiche qu'une fois.
        onInteractOutside={(e) => {
          if (cree) e.preventDefault();
        }}
      >
        {cree ? (
          <ResultatMotDePasse
            titre={`Compte créé pour ${cree.nom}`}
            description="Remettez-lui ce mot de passe provisoire pour sa première connexion."
            motDePasse={cree.motDePasse}
          />
        ) : (
          <FormulaireUtilisateur onCree={setCree} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormulaireUtilisateur({ onCree }: { onCree: (c: { nom: string; motDePasse: string }) => void }) {
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const form = useForm<Entree, unknown, Sortie>({
    resolver: zodResolver(schemaNouvelUtilisateur),
    defaultValues: { nom: "", email: "", role: "user" },
  });
  const { errors, isSubmitting } = form.formState;
  const role = useWatch({ control: form.control, name: "role" });

  const soumettre = form.handleSubmit(async (valeurs) => {
    setErreurGenerale(null);
    try {
      const etat = await creerUtilisateur(valeurs);
      if (etat.statut === "succes") {
        toast.success(etat.message);
        onCree({ nom: valeurs.nom, motDePasse: etat.donnees.motDePasse });
      } else setErreurGenerale(appliquerErreursServeur(form, etat, CHAMPS));
    } catch {
      setErreurGenerale(MESSAGE_RESEAU);
    }
  });

  return (
    <form onSubmit={soumettre} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="text-lg">Nouvel utilisateur</DialogTitle>
        <DialogDescription>
          Un mot de passe provisoire est généré : il s&apos;affiche à l&apos;étape suivante, une seule fois.
        </DialogDescription>
      </DialogHeader>

      {erreurGenerale && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
          {erreurGenerale}
        </p>
      )}

      <FieldGroup className="gap-4">
        <ChampFormulaire id="utilisateur-nom" libelle="Nom" erreur={errors.nom?.message}>
          <Input
            {...attributsChamp("utilisateur-nom", { erreur: errors.nom?.message })}
            {...form.register("nom")}
            placeholder="ex. Hanitra Rakoto"
            autoComplete="off"
            className="max-md:h-11"
          />
        </ChampFormulaire>

        <ChampFormulaire id="utilisateur-email" libelle="Courriel" erreur={errors.email?.message}>
          <Input
            {...attributsChamp("utilisateur-email", { erreur: errors.email?.message })}
            {...form.register("email")}
            type="email"
            inputMode="email"
            placeholder="ex. secretariat@ifspa.mg"
            autoComplete="off"
            className="max-md:h-11"
          />
        </ChampFormulaire>

        <ChampFormulaire id="utilisateur-role" libelle="Rôle" erreur={errors.role?.message} aide={AIDE_ROLE[role]}>
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  ref={field.ref}
                  onBlur={field.onBlur}
                  className="w-full max-md:h-11"
                  {...attributsChamp("utilisateur-role", { erreur: errors.role?.message, aide: true })}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {LIBELLE_ROLE[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
          Créer le compte
        </Button>
      </DialogFooter>
    </form>
  );
}
