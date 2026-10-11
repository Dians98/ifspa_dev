"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, TriangleAlert } from "lucide-react";
import { Controller, FormProvider, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { schemaCreationEtudiant } from "@/lib/etudiants";
import { formaterAriary } from "@/lib/montant";
import type { ContexteInscription } from "@/server/lectures/etudiants";
import { creerEtudiant } from "@/server/actions/etudiants";
import { attributsChamp, ChampFormulaire } from "@/components/app/parametres/champ-formulaire";
import { appliquerErreursServeur } from "@/components/app/parametres/erreurs-serveur";
import { MESSAGE_RESEAU } from "@/components/app/parametres/executer-action";
import { PanneauParametre } from "@/components/app/parametres/panneau-parametre";
import { CHAMPS_IDENTITE, ChampsIdentite, ChoixRadio } from "./champs-identite";

type Entree = z.input<typeof schemaCreationEtudiant>;
type Sortie = z.output<typeof schemaCreationEtudiant>;
type Filiere = ContexteInscription["filieres"][number];

const CHAMPS = [...CHAMPS_IDENTITE, "filiereId", "niveau", "droitsEnTranches"] as const;

/** Pas d'année courante, année clôturée ou aucune filière : rien à saisir, on explique quoi faire. */
function InscriptionImpossible({ message, estAdmin, lien, libelleLien }: { message: string; estAdmin: boolean; lien: string; libelleLien: string }) {
  return (
    <Alert className="border-attention/40 bg-attention-pale text-foreground">
      <TriangleAlert aria-hidden className="text-attention" />
      <AlertTitle className="font-semibold">Inscription impossible pour le moment</AlertTitle>
      <AlertDescription className="text-foreground">
        <p>{message}</p>
        {estAdmin && (
          <Button asChild variant="outline" size="sm" className="mt-2 bg-background max-md:h-11">
            <Link href={lien}>{libelleLien}</Link>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function FormulaireCreationEtudiant({ contexte, estAdmin }: { contexte: ContexteInscription; estAdmin: boolean }) {
  if (contexte.refus || !contexte.annee) {
    return (
      <InscriptionImpossible
        message={contexte.refus ?? "Aucune année scolaire courante : demandez à l'administrateur de la définir dans Paramètres › Années scolaires."}
        estAdmin={estAdmin}
        lien="/app/parametres/annees"
        libelleLien="Ouvrir Paramètres › Années scolaires"
      />
    );
  }
  if (contexte.filieres.length === 0) {
    return (
      <InscriptionImpossible
        message="Aucune filière active : l'administrateur doit en activer une dans Paramètres › Filières."
        estAdmin={estAdmin}
        lien="/app/parametres/filieres"
        libelleLien="Ouvrir Paramètres › Filières"
      />
    );
  }
  return <FormulaireInscription contexte={contexte} annee={contexte.annee} estAdmin={estAdmin} />;
}

function FormulaireInscription({
  contexte,
  annee,
  estAdmin,
}: {
  contexte: ContexteInscription;
  annee: NonNullable<ContexteInscription["annee"]>;
  estAdmin: boolean;
}) {
  const router = useRouter();
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const [doublonSignale, setDoublon] = useState<{ message: string; cle: string } | null>(null);
  const [redirige, setRedirige] = useState(false);
  const alerteDoublon = useRef<HTMLDivElement>(null);

  const form = useForm<Entree, unknown, Sortie>({
    resolver: zodResolver(schemaCreationEtudiant),
    defaultValues: {
      nom: "",
      prenoms: "",
      dateNaissance: "",
      lieuNaissance: "",
      cin: "",
      telephone: "",
      email: "",
      adresse: "",
      filiereId: contexte.filieres.length === 1 ? contexte.filieres[0].id : "",
      niveau: 1,
      droitsEnTranches: 1,
      confirmerDoublon: false,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const [filiereId, niveau, droitsEnTranches] = useWatch({ control: form.control, name: ["filiereId", "niveau", "droitsEnTranches"] });

  const filiere: Filiere | undefined = contexte.filieres.find((f) => f.id === filiereId);
  const niveauChoisi = filiere?.niveaux.find((n) => n.niveau === niveau);
  const tarif = niveauChoisi?.tarif ?? null;
  const tarifManquant = Boolean(filiere && niveauChoisi && !tarif);
  const messageTarif = tarifManquant && filiere && niveauChoisi
    ? `Le tarif de ${filiere.nom} ${niveauChoisi.libelle} manque pour ${annee.libelle}.`
    : null;

  // « Créer quand même » ne vaut que pour la saisie signalée : si le nom ou la date change, l'avertissement disparaît.
  const [nom, prenoms, naissance] = useWatch({ control: form.control, name: ["nom", "prenoms", "dateNaissance"] });
  const cleSaisie = `${nom}|${prenoms}|${naissance}`;
  const doublon = doublonSignale?.cle === cleSaisie ? doublonSignale.message : null;

  useEffect(() => {
    if (doublon) alerteDoublon.current?.focus();
  }, [doublon]);

  /** Garde une valeur valable quand la filière ou le niveau change : niveau existant, découpage des droits possible. */
  function ajuster(f: Filiere | undefined, n: number) {
    if (!f) return;
    const niveauFinal = n > f.dureeAnnees ? 1 : n;
    if (niveauFinal !== n) form.setValue("niveau", niveauFinal);
    const t = f.niveaux.find((x) => x.niveau === niveauFinal)?.tarif;
    const actuel = form.getValues("droitsEnTranches");
    if (t?.tranches.find((x) => x.n === actuel)?.refus) form.setValue("droitsEnTranches", 1);
  }

  async function enregistrer(confirmer: boolean) {
    setErreurGenerale(null);
    try {
      const etat = await creerEtudiant({ ...form.getValues(), confirmerDoublon: confirmer });
      if (etat.statut === "succes") {
        setRedirige(true);
        toast.success(etat.message);
        router.push(`/app/etudiants/${etat.donnees.id}?nouveau=1`);
        return;
      }
      if (etat.code === "DOUBLON_POSSIBLE") setDoublon({ message: etat.message, cle: cleSaisie });
      else setErreurGenerale(appliquerErreursServeur(form as unknown as UseFormReturn<Entree>, etat, CHAMPS));
    } catch {
      setErreurGenerale(MESSAGE_RESEAU);
    }
  }
  const soumettre = form.handleSubmit(() => enregistrer(false));
  const soumettreConfirme = form.handleSubmit(() => enregistrer(true));

  const occupe = isSubmitting || redirige;
  const droitsChoisis = tarif?.tranches.find((t) => t.n === droitsEnTranches);

  return (
    <FormProvider {...form}>
      <form onSubmit={soumettre} noValidate className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 gap-5">
          {doublon && (
            <Alert
              ref={alerteDoublon}
              tabIndex={-1}
              className="border-attention/40 bg-attention-pale text-foreground"
            >
              <TriangleAlert aria-hidden className="text-attention" />
              <AlertTitle className="font-semibold">Cet étudiant existe peut-être déjà</AlertTitle>
              <AlertDescription className="text-foreground">
                <p>{doublon}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={occupe}
                    onClick={() => {
                      void soumettreConfirme();
                    }}
                    className="bg-background max-md:h-11"
                  >
                    Créer quand même
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDoublon(null)} className="max-md:h-11">
                    Corriger la saisie
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {erreurGenerale && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
              {erreurGenerale}
            </p>
          )}

          <PanneauParametre titre="Identité" description="Tous les champs sont obligatoires, sauf ceux marqués facultatif.">
            <div className="p-4 sm:p-5">
              <ChampsIdentite prefixe="creation" />
            </div>
          </PanneauParametre>

          <PanneauParametre
            titre="Inscription"
            description={`Année ${annee.libelle}, mensualités de ${annee.periode}. La filière détermine le matricule : elle ne pourra plus être changée.`}
          >
            <div className="grid gap-5 p-4 sm:p-5">
              <FieldSet>
                <FieldLegend variant="label">Filière</FieldLegend>
                <Controller
                  control={form.control}
                  name="filiereId"
                  render={({ field }) => (
                    <RadioGroup
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        ajuster(contexte.filieres.find((f) => f.id === v), form.getValues("niveau"));
                      }}
                      onBlur={field.onBlur}
                      aria-invalid={errors.filiereId ? true : undefined}
                      aria-describedby={errors.filiereId ? "creation-filiere-erreur" : undefined}
                      className="flex flex-wrap gap-2"
                    >
                      {contexte.filieres.map((f, i) => (
                        <ChoixRadio key={f.id} id={`creation-filiere-${f.code}`} valeur={f.id} inputRef={i === 0 ? field.ref : undefined}>
                          {f.nom}
                          <span className="text-muted-foreground">· {f.code}</span>
                        </ChoixRadio>
                      ))}
                    </RadioGroup>
                  )}
                />
                {errors.filiereId?.message && <FieldError id="creation-filiere-erreur">{errors.filiereId.message}</FieldError>}
              </FieldSet>

              <ChampFormulaire id="creation-niveau" libelle="Niveau" erreur={errors.niveau?.message}>
                <Controller
                  control={form.control}
                  name="niveau"
                  render={({ field }) => (
                    <Select
                      value={filiere ? String(field.value) : ""}
                      disabled={!filiere}
                      onValueChange={(v) => {
                        // Radix renvoie "" quand les niveaux apparaissent après le choix de la filière : ce n'est pas un choix.
                        if (!v) return;
                        field.onChange(Number(v));
                        ajuster(filiere, Number(v));
                      }}
                    >
                      <SelectTrigger
                        ref={field.ref}
                        onBlur={field.onBlur}
                        className="w-full sm:w-64 max-md:h-11"
                        {...attributsChamp("creation-niveau", { erreur: errors.niveau?.message })}
                      >
                        <SelectValue placeholder="Choisissez d'abord la filière" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {(filiere?.niveaux ?? []).map((n) => (
                          <SelectItem key={n.niveau} value={String(n.niveau)}>
                            {n.libelle}
                            {n.tarif ? "" : " · tarif manquant"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </ChampFormulaire>

              <FieldSet>
                <FieldLegend variant="label">Paiement des droits d&apos;inscription</FieldLegend>
                <Controller
                  control={form.control}
                  name="droitsEnTranches"
                  render={({ field }) => (
                    <RadioGroup
                      value={String(field.value ?? 1)}
                      onValueChange={(v) => field.onChange(Number(v))}
                      onBlur={field.onBlur}
                      aria-invalid={errors.droitsEnTranches ? true : undefined}
                      aria-describedby="creation-droits-aide"
                      className="flex flex-wrap gap-2"
                    >
                      {[1, 2, 3].map((n) => (
                        <ChoixRadio
                          key={n}
                          id={`creation-droits-${n}`}
                          valeur={String(n)}
                          disabled={Boolean(tarif?.tranches.find((t) => t.n === n)?.refus)}
                        >
                          En {n} fois
                        </ChoixRadio>
                      ))}
                    </RadioGroup>
                  )}
                />
                <p id="creation-droits-aide" aria-live="polite" className="text-sm text-muted-foreground">
                  {droitsChoisis?.montants
                    ? droitsEnTranches === 1
                      ? `${formaterAriary(droitsChoisis.montants[0])} à payer à l'inscription (${annee.libelleMoisDebut}).`
                      : droitsChoisis.montants
                          .map((m, k) => `${formaterAriary(m)} ${k === 0 ? `à l'inscription (${annee.moisTranches[0]})` : `en ${annee.moisTranches[k]}`}`)
                          .join(" · ")
                    : "Choisissez une filière et un niveau pour voir les montants."}
                </p>
                {tarif?.tranches.some((t) => t.refus) && (
                  <p className="text-sm text-muted-foreground">
                    {tarif.tranches.find((t) => t.refus)?.refus}
                  </p>
                )}
                {errors.droitsEnTranches?.message && <FieldError>{errors.droitsEnTranches.message}</FieldError>}
              </FieldSet>
            </div>
          </PanneauParametre>
        </div>

        <aside aria-labelledby="creation-recap" className="overflow-hidden rounded-xl border bg-card lg:sticky lg:top-20">
          <div className="border-b px-4 py-4 sm:px-5">
            <h2 id="creation-recap" className="font-heading text-lg leading-tight font-semibold text-primary">
              Récapitulatif
            </h2>
          </div>

          <div className="bg-rose-pale px-4 py-4 sm:px-5">
            <p className="text-sm font-medium text-muted-foreground">Matricule (indicatif)</p>
            <p aria-live="polite" className="mt-1 text-2xl font-bold tracking-wide text-rose-fonce tabular-nums">
              {filiere ? (filiere.matriculeSuivant ?? "Attribué à l'enregistrement") : "Choisissez une filière"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Le numéro définitif est attribué à l&apos;enregistrement et ne change jamais.</p>
          </div>

          <div className="border-t px-4 py-4 sm:px-5">
            <h3 className="text-sm font-medium text-muted-foreground">Écolage {annee.libelle}</h3>
            {tarif ? (
              <dl className="mt-2 grid gap-1.5 text-sm tabular-nums">
                {droitsChoisis?.montants?.map((m, k) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt>
                      {droitsEnTranches === 1 ? "Droits d'inscription" : `Droits ${k + 1}/${droitsEnTranches}`}
                      <span className="text-muted-foreground"> · {annee.moisTranches[k]}</span>
                    </dt>
                    <dd>{formaterAriary(m)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3">
                  <dt>{tarif.nombreMois} mensualités de</dt>
                  <dd>{formaterAriary(tarif.montantMensuel)}</dd>
                </div>
                <div className="mt-1 flex justify-between gap-3 border-t pt-2 font-bold">
                  <dt>Total de l&apos;année</dt>
                  <dd>{formaterAriary(tarif.total)}</dd>
                </div>
              </dl>
            ) : messageTarif ? (
              <p className="mt-2 text-sm text-foreground">
                <TriangleAlert aria-hidden className="mr-1 inline size-4 -translate-y-px text-attention" />
                {messageTarif}{" "}
                {estAdmin ? (
                  <>
                    <Link href="/app/parametres/tarifs" className="font-medium text-primary underline underline-offset-2">
                      Ajoutez-le dans Paramètres › Tarifs
                    </Link>
                    .
                  </>
                ) : (
                  "Demandez à l'administrateur de l'ajouter dans Paramètres › Tarifs."
                )}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Le détail apparaît dès que la filière est choisie.</p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Les montants sont copiés du tarif d&apos;aujourd&apos;hui : un changement de tarif ne modifiera pas cet échéancier.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-4 sm:px-5">
            <Button asChild variant="ghost" className="max-md:h-11">
              <Link href="/app/etudiants">Annuler</Link>
            </Button>
            <Button
              type="submit"
              disabled={occupe || tarifManquant}
              aria-describedby={tarifManquant ? "creation-recap" : undefined}
              className="max-md:h-11 max-sm:flex-1"
            >
              {occupe && <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />}
              Inscrire l&apos;étudiant
            </Button>
            {tarifManquant && (
              <p className="basis-full text-xs text-muted-foreground">Inscription bloquée tant que le tarif de ce niveau manque.</p>
            )}
          </div>
        </aside>
      </form>
    </FormProvider>
  );
}
