"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Info, Loader2, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { lienClasse } from "@/components/app/admissions/liste-classes";
import { demanderFocusTitre } from "@/components/app/admissions/titre-classe";
import { MESSAGE_RESEAU } from "@/components/app/parametres/executer-action";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { DecisionAdmission } from "@/generated/prisma/enums";
import { compterDecisions, libelleDecision, resumeDecisions } from "@/lib/admissions";
import { libelleNiveau } from "@/lib/parametres";
import { formaterAriary } from "@/lib/montant";
import { cn } from "@/lib/utils";
import { validerClasse } from "@/server/actions/admissions";
import type { ClasseDetail, EtudiantClasse } from "@/server/lectures/admissions";

const normaliser = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pluriel = (n: number, s: string, p: string) => (n > 1 ? p : s);

/** « 40 passent en 2e année · 1 redouble · 1 abandon » : ce qui ne passe pas ressort en rose foncé. */
function Resume({ texte }: { texte: string }) {
  const parties = texte.split(" · ");
  return (
    <>
      {parties.map((p, i) => (
        <span key={p}>
          {i > 0 && <span aria-hidden className="mx-1.5 text-muted-foreground">·</span>}
          <span className={cn(/redoubl|abandon/.test(p) && "font-semibold text-rose-fonce")}>{p}</span>
        </span>
      ))}
    </>
  );
}

function ChoixDecision({
  etudiant,
  valeur,
  decision,
  libelle,
}: {
  etudiant: EtudiantClasse;
  valeur: DecisionAdmission;
  decision: DecisionAdmission;
  libelle: string;
}) {
  const actif = decision === valeur;
  return (
    <label
      htmlFor={`${etudiant.inscriptionId}-${valeur}`}
      className={cn(
        "relative flex min-h-9 min-w-26 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold max-md:min-h-11 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
        actif ? "bg-rose-fonce text-white" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <RadioGroupItem id={`${etudiant.inscriptionId}-${valeur}`} value={valeur} className="absolute inset-0 size-full aspect-auto cursor-pointer rounded-md border-0 opacity-0" />
      {actif && <Check aria-hidden className="size-4" />}
      {libelle}
    </label>
  );
}

function LigneEtudiant({
  etudiant,
  defaut,
  decision,
  libelleDefaut,
  onChange,
}: {
  etudiant: EtudiantClasse;
  defaut: DecisionAdmission;
  decision: DecisionAdmission;
  libelleDefaut: string;
  onChange: (d: DecisionAdmission) => void;
}) {
  const passe = decision === defaut;
  const idCase = `case-${etudiant.inscriptionId}`;

  return (
    <li
      data-testid="ligne-etudiant"
      className={cn(
        "grid scroll-mb-32 gap-2 border-b px-4 py-2 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4",
        !passe && "bg-rose-pale",
      )}
    >
      <label htmlFor={idCase} className="flex min-h-12 cursor-pointer items-center gap-3">
        <Checkbox
          id={idCase}
          checked={passe}
          onCheckedChange={(v) => onChange(v === true ? defaut : "REDOUBLANT")}
          aria-label={`${etudiant.nom} ${etudiant.prenoms} : ${libelleDefaut}`}
          className="size-5.5 rounded-md max-md:size-6"
        />
        <span className="min-w-0">
          <span className={cn("block font-semibold break-words", !passe && "text-rose-fonce")}>
            {etudiant.nom} {etudiant.prenoms}
          </span>
          <span className="block text-sm text-muted-foreground tabular-nums">
            {etudiant.matricule}
            {etudiant.impayeEnRetard > 0 && ` · ${formaterAriary(etudiant.impayeEnRetard)} en retard`}
          </span>
        </span>
      </label>
      {passe ? (
        <span className="text-sm font-semibold whitespace-nowrap text-primary max-md:hidden">{libelleDefaut}</span>
      ) : (
        <RadioGroup
          value={decision}
          onValueChange={(v) => onChange(v as DecisionAdmission)}
          aria-label={`${etudiant.nom} ${etudiant.prenoms} ne passe pas :`}
          className="inline-flex w-auto gap-0.5 rounded-lg border border-rose-clair bg-background p-0.5 max-md:ml-9 max-md:grid max-md:w-auto max-md:grid-cols-2"
        >
          <ChoixDecision etudiant={etudiant} valeur="REDOUBLANT" decision={decision} libelle="Redouble" />
          <ChoixDecision etudiant={etudiant} valeur="ABANDON" decision={decision} libelle="Abandon" />
        </RadioGroup>
      )}
    </li>
  );
}

export function ValidationClasse({
  detail,
  prochaineCle,
  admin,
}: {
  detail: ClasseDetail;
  /** Classe à ouvrir après la validation ; null s'il n'en reste aucune à faire. */
  prochaineCle: string | null;
  admin: boolean;
}) {
  const router = useRouter();
  const { classe, etudiants, cible, source } = detail;
  const defaut = detail.decisions[0].decision;
  const libelleDefaut = detail.decisions[0].libelle;
  const niveau = classe.niveau;

  const [decisions, setDecisions] = useState<Record<string, DecisionAdmission>>(() =>
    Object.fromEntries(etudiants.map((e) => [e.inscriptionId, defaut])),
  );
  const [recherche, setRecherche] = useState("");
  const [seulementExceptions, setSeulementExceptions] = useState(false);
  // Étudiants non cochés au moment d'ouvrir la vue : ils restent affichés même si on les recoche.
  const [retenus, setRetenus] = useState<Set<string>>(new Set());
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const decisionDe = (e: EtudiantClasse) => decisions[e.inscriptionId] ?? defaut;
  const exceptions = etudiants.filter((e) => decisionDe(e) !== defaut);
  const comptes = compterDecisions(etudiants.map((e) => ({ decision: decisionDe(e) })));
  const resume = resumeDecisions(comptes, niveau);
  const redoublementBloque = classe.tarifRedoublementManquant && comptes.redoublants > 0;

  const visibles = useMemo(() => {
    const q = normaliser(recherche.trim());
    return etudiants.filter((e) => {
      if (seulementExceptions && (decisions[e.inscriptionId] ?? defaut) === defaut && !retenus.has(e.inscriptionId)) return false;
      return !q || normaliser(`${e.nom} ${e.prenoms} ${e.matricule}`).includes(q);
    });
  }, [etudiants, decisions, defaut, recherche, seulementExceptions, retenus]);

  function changer(id: string, d: DecisionAdmission) {
    setDecisions((courant) => ({ ...courant, [id]: d }));
  }

  function afficherExceptions(valeur: boolean) {
    setSeulementExceptions(valeur);
    if (valeur) setRetenus(new Set(exceptions.map((e) => e.inscriptionId)));
  }

  async function confirmer() {
    if (!cible) return;
    setEnCours(true);
    setErreur(null);
    try {
      const etat = await validerClasse({
        anneeSourceId: source.id,
        filiereId: classe.filiere.id,
        niveau,
        decisions: etudiants.map((e) => ({ inscriptionId: e.inscriptionId, decision: decisionDe(e) })),
      });
      if (etat.statut === "succes") {
        demanderFocusTitre();
        toast.success(etat.message);
        setOuvert(false);
        if (prochaineCle) router.push(lienClasse(prochaineCle));
      } else setErreur(etat.message);
    } catch {
      setErreur(MESSAGE_RESEAU);
    } finally {
      setEnCours(false);
    }
  }

  if (!cible) return null;

  const cibleDe = classe.derniereAnnee ? "diplômés" : `admis en ${libelleNiveau(niveau + 1)}`;
  const nbInscriptions = comptes.admis + comptes.redoublants;
  const nbImpayes = etudiants.filter((e) => e.impayeEnRetard > 0).length;

  return (
    <>
      <div className="mx-4 mt-4 flex gap-2.5 rounded-lg bg-rose-pale px-3.5 py-3 text-sm text-foreground sm:mx-5">
        <Info aria-hidden className="mt-0.5 size-4.5 shrink-0 text-rose-fonce" />
        <p>
          Tous les étudiants sont cochés : ils sont {cibleDe}. <strong>Décochez seulement ceux qui ne passent pas</strong>, puis
          indiquez s&apos;ils redoublent ou abandonnent.
        </p>
      </div>

      {exceptions.length > 0 && classe.tarifRedoublementManquant && (
        <Alert id="avertissement-tarif" className="mx-4 mt-3 w-auto border-attention/30 bg-attention-pale text-foreground sm:mx-5">
          <TriangleAlert aria-hidden className="text-attention" />
          <AlertDescription className="text-foreground">
            Le tarif {cible.libelle} des {classe.libelle} n&apos;est pas saisi : un redoublant ne peut pas être enregistré.{" "}
            {admin ? (
              <Link href={`/app/parametres/tarifs?annee=${cible.id}`} className="font-semibold underline underline-offset-3">
                Saisir le tarif dans Paramètres › Tarifs
              </Link>
            ) : (
              "Demandez à l'administrateur de le saisir dans Paramètres › Tarifs, ou choisissez « Abandon »."
            )}
          </AlertDescription>
        </Alert>
      )}

      <div role="search" aria-label="Chercher dans la classe" className="mt-4 flex flex-wrap items-center gap-3 border-y px-4 py-3 sm:px-5">
        <div className="relative min-w-60 flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher un étudiant de la classe"
            aria-label="Chercher un étudiant de la classe"
            autoComplete="off"
            className="pl-9 max-md:h-11"
          />
        </div>
        <div role="group" aria-label="Afficher" className="inline-flex gap-1 rounded-lg border bg-muted p-0.5">
          <Button
            type="button"
            size="sm"
            variant={seulementExceptions ? "ghost" : "outline"}
            aria-pressed={!seulementExceptions}
            onClick={() => afficherExceptions(false)}
            className="tabular-nums max-md:h-10"
          >
            Tous ({etudiants.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={seulementExceptions ? "outline" : "ghost"}
            aria-pressed={seulementExceptions}
            onClick={() => afficherExceptions(true)}
            className={cn("tabular-nums max-md:h-10", seulementExceptions && "text-rose-fonce")}
          >
            Ne passent pas ({exceptions.length})
          </Button>
        </div>
      </div>

      <p role="status" className="sr-only">
        {visibles.length} étudiant{visibles.length > 1 ? "s" : ""} affiché{visibles.length > 1 ? "s" : ""}
      </p>
      {visibles.length === 0 ? (
        <p className="border-b px-4 py-10 text-center text-sm text-muted-foreground">
          {recherche.trim()
            ? `Aucun étudiant de la classe ne correspond à « ${recherche.trim()} ».`
            : `Personne n'est décoché : tous les étudiants sont ${cibleDe}.`}
        </p>
      ) : (
        <ul aria-label="Étudiants de la classe">
          {visibles.map((e) => (
            <LigneEtudiant
              key={e.inscriptionId}
              etudiant={e}
              defaut={defaut}
              decision={decisionDe(e)}
              libelleDefaut={libelleDefaut}
              onChange={(d) => changer(e.inscriptionId, d)}
            />
          ))}
        </ul>
      )}

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t bg-card px-4 py-3 shadow-lg sm:px-5 max-md:flex-col max-md:items-stretch">
        <div>
          <p role="status" className="text-base tabular-nums max-md:text-center">
            <Resume texte={resume} />
          </p>
          {redoublementBloque && (
            <p id="raison-validation" className="mt-1 text-sm text-attention max-md:text-center">
              Validation impossible : le tarif des redoublants manque (voir l&apos;avertissement plus haut).
            </p>
          )}
        </div>
        <Button
          type="button"
          size="lg"
          disabled={redoublementBloque}
          aria-describedby={redoublementBloque ? "raison-validation" : undefined}
          onClick={() => {
            setErreur(null);
            setOuvert(true);
          }}
          className="h-10 bg-rose-fonce px-4 text-white hover:bg-rose-fonce/90 max-md:h-auto max-md:min-h-11 max-md:py-2 max-md:whitespace-normal"
        >
          Valider les {classe.libelle}
        </Button>
      </div>

      <Dialog open={ouvert} onOpenChange={(v) => !enCours && setOuvert(v)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">Valider le passage des {classe.libelle} ?</DialogTitle>
            <DialogDescription>
              {etudiants.length} étudiant{etudiants.length > 1 ? "s" : ""} · de {source.libelle} vers {cible.libelle}
            </DialogDescription>
          </DialogHeader>

          <p className="text-base tabular-nums">
            <Resume texte={resume} />
          </p>

          {exceptions.length > 0 ? (
            <section aria-labelledby="dlg-exceptions">
              <h3 id="dlg-exceptions" className="mb-1.5 text-sm font-semibold">
                Ne passent pas ({exceptions.length})
              </h3>
              <ul
                tabIndex={0}
                aria-label="Étudiants qui ne passent pas"
                className="max-h-56 divide-y overflow-y-auto rounded-lg border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {exceptions.map((e) => (
                  <li key={e.inscriptionId} className="flex items-baseline justify-between gap-4 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-semibold">
                        {e.nom} {e.prenoms}
                      </span>{" "}
                      <span className="text-muted-foreground tabular-nums">· {e.matricule}</span>
                    </span>
                    <span className="font-semibold whitespace-nowrap text-rose-fonce">{libelleDecision(decisionDe(e), niveau)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="rounded-lg bg-paye-pale px-3 py-2 text-sm">Tous les étudiants sont {cibleDe}.</p>
          )}

          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {nbInscriptions > 0 && (
              <li>
                {nbInscriptions} {pluriel(nbInscriptions, "inscription", "inscriptions")} {cible.libelle}{" "}
                {pluriel(nbInscriptions, "sera créée", "seront créées")}, avec leurs mensualités.
              </li>
            )}
            {nbImpayes > 0 && (
              <li>
                {nbImpayes} {pluriel(nbImpayes, "étudiant a", "étudiants ont")} des impayés {source.libelle} : ils restent dus sur cette année.
              </li>
            )}
            <li>L&apos;administrateur peut annuler ce passage tant qu&apos;aucun reçu n&apos;existe sur les nouvelles inscriptions.</li>
          </ul>

          {erreur && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
              <p>{erreur}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()} className="mt-2 bg-background max-md:h-11">
                Recharger la liste
              </Button>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={enCours} className="max-md:h-11">
                Revenir à la liste
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={confirmer}
              disabled={enCours}
              className="bg-rose-fonce text-white hover:bg-rose-fonce/90 max-md:h-11"
            >
              {enCours && <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />}
              Valider le passage de {etudiants.length} étudiant{etudiants.length > 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
