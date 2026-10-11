"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
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
import { DUREE_MAX, DUREE_MIN, libelleNiveau, schemaFiliere } from "@/lib/parametres";
import type { FiliereParametre } from "@/server/lectures/parametres";
import { creerFiliere, modifierFiliere } from "@/server/actions/parametres";
import { attributsChamp, ChampFormulaire } from "./champ-formulaire";
import { appliquerErreursServeur } from "./erreurs-serveur";
import { MESSAGE_RESEAU } from "./executer-action";

type Entree = z.input<typeof schemaFiliere>;
type Sortie = z.output<typeof schemaFiliere>;

const CHAMPS = ["code", "nom", "dureeAnnees"] as const;
const DUREES = Array.from({ length: DUREE_MAX - DUREE_MIN + 1 }, (_, i) => DUREE_MIN + i);

/** Ajout (sans `filiere`) ou modification d'une filière, dans une fenêtre ouverte par `declencheur`. */
export function DialogueFiliere({ filiere, declencheur }: { filiere?: FiliereParametre; declencheur: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <FormulaireFiliere filiere={filiere} fermer={() => setOuvert(false)} />
      </DialogContent>
    </Dialog>
  );
}

function FormulaireFiliere({ filiere, fermer }: { filiere?: FiliereParametre; fermer: () => void }) {
  const router = useRouter();
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const form = useForm<Entree, unknown, Sortie>({
    resolver: zodResolver(schemaFiliere),
    defaultValues: { code: filiere?.code ?? "", nom: filiere?.nom ?? "", dureeAnnees: filiere?.dureeAnnees ?? 3 },
  });
  const { errors, isSubmitting } = form.formState;
  const codeFige = filiere !== undefined && !filiere.codeModifiable;
  const dureeMinimale = filiere?.dureeMinimale ?? DUREE_MIN;

  const soumettre = form.handleSubmit(async (valeurs) => {
    setErreurGenerale(null);
    try {
      if (filiere) {
        const etat = await modifierFiliere({
          id: filiere.id,
          code: valeurs.code,
          nom: valeurs.nom,
          dureeAnnees: valeurs.dureeAnnees,
        });
        if (etat.statut === "succes") {
          toast.success(etat.message);
          fermer();
        } else setErreurGenerale(appliquerErreursServeur(form, etat, CHAMPS));
        return;
      }
      const etat = await creerFiliere(valeurs);
      if (etat.statut === "succes") {
        toast.success(etat.message, {
          action: { label: "Saisir les tarifs", onClick: () => router.push("/app/parametres/tarifs") },
        });
        fermer();
      } else setErreurGenerale(appliquerErreursServeur(form, etat, CHAMPS));
    } catch {
      setErreurGenerale(MESSAGE_RESEAU);
    }
  });

  return (
    <form onSubmit={soumettre} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="text-lg">{filiere ? `Modifier la filière ${filiere.code}` : "Ajouter une filière"}</DialogTitle>
        <DialogDescription>
          {filiere
            ? "Le nom et la durée peuvent changer à tout moment."
            : "Les tarifs de la nouvelle filière se saisissent ensuite dans l'onglet Tarifs."}
        </DialogDescription>
      </DialogHeader>

      {erreurGenerale && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
          {erreurGenerale}
        </p>
      )}

      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampFormulaire
            id="filiere-code"
            libelle="Code"
            erreur={errors.code?.message}
            aide={
              codeFige
                ? `Le code ne peut plus changer : des étudiants ont déjà un matricule ${filiere?.code}-…`
                : "2 ou 3 lettres, préfixe du matricule (ex. IF-2026-0001)."
            }
          >
            <Input
              {...attributsChamp("filiere-code", { erreur: errors.code?.message, aide: true })}
              {...form.register("code")}
              placeholder="ex. KN"
              maxLength={3}
              autoComplete="off"
              readOnly={codeFige}
              className="uppercase max-md:h-11"
            />
          </ChampFormulaire>

          <ChampFormulaire
            id="filiere-duree"
            libelle="Durée des études"
            erreur={errors.dureeAnnees?.message}
            aide={
              dureeMinimale > DUREE_MIN
                ? `Au moins ${dureeMinimale} ans : des étudiants sont inscrits jusqu'en ${libelleNiveau(dureeMinimale)}.`
                : undefined
            }
          >
            <Controller
              control={form.control}
              name="dureeAnnees"
              render={({ field }) => (
                <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                  <SelectTrigger
                    ref={field.ref}
                    onBlur={field.onBlur}
                    className="w-full max-md:h-11"
                    {...attributsChamp("filiere-duree", {
                      erreur: errors.dureeAnnees?.message,
                      aide: dureeMinimale > DUREE_MIN,
                    })}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {DUREES.map((n) => (
                      <SelectItem key={n} value={String(n)} disabled={n < dureeMinimale}>
                        {n} {n > 1 ? "ans" : "an"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </ChampFormulaire>
        </div>

        <ChampFormulaire id="filiere-nom" libelle="Nom de la filière" erreur={errors.nom?.message}>
          <Input
            {...attributsChamp("filiere-nom", { erreur: errors.nom?.message })}
            {...form.register("nom")}
            placeholder="ex. Kinésithérapeutes"
            autoComplete="off"
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
          Enregistrer la filière
        </Button>
      </DialogFooter>
    </form>
  );
}
