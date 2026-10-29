"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Info, Loader2 } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LIBELLE_FRAIS_MAX } from "@/lib/frais";
import { formaterAriary, formaterNombre, lireMontant } from "@/lib/montant";
import { apercuFrais, creerFrais, modifierFrais } from "@/server/actions/frais";
import type { ClasseOption, FraisLigne, PageFrais } from "@/server/lectures/frais";
import { attributsChamp, ChampFormulaire } from "./champ-formulaire";
import { appliquerErreursServeur } from "./erreurs-serveur";
import { MESSAGE_RESEAU } from "./executer-action";

type Valeurs = { libelle: string; montant: string; mois: string; classes: string[] };

const CHAMPS = ["libelle", "montant", "mois", "classes"] as const;
const cleClasse = (c: { filiereId: string; niveau: number }) => `${c.filiereId}:${c.niveau}`;

type Apercu = { statut: "attente" } | { statut: "ok"; phrase: string } | { statut: "refus"; message: string };

type Props = {
  page: PageFrais;
  /** Absent : création. Présent : modification de ce frais. */
  frais?: FraisLigne;
  declencheur: ReactNode;
};

export function DialogueFrais({ page, frais, declencheur }: Props) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <FormulaireFrais page={page} frais={frais} fermer={() => setOuvert(false)} />
      </DialogContent>
    </Dialog>
  );
}

function FormulaireFrais({ page, frais, fermer }: { page: PageFrais; frais?: FraisLigne; fermer: () => void }) {
  const router = useRouter();
  const modification = frais !== undefined;
  const annee = page.annee!;
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);

  // Un mois déjà passé reste proposé en modification : c'est celui du frais.
  const moisProposes =
    frais && !page.moisPossibles.some((m) => m.valeur === frais.mois)
      ? [{ valeur: frais.mois, libelle: frais.libelleMois }, ...page.moisPossibles]
      : page.moisPossibles;

  const form = useForm<Valeurs>({
    defaultValues: {
      libelle: frais?.libelle ?? "",
      montant: frais ? formaterNombre(frais.montant) : "",
      mois: frais?.mois ?? page.moisPossibles[0]?.valeur ?? "",
      classes: [],
    },
  });
  const { errors, isSubmitting } = form.formState;
  const [libelle, montant, mois, classes] = useWatch({ control: form.control, name: ["libelle", "montant", "mois", "classes"] });

  const montantLu = lireMontant(montant);
  const parCle = new Map(page.classes.map((c) => [cleClasse(c), c]));

  // Récapitulatif demandé au serveur dès que montant, mois et classes sont complets ; une réponse
  // d'une saisie précédente est ignorée (la clé ne correspond plus).
  const cleSaisie = !modification && montantLu.ok && mois && classes.length > 0 ? `${montantLu.valeur}|${mois}|${[...classes].sort().join(",")}` : null;
  const [reponse, setReponse] = useState<{ cle: string; apercu: Apercu } | null>(null);
  const apercu: Apercu = cleSaisie !== null && reponse?.cle === cleSaisie ? reponse.apercu : { statut: "attente" };

  useEffect(() => {
    if (cleSaisie === null || !montantLu.ok) return;
    let annule = false;
    const valeur = montantLu.valeur;
    const minuteur = setTimeout(async () => {
      let resultat: Apercu;
      try {
        const etat = await apercuFrais({
          anneeScolaireId: annee.id,
          montant: valeur,
          mois,
          classes: classes.map((k) => ({ filiereId: parCle.get(k)!.filiereId, niveau: parCle.get(k)!.niveau })),
        });
        resultat =
          etat.statut === "succes"
            ? { statut: "ok", phrase: etat.donnees.phrase }
            : { statut: "refus", message: etat.erreurs?.mois ?? etat.message };
      } catch {
        resultat = { statut: "refus", message: MESSAGE_RESEAU };
      }
      if (!annule) setReponse({ cle: cleSaisie, apercu: resultat });
    }, 300);
    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
    // Le contenu de la saisie tient dans cleSaisie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleSaisie, annee.id]);

  const soumettre = form.handleSubmit(async (v) => {
    setErreurGenerale(null);
    if (!modification && v.classes.length === 0) {
      form.setError("classes", { type: "validate", message: "Choisissez au moins une classe." }, { shouldFocus: true });
      return;
    }
    try {
      const etat = frais
        ? await modifierFrais({ id: frais.id, libelle: v.libelle, montant: v.montant, mois: v.mois })
        : await creerFrais({
            anneeScolaireId: annee.id,
            libelle: v.libelle,
            montant: v.montant,
            mois: v.mois,
            classes: v.classes.map((k) => ({ filiereId: parCle.get(k)!.filiereId, niveau: parCle.get(k)!.niveau })),
          });
      if (etat.statut === "succes") {
        toast.success(etat.message);
        fermer();
      } else {
        const generale = appliquerErreursServeur(form, etat, CHAMPS);
        setErreurGenerale(generale);
        if (generale) {
          // Refus sans champ (frais payé entre-temps, année clôturée, frais supprimé) : la liste était périmée.
          // Le rafraîchissement peut fermer la fenêtre : la notification garde le motif lisible.
          toast.error(generale);
          router.refresh();
        }
      }
    } catch {
      setErreurGenerale(MESSAGE_RESEAU);
    }
  });

  const peutCreer = modification || apercu.statut === "ok";
  const raisonBloquee = modification
    ? null
    : libelle.trim().length < 2
      ? "Indiquez le libellé du frais."
      : !montantLu.ok
        ? "Saisissez le montant."
        : classes.length === 0
          ? "Cochez au moins une classe."
          : apercu.statut === "refus"
            ? apercu.message
            : apercu.statut === "attente"
              ? "Calcul du récapitulatif…"
              : null;

  const montantModifiable = !modification || frais.modifiable.montantEtMois;

  return (
    <form onSubmit={soumettre} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="text-lg">{modification ? `Modifier « ${frais.libelle} »` : "Nouveau frais"}</DialogTitle>
        <DialogDescription>
          {modification
            ? `Année ${annee.libelle}. Les classes concernées ne se modifient pas.`
            : `Année ${annee.libelle}. Chaque étudiant des classes cochées reçoit une échéance du même montant.`}
        </DialogDescription>
      </DialogHeader>

      {erreurGenerale && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
          {erreurGenerale}
        </p>
      )}

      {modification && frais.raisonVerrou && (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{frais.raisonVerrou}</span>
        </p>
      )}

      <FieldGroup className="gap-4">
        <ChampFormulaire
          id="frais-libelle"
          libelle="Libellé"
          aide="Il apparaît sur la fiche, sur le reçu et sur le relevé de l'étudiant."
          erreur={errors.libelle?.message}
        >
          <Input
            {...attributsChamp("frais-libelle", { erreur: errors.libelle?.message, aide: true })}
            {...form.register("libelle")}
            maxLength={LIBELLE_FRAIS_MAX}
            placeholder="Ex. Frais de stage"
            autoComplete="off"
            className="max-md:h-11"
          />
        </ChampFormulaire>

        <div className="grid gap-4 sm:grid-cols-2">
          <ChampFormulaire id="frais-montant" libelle="Montant par étudiant (Ar)" erreur={errors.montant?.message}>
            <Input
              {...attributsChamp("frais-montant", { erreur: errors.montant?.message })}
              {...form.register("montant", {
                onBlur: (e) => {
                  const lu = lireMontant(e.target.value);
                  if (lu.ok) form.setValue("montant", formaterNombre(lu.valeur));
                },
              })}
              inputMode="numeric"
              autoComplete="off"
              disabled={!montantModifiable}
              placeholder="15 000"
              className="tabular-nums max-md:h-11"
            />
          </ChampFormulaire>

          <ChampFormulaire id="frais-mois" libelle="Exigible en" erreur={errors.mois?.message}>
            <Controller
              control={form.control}
              name="mois"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={!montantModifiable}>
                  <SelectTrigger
                    ref={field.ref}
                    onBlur={field.onBlur}
                    className="w-full max-md:h-11"
                    {...attributsChamp("frais-mois", { erreur: errors.mois?.message })}
                  >
                    <SelectValue placeholder="Choisir un mois" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {moisProposes.map((m) => (
                      <SelectItem key={m.valeur} value={m.valeur}>
                        {m.libelle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </ChampFormulaire>
        </div>

        {modification ? (
          <div className="grid gap-1 text-sm">
            <span className="font-medium">Classes concernées</span>
            <span className="text-muted-foreground">{frais.classes.map((c) => c.libelle).join(", ")}</span>
          </div>
        ) : (
          <SelectionClasses
            classes={page.classes}
            cochees={classes}
            erreur={errors.classes?.message}
            changer={(valeur) => form.setValue("classes", valeur, { shouldDirty: true, shouldValidate: false })}
            effacerErreur={() => form.clearErrors("classes")}
          />
        )}
      </FieldGroup>

      {!modification && (
        <div aria-live="polite" className="min-h-10">
          {apercu.statut === "ok" && (
            <p className="rounded-lg bg-rose-pale px-3 py-2.5 text-sm text-rose-fonce">
              <strong className="font-semibold">{apercu.phrase}</strong>
            </p>
          )}
          {apercu.statut === "refus" && (
            <p role="alert" className="rounded-lg bg-attention-pale px-3 py-2.5 text-sm text-attention">
              {apercu.message}
            </p>
          )}
        </div>
      )}

      <DialogFooter className="items-center gap-2 sm:justify-between">
        {raisonBloquee && !peutCreer ? (
          <p className="text-xs text-muted-foreground sm:max-w-56">{raisonBloquee}</p>
        ) : (
          <span />
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="max-md:h-11">
              Annuler
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isSubmitting || !peutCreer} className="max-md:h-11">
            {isSubmitting && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
            {modification ? "Enregistrer" : libelleCreation(apercu, montantLu.ok ? montantLu.valeur : null)}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

function libelleCreation(apercu: Apercu, montant: number | null) {
  if (apercu.statut !== "ok" || montant === null) return "Créer le frais";
  return `Créer le frais de ${formaterAriary(montant)}`;
}

/** Une rangée de cases par filière, avec « tout cocher » pour ne pas cliquer niveau par niveau. */
function SelectionClasses({
  classes,
  cochees,
  erreur,
  changer,
  effacerErreur,
}: {
  classes: ClasseOption[];
  cochees: string[];
  erreur?: string;
  changer: (valeur: string[]) => void;
  effacerErreur: () => void;
}) {
  const filieres = [...new Set(classes.map((c) => c.filiereId))].map((id) => ({
    id,
    classes: classes.filter((c) => c.filiereId === id),
  }));

  function basculer(c: ClasseOption, coche: boolean) {
    const k = cleClasse(c);
    changer(coche ? [...cochees, k] : cochees.filter((x) => x !== k));
    effacerErreur();
  }

  function basculerFiliere(cles: string[], toutes: boolean) {
    changer(toutes ? cochees.filter((k) => !cles.includes(k)) : [...new Set([...cochees, ...cles])]);
    effacerErreur();
  }

  if (classes.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune filière active : ajoutez-en une dans Paramètres › Filières.</p>;
  }

  return (
    <FieldSet aria-describedby={erreur ? "frais-classes-erreur" : undefined}>
      <FieldLegend variant="label">Classes concernées</FieldLegend>
      <div className="grid gap-3">
        {filieres.map((f) => {
          const cles = f.classes.map(cleClasse);
          const toutes = cles.every((k) => cochees.includes(k));
          return (
            <div key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2">
              <span className="w-12 font-semibold text-primary">{f.classes[0].codeFiliere}</span>
              {f.classes.map((c) => {
                const id = `frais-classe-${c.filiereId}-${c.niveau}`;
                return (
                  <div key={id} className="flex min-h-11 items-center gap-2 md:min-h-8">
                    <Checkbox
                      id={id}
                      checked={cochees.includes(cleClasse(c))}
                      onCheckedChange={(v) => basculer(c, v === true)}
                      aria-invalid={erreur ? true : undefined}
                    />
                    <FieldLabel htmlFor={id} className="font-normal">
                      {c.libelle}
                    </FieldLabel>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto max-md:h-11"
                onClick={() => basculerFiliere(cles, toutes)}
                aria-label={`${toutes ? "Décocher" : "Cocher"} toutes les classes ${f.classes[0].codeFiliere}`}
              >
                {toutes ? "Tout décocher" : "Tout cocher"}
              </Button>
            </div>
          );
        })}
      </div>
      {erreur && (
        <p id="frais-classes-erreur" role="alert" className="text-sm text-destructive">
          {erreur}
        </p>
      )}
    </FieldSet>
  );
}
