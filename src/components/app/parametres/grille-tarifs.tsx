"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableRow } from "@/components/ui/table";
import { formaterAriary, formaterNombre, lireMontant } from "@/lib/montant";
import { NOMBRE_MOIS_ECOLAGE, NOMBRE_MOIS_MAX, totalAnnuel } from "@/lib/parametres";
import { cn } from "@/lib/utils";
import type { GrilleTarifsParametre } from "@/server/lectures/parametres";
import { enregistrerTarifs } from "@/server/actions/parametres";
import { BadgeEtat } from "./badge-etat";
import { MESSAGE_RESEAU } from "./executer-action";
import { EtatVide, PanneauParametre } from "./panneau-parametre";
import {
  CelluleAdaptative,
  ColonneAdaptative,
  CorpsAdaptatif,
  EnTeteAdaptatif,
  LigneAdaptative,
  TableauAdaptatif,
} from "./tableau-adaptatif";

type Champ = "droits" | "mensuel" | "mois";
type Valeurs = Record<Champ, string>;
type ErreursLigne = Partial<Record<Champ | "classe", string>>;

const CHAMP_SERVEUR: Record<string, Champ | "classe"> = {
  droitsInscription: "droits",
  montantMensuel: "mensuel",
  nombreMois: "mois",
  filiereId: "classe",
  niveau: "classe",
};

const cle = (c: { filiereId: string; niveau: number }) => `${c.filiereId}:${c.niveau}`;
const sansEspaces = (s: string) => s.replace(/\s/g, "");
const idChamp = (k: string, champ: Champ) => `tarif-${k.replace(":", "-")}-${champ}`;

function valeursInitiales(c: GrilleTarifsParametre["cases"][number]): Valeurs {
  if (!c.tarif) return { droits: "", mensuel: "", mois: String(NOMBRE_MOIS_ECOLAGE) };
  return {
    droits: formaterNombre(c.tarif.droitsInscription),
    mensuel: formaterNombre(c.tarif.montantMensuel),
    mois: String(c.tarif.nombreMois),
  };
}

function modifiee(a: Valeurs, b: Valeurs) {
  return (["droits", "mensuel", "mois"] as const).some((ch) => sansEspaces(a[ch]) !== sansEspaces(b[ch]));
}

/** Total d'une ligne modifiée, seulement quand les trois champs sont lisibles. */
function totalSaisi(v: Valeurs): number | null {
  const droits = lireMontant(v.droits);
  const mensuel = lireMontant(v.mensuel);
  const mois = Number(sansEspaces(v.mois));
  if (!droits.ok || !mensuel.ok || !Number.isInteger(mois) || mois < 1 || mois > NOMBRE_MOIS_MAX) return null;
  return totalAnnuel({ droitsInscription: droits.valeur, montantMensuel: mensuel.valeur, nombreMois: mois });
}

export function GrilleTarifs({ grille }: { grille: GrilleTarifsParametre }) {
  const router = useRouter();
  const { annee, annees, cases, manquants } = grille;
  const initiales = new Map(cases.map((c) => [cle(c), valeursInitiales(c)]));

  const [valeurs, setValeurs] = useState<Map<string, Valeurs>>(initiales);
  const [erreurs, setErreurs] = useState<Record<string, ErreursLigne>>({});
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const lignesModifiees = cases.filter((c) => modifiee(valeurs.get(cle(c))!, initiales.get(cle(c))!));
  const dirty = lignesModifiees.length > 0;

  const selecteur = annees.length > 0 && (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="tarifs-annee" className="text-sm font-medium">
        Année scolaire
      </label>
      <Select
        value={annee?.id}
        disabled={dirty || enCours}
        onValueChange={(id) => router.push(`/app/parametres/tarifs?annee=${id}`)}
      >
        <SelectTrigger id="tarifs-annee" className="w-full min-w-52 max-md:h-11">
          <SelectValue placeholder="Choisir une année" />
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          {annees.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.libelle} · {a.libelleEtat}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {dirty && <p className="text-xs text-muted-foreground">Enregistrez ou annulez d&apos;abord vos modifications.</p>}
    </div>
  );

  const entete = {
    titre: "Tarifs par filière et par niveau",
    description:
      "Montants en ariary, sans décimales. Un tarif identique pour tous les étudiants d'une même filière, année et niveau.",
    action: selecteur || undefined,
  };

  if (!annee) {
    return (
      <PanneauParametre {...entete}>
        <EtatVide
          texte="Aucune année scolaire. Créez-en une pour y saisir les tarifs."
          action={
            <Button asChild className="max-md:h-11">
              <Link href="/app/parametres/annees">Créer une année scolaire</Link>
            </Button>
          }
        />
      </PanneauParametre>
    );
  }

  if (cases.length === 0) {
    return (
      <PanneauParametre {...entete}>
        <EtatVide
          texte="Aucune filière active : il n'y a rien à tarifer. Ajoutez ou réactivez une filière."
          action={
            <Button asChild className="max-md:h-11">
              <Link href="/app/parametres/filieres">Aller aux filières</Link>
            </Button>
          }
        />
      </PanneauParametre>
    );
  }

  const lectureSeule = annee.cloturee;

  function changer(k: string, champ: Champ, texte: string) {
    setValeurs((prec) => new Map(prec).set(k, { ...prec.get(k)!, [champ]: texte }));
    setErreurs((prec) => {
      if (!prec[k]?.[champ]) return prec;
      return { ...prec, [k]: { ...prec[k], [champ]: undefined } };
    });
  }

  function reformater(k: string, champ: "droits" | "mensuel") {
    const lu = lireMontant(valeurs.get(k)![champ]);
    if (lu.ok) changer(k, champ, formaterNombre(lu.valeur));
  }

  function annuler() {
    setValeurs(new Map(initiales));
    setErreurs({});
    setErreurGenerale(null);
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || enCours || !annee) return;
    setEnCours(true);
    setErreurGenerale(null);
    setErreurs({});
    try {
      const etat = await enregistrerTarifs({
        anneeId: annee.id,
        lignes: lignesModifiees.map((c) => {
          const v = valeurs.get(cle(c))!;
          const mois = sansEspaces(v.mois);
          return {
            filiereId: c.filiereId,
            niveau: c.niveau,
            droitsInscription: v.droits,
            montantMensuel: v.mensuel,
            nombreMois: mois === "" ? Number.NaN : Number(mois),
          };
        }),
      });
      if (etat.statut === "succes") {
        toast.success(etat.message);
        return;
      }
      const parLigne: Record<string, ErreursLigne> = {};
      let premier: string | null = null;
      for (const [chemin, message] of Object.entries(etat.erreurs ?? {})) {
        const m = /^lignes\.(\d+)\.(\w+)$/.exec(chemin);
        const ligne = m ? lignesModifiees[Number(m[1])] : undefined;
        const champ = m ? CHAMP_SERVEUR[m[2]] : undefined;
        if (!ligne || !champ) continue;
        parLigne[cle(ligne)] = { ...parLigne[cle(ligne)], [champ]: message };
        if (!premier) premier = idChamp(cle(ligne), champ === "classe" ? "droits" : champ);
      }
      setErreurs(parLigne);
      setErreurGenerale(etat.message);
      const cible = premier;
      if (cible) requestAnimationFrame(() => document.getElementById(cible)?.focus());
    } catch {
      setErreurGenerale(MESSAGE_RESEAU);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <PanneauParametre {...entete}>
      <form onSubmit={enregistrer} noValidate>
        <div className="grid gap-3 border-b px-4 py-4 sm:px-5">
          <p className="flex items-start gap-2 rounded-lg bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong className="font-semibold">Modifier un tarif n&apos;affecte pas les échéances déjà générées.</strong>{" "}
              Le nouveau montant s&apos;applique aux prochaines inscriptions et admissions.
            </span>
          </p>
          {lectureSeule && (
            <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                L&apos;année {annee.libelle} est clôturée : ses tarifs sont en lecture seule. Pour les modifier, rouvrez-la
                dans <Link href="/app/parametres/annees" className="font-medium text-primary underline underline-offset-2">Années scolaires</Link>.
              </span>
            </p>
          )}
          {!lectureSeule && manquants > 0 && (
            <div role="status" className="flex items-start gap-2 rounded-lg bg-attention-pale px-3 py-2.5 text-sm text-attention">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                <strong className="font-semibold">
                  {manquants} {manquants > 1 ? "tarifs sont à saisir" : "tarif est à saisir"}.
                </strong>{" "}
                Tant qu&apos;ils manquent, l&apos;inscription et l&apos;admission dans cette classe sont bloquées.
              </p>
            </div>
          )}
          {erreurGenerale && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
              {erreurGenerale}
            </p>
          )}
        </div>

        <TableauAdaptatif>
          <EnTeteAdaptatif>
            <TableRow>
              <ColonneAdaptative>Classe</ColonneAdaptative>
              <ColonneAdaptative className="text-right">Droits d&apos;inscription (Ar)</ColonneAdaptative>
              <ColonneAdaptative className="text-right">Mensualité (Ar)</ColonneAdaptative>
              <ColonneAdaptative className="text-right">Nombre de mois</ColonneAdaptative>
              <ColonneAdaptative className="text-right">Total annuel</ColonneAdaptative>
            </TableRow>
          </EnTeteAdaptatif>
          <CorpsAdaptatif>
            {cases.map((c) => {
              const k = cle(c);
              const v = valeurs.get(k)!;
              const changee = modifiee(v, initiales.get(k)!);
              const total = changee ? totalSaisi(v) : (c.tarif?.total ?? null);
              const nom = `${c.codeFiliere} ${c.libelleNiveau}`;
              const err = erreurs[k] ?? {};

              return (
                <LigneAdaptative key={k} className={cn(changee && "bg-rose-pale/60")}>
                  <CelluleAdaptative libelle="Classe" pleine className="md:w-64">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-primary">{nom}</span>
                      {!c.tarif && !lectureSeule && <BadgeEtat ton="orange">À saisir</BadgeEtat>}
                    </div>
                    <span className="block text-xs text-muted-foreground">{c.nomFiliere}</span>
                    {err.classe && <span className="mt-1 block text-xs text-destructive">{err.classe}</span>}
                    {changee && c.tarif && c.inscrits > 0 && (
                      <span className="mt-1 block text-xs text-attention">
                        {c.inscrits} {c.inscrits > 1 ? "étudiants inscrits gardent" : "étudiant inscrit garde"} l&apos;ancien
                        montant.
                      </span>
                    )}
                  </CelluleAdaptative>

                  <CelluleAdaptative libelle="Droits d'inscription (Ar)" droite>
                    <ChampTarif
                      id={idChamp(k, "droits")}
                      nom={`Droits d'inscription, ${nom}`}
                      valeur={v.droits}
                      erreur={err.droits}
                      lectureSeule={lectureSeule}
                      onChange={(t) => changer(k, "droits", t)}
                      onBlur={() => reformater(k, "droits")}
                    />
                  </CelluleAdaptative>
                  <CelluleAdaptative libelle="Mensualité (Ar)" droite>
                    <ChampTarif
                      id={idChamp(k, "mensuel")}
                      nom={`Mensualité, ${nom}`}
                      valeur={v.mensuel}
                      erreur={err.mensuel}
                      lectureSeule={lectureSeule}
                      onChange={(t) => changer(k, "mensuel", t)}
                      onBlur={() => reformater(k, "mensuel")}
                    />
                  </CelluleAdaptative>
                  <CelluleAdaptative libelle="Nombre de mois" droite>
                    <ChampTarif
                      id={idChamp(k, "mois")}
                      nom={`Nombre de mois, ${nom}`}
                      valeur={v.mois}
                      erreur={err.mois}
                      lectureSeule={lectureSeule}
                      etroit
                      onChange={(t) => changer(k, "mois", t)}
                    />
                  </CelluleAdaptative>
                  <CelluleAdaptative libelle="Total annuel" droite className="font-semibold tabular-nums">
                    {total === null ? <span className="text-muted-foreground">—</span> : formaterAriary(total)}
                  </CelluleAdaptative>
                </LigneAdaptative>
              );
            })}
          </CorpsAdaptatif>
        </TableauAdaptatif>

        {!lectureSeule && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-4 py-3 sm:px-5">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {dirty
                ? `${lignesModifiees.length} ${lignesModifiees.length > 1 ? "classes modifiées" : "classe modifiée"}, pas encore enregistrée${lignesModifiees.length > 1 ? "s" : ""}.`
                : "Modifiez directement les montants dans le tableau."}
            </p>
            <div className="flex gap-2 max-md:w-full">
              <Button type="button" variant="outline" disabled={!dirty || enCours} onClick={annuler} className="max-md:h-11 max-md:flex-1">
                Annuler
              </Button>
              <Button type="submit" disabled={!dirty || enCours} className="max-md:h-11 max-md:flex-1">
                {enCours && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
                Enregistrer
              </Button>
            </div>
          </div>
        )}
      </form>
    </PanneauParametre>
  );
}

function ChampTarif({
  id,
  nom,
  valeur,
  erreur,
  lectureSeule,
  etroit,
  onChange,
  onBlur,
}: {
  id: string;
  nom: string;
  valeur: string;
  erreur?: string;
  lectureSeule: boolean;
  etroit?: boolean;
  onChange: (texte: string) => void;
  onBlur?: () => void;
}) {
  if (lectureSeule) return <span className="tabular-nums">{valeur || "—"}</span>;

  return (
    <>
      <Input
        id={id}
        aria-label={nom}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={erreur ? `${id}-erreur` : undefined}
        inputMode="numeric"
        autoComplete="off"
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={cn("tabular-nums md:text-right max-md:h-11", etroit ? "md:ml-auto md:w-20" : "md:ml-auto md:w-36")}
      />
      {erreur && (
        <span id={`${id}-erreur`} className="mt-1 block text-xs text-destructive md:max-w-36 md:ml-auto">
          {erreur}
        </span>
      )}
    </>
  );
}
