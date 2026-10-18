"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, CircleX, ExternalLink, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableRow } from "@/components/ui/table";
import { echec, type EtatAction } from "@/lib/etat-action";
import type { RapportRepriseAllege } from "@/lib/import-analyse";
import { formaterAriary } from "@/lib/montant";
import { libelleNiveau } from "@/lib/parametres";
import { cn } from "@/lib/utils";
import { importerReprise, type ResumeImport } from "@/server/actions/import";
import { BadgeEtat, type TonEtat } from "../badge-etat";
import { ConfirmationAction } from "../confirmation-action";
import { PanneauParametre } from "../panneau-parametre";
import {
  CelluleAdaptative,
  ColonneAdaptative,
  CorpsAdaptatif,
  EnTeteAdaptatif,
  LigneAdaptative,
  TableauAdaptatif,
} from "../tableau-adaptatif";
import { BlocReplie, LIGNES_VISIBLES, MESSAGES_VISIBLES, PlusDeLignes, pluriel } from "./reprise-commun";

type Message = RapportRepriseAllege["messages"][number];
type Etudiant = RapportRepriseAllege["etudiants"][number];

const COUPURE_IMPORT =
  "La connexion a été coupée pendant l'import : on ne sait pas s'il est terminé. Ouvrez la liste des étudiants pour vérifier, puis analysez le fichier à nouveau : ce qui est déjà importé ne sera pas repris.";

const STATUT_ETUDIANT: Record<Etudiant["statut"], { ton: TonEtat; libelle: string }> = {
  nouveau: { ton: "bleu", libelle: "Nouveau" },
  existant: { ton: "neutre", libelle: "Déjà en base" },
  refuse: { ton: "rouge", libelle: "Refusé" },
};

type Props = {
  rapport: RapportRepriseAllege;
  signature: string | null;
  /** Texte d'état de l'analyse, repris tel quel. */
  message: string;
  fichiers: File[];
  reanalyseEnCours: boolean;
  onResume: (resume: ResumeImport, message: string) => void;
  onReanalyser: () => void;
  onAutreFichier: () => void;
};

export function RapportReprise({
  rapport,
  signature,
  message,
  fichiers,
  reanalyseEnCours,
  onResume,
  onReanalyser,
  onAutreFichier,
}: Props) {
  const messageRef = useRef<HTMLParagraphElement>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [echecImport, setEchecImport] = useState<string | null>(null);

  // Le message d'état reçoit le focus : le lecteur d'écran annonce le résultat de l'analyse.
  useEffect(() => messageRef.current?.focus(), []);

  const { totaux } = rapport;
  const erreurs = rapport.messages.filter((m) => m.gravite === "erreur");
  const avertissements = rapport.messages.filter((m) => m.gravite === "avertissement");
  const aImporter = totaux.etudiants.nouveaux > 0 || totaux.paiements.aImporter > 0;
  const peutImporter = !rapport.bloquant && signature !== null;
  const libelleImport = `Importer ${pluriel(totaux.etudiants.nouveaux, "étudiant", "étudiants")} et ${pluriel(totaux.paiements.aImporter, "paiement", "paiements")}`;

  async function lancerImport(): Promise<EtatAction<unknown>> {
    const donnees = new FormData();
    for (const f of fichiers) donnees.append("fichiers", f);
    donnees.append("signature", signature ?? "");
    let etat: EtatAction<ResumeImport>;
    try {
      etat = await importerReprise(donnees);
    } catch {
      etat = echec(COUPURE_IMPORT);
    }
    if (etat.statut === "succes") onResume(etat.donnees, etat.message);
    else {
      setEchecImport(etat.message);
      setConfirmation(false);
    }
    return etat;
  }

  return (
    <PanneauParametre
      titre="Rapport de contrôle"
      description={`Rien n'est écrit tant que vous n'avez pas lancé l'import. Fichier analysé : ${fichiers.map((f) => f.name).join(", ")}.`}
      action={
        <Button type="button" variant="outline" className="max-md:h-11" onClick={onAutreFichier}>
          Choisir un autre fichier
        </Button>
      }
    >
      <div
        className={cn(
          "flex items-start gap-2.5 px-4 py-3 text-sm font-medium sm:px-5",
          rapport.bloquant ? "bg-retard-pale text-retard" : "bg-paye-pale text-paye",
        )}
      >
        {rapport.bloquant ? (
          <CircleX aria-hidden className="mt-0.5 size-4 shrink-0" />
        ) : (
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        )}
        <p ref={messageRef} tabIndex={-1} className="outline-none">
          {message}
        </p>
      </div>

      <Totaux rapport={rapport} />

      {erreurs.length > 0 && (
        <SectionMessages
          titre={`À corriger avant l'import (${erreurs.length})`}
          description="Corrigez le fichier dans Excel, puis déposez-le à nouveau."
          messages={erreurs}
          gravite="erreur"
          tous={rapport.messages}
        />
      )}
      {avertissements.length > 0 && (
        <SectionMessages
          titre={`À vérifier (${avertissements.length})`}
          description="Ces points n'empêchent pas l'import."
          messages={avertissements}
          gravite="avertissement"
          tous={erreurs.length === 0 ? rapport.messages : undefined}
        />
      )}

      {rapport.etudiants.length > 0 && (
        <BlocReplie titre={`Étudiants du fichier (${rapport.etudiants.length})`} ouvert>
          <TableauEtudiants etudiants={rapport.etudiants} />
        </BlocReplie>
      )}
      {rapport.recapPaiements.length > 0 && (
        <BlocReplie titre={`Paiements par étudiant (${rapport.recapPaiements.length})`}>
          <TableauPaiements rapport={rapport} />
        </BlocReplie>
      )}

      <div className="flex flex-col gap-3 border-t bg-muted/40 px-4 py-4 sm:px-5">
        {echecImport && (
          <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2.5 text-sm text-destructive">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p>{echecImport}</p>
          </div>
        )}
        {echecImport ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" className="max-md:h-11" disabled={reanalyseEnCours} onClick={onReanalyser}>
              {reanalyseEnCours && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
              Analyser à nouveau
            </Button>
          </div>
        ) : peutImporter ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <ConfirmationAction
              ouvert={confirmation}
              onOuvertChange={setConfirmation}
              titre={`${libelleImport} ?`}
              description={
                <>
                  <span className="block">
                    {pluriel(totaux.etudiants.nouveaux, "étudiant sera créé", "étudiants seront créés")} et{" "}
                    {pluriel(totaux.paiements.aImporter, "paiement sera enregistré", "paiements seront enregistrés")} pour{" "}
                    {formaterAriary(totaux.paiements.montantAImporter)}.
                  </span>
                  <span className="mt-2 block font-medium text-foreground">Un import ne s&apos;annule pas.</span>
                  <span className="mt-2 block">
                    Pendant l&apos;import (jusqu&apos;à 2 minutes), le guichet ne peut enregistrer aucun paiement : lancez-le hors des heures de guichet.
                  </span>
                </>
              }
              libelleAction="Importer maintenant"
              action={lancerImport}
              declencheur={
                <Button type="button" disabled={!aImporter} className="max-md:h-11 max-md:w-full">
                  {libelleImport}
                </Button>
              }
            />
            {!aImporter && (
              <p className="text-sm text-muted-foreground">Rien de nouveau à importer : tout est déjà en base.</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            L&apos;import reste fermé tant que le fichier contient des erreurs. Corrigez-le, puis choisissez-le à nouveau.
          </p>
        )}
      </div>
    </PanneauParametre>
  );
}

function Chiffre({ n, libelle, alerte }: { n: number; libelle: string; alerte?: boolean }) {
  return (
    <span className={cn(alerte && n > 0 && "font-medium text-retard")}>
      <strong className="font-semibold tabular-nums">{n}</strong> {libelle}
    </span>
  );
}

function Totaux({ rapport }: { rapport: RapportRepriseAllege }) {
  const { etudiants: e, paiements: p } = rapport.totaux;
  return (
    <dl className="grid gap-x-8 gap-y-4 border-t bg-rose-pale px-4 py-4 text-sm sm:grid-cols-2 sm:px-5">
      <div>
        <dt className="font-heading text-base font-semibold text-primary">Étudiants</dt>
        <dd className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          <Chiffre n={e.nouveaux} libelle={e.nouveaux > 1 ? "nouveaux" : "nouveau"} />
          <Chiffre n={e.existants} libelle="déjà en base" />
          <Chiffre n={e.refuses} libelle={e.refuses > 1 ? "refusés" : "refusé"} alerte />
        </dd>
      </div>
      <div>
        <dt className="font-heading text-base font-semibold text-primary">Paiements</dt>
        <dd className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          <span>
            <strong className="font-semibold tabular-nums">{p.aImporter}</strong> à importer
            {p.aImporter > 0 && <>, soit <span className="tabular-nums">{formaterAriary(p.montantAImporter)}</span></>}
          </span>
          <Chiffre n={p.dejaImportes} libelle={p.dejaImportes > 1 ? "déjà importés" : "déjà importé"} />
          <Chiffre n={p.refuses} libelle={p.refuses > 1 ? "refusés" : "refusé"} alerte />
        </dd>
      </div>
    </dl>
  );
}

function SectionMessages({
  titre,
  description,
  messages,
  gravite,
  tous,
}: {
  titre: string;
  description: string;
  messages: Message[];
  gravite: Message["gravite"];
  /** Si fourni, des liens vers les Paramètres sont proposés d'après ces messages. */
  tous?: Message[];
}) {
  const [tout, setTout] = useState(false);
  const visibles = tout ? messages : messages.slice(0, MESSAGES_VISIBLES);
  const groupes = new Map<string, Message[]>();
  for (const m of visibles) {
    const cle = m.feuille ? `Feuille « ${m.feuille} »` : "Fichier";
    groupes.set(cle, [...(groupes.get(cle) ?? []), m]);
  }
  const Icone = gravite === "erreur" ? CircleX : TriangleAlert;
  const parlent = (mot: RegExp) => (tous ?? []).some((m) => mot.test(m.texte));
  const liens = [
    parlent(/ann[ée]e/i) && { href: "/app/parametres/annees", libelle: "Paramètres › Années scolaires" },
    parlent(/tarif/i) && { href: "/app/parametres/tarifs", libelle: "Paramètres › Tarifs" },
    parlent(/fili[èe]re (inconnue|\S+ est désactivée)/i) && { href: "/app/parametres/filieres", libelle: "Paramètres › Filières" },
  ].filter((l) => l !== false);

  return (
    <section className="border-t px-4 py-4 sm:px-5">
      <h3 className="font-heading text-base font-semibold text-primary">{titre}</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      {liens.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {liens.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-6 items-center gap-1 font-medium text-primary underline underline-offset-3 max-md:min-h-11"
            >
              {l.libelle}
              <ExternalLink aria-hidden className="size-3.5" />
              <span className="sr-only">(s&apos;ouvre dans un nouvel onglet)</span>
            </Link>
          ))}
        </p>
      )}
      <div className="mt-3 space-y-4">
        {[...groupes].map(([cle, liste]) => (
          <div key={cle}>
            <h4 className="text-sm font-semibold text-muted-foreground">{cle}</h4>
            <ul className="mt-1.5 space-y-1.5">
              {liste.map((m, i) => (
                <li key={`${m.ligne}-${m.colonne}-${i}`} className="flex items-start gap-2 text-sm">
                  <Icone
                    aria-hidden
                    className={cn("mt-0.5 size-4 shrink-0", gravite === "erreur" ? "text-retard" : "text-attention")}
                  />
                  <span>{m.texte}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {!tout && messages.length > visibles.length && (
        <Button type="button" variant="outline" size="sm" className="mt-3 max-md:h-11" onClick={() => setTout(true)}>
          {`Afficher les ${messages.length - visibles.length} autres messages`}
        </Button>
      )}
    </section>
  );
}

function TableauEtudiants({ etudiants }: { etudiants: Etudiant[] }) {
  const [tout, setTout] = useState(false);
  const visibles = tout ? etudiants : etudiants.slice(0, LIGNES_VISIBLES);

  return (
    <>
      <TableauAdaptatif>
        <EnTeteAdaptatif>
          <TableRow>
            <ColonneAdaptative>Ligne</ColonneAdaptative>
            <ColonneAdaptative>N°</ColonneAdaptative>
            <ColonneAdaptative>Nom et prénoms</ColonneAdaptative>
            <ColonneAdaptative>Filière</ColonneAdaptative>
            <ColonneAdaptative>Niveau</ColonneAdaptative>
            <ColonneAdaptative>Statut</ColonneAdaptative>
            <ColonneAdaptative>Matricule</ColonneAdaptative>
            <ColonneAdaptative className="text-right">Dû de l&apos;année</ColonneAdaptative>
          </TableRow>
        </EnTeteAdaptatif>
        <CorpsAdaptatif>
          {visibles.map((e) => {
            const statut = STATUT_ETUDIANT[e.statut];
            return (
              <LigneAdaptative key={e.ligne}>
                <CelluleAdaptative libelle="Ligne" className="text-muted-foreground tabular-nums">
                  {e.ligne}
                </CelluleAdaptative>
                <CelluleAdaptative libelle="N°" className="tabular-nums">
                  {e.numero ?? "—"}
                </CelluleAdaptative>
                <CelluleAdaptative pleine className="font-medium">
                  {e.nom ? (
                    <>
                      <span className="uppercase">{e.nom}</span> {e.prenoms}
                    </>
                  ) : (
                    <span className="font-normal text-muted-foreground">Ligne illisible : voir les erreurs</span>
                  )}
                </CelluleAdaptative>
                <CelluleAdaptative libelle="Filière">{e.filiere ?? "—"}</CelluleAdaptative>
                <CelluleAdaptative libelle="Niveau">{e.niveau ? libelleNiveau(e.niveau) : "—"}</CelluleAdaptative>
                <CelluleAdaptative libelle="Statut">
                  <BadgeEtat ton={statut.ton}>{statut.libelle}</BadgeEtat>
                </CelluleAdaptative>
                <CelluleAdaptative libelle="Matricule" className="tabular-nums">
                  {e.matricule ?? "—"}
                </CelluleAdaptative>
                <CelluleAdaptative libelle="Dû de l'année" droite className="tabular-nums">
                  {e.duAnnee !== null ? formaterAriary(e.duAnnee) : "—"}
                </CelluleAdaptative>
              </LigneAdaptative>
            );
          })}
        </CorpsAdaptatif>
      </TableauAdaptatif>
      {!tout && <PlusDeLignes restant={etudiants.length - visibles.length} onClick={() => setTout(true)} />}
    </>
  );
}

function TableauPaiements({ rapport }: { rapport: RapportRepriseAllege }) {
  const [tout, setTout] = useState(false);
  const noms = new Map(rapport.etudiants.map((e) => [e.ligne, e.nom ? `${e.nom.toUpperCase()} ${e.prenoms ?? ""}`.trim() : null]));
  const recaps = rapport.recapPaiements;
  const visibles = tout ? recaps : recaps.slice(0, LIGNES_VISIBLES);

  return (
    <>
      <TableauAdaptatif>
        <EnTeteAdaptatif>
          <TableRow>
            <ColonneAdaptative>N°</ColonneAdaptative>
            <ColonneAdaptative>Étudiant</ColonneAdaptative>
            <ColonneAdaptative>À importer</ColonneAdaptative>
            <ColonneAdaptative className="text-right">Montant</ColonneAdaptative>
            <ColonneAdaptative>Déjà importés</ColonneAdaptative>
            <ColonneAdaptative>Refusés</ColonneAdaptative>
            <ColonneAdaptative className="text-right">Reste à payer après</ColonneAdaptative>
          </TableRow>
        </EnTeteAdaptatif>
        <CorpsAdaptatif>
          {visibles.map((r) => (
            <LigneAdaptative key={r.ligneEtudiant}>
              <CelluleAdaptative libelle="N°" className="tabular-nums">
                {r.numero}
              </CelluleAdaptative>
              <CelluleAdaptative pleine className="font-medium">
                {noms.get(r.ligneEtudiant) ?? "—"}
              </CelluleAdaptative>
              <CelluleAdaptative libelle="À importer" className="tabular-nums">
                {r.aImporter}
              </CelluleAdaptative>
              <CelluleAdaptative libelle="Montant" droite className="tabular-nums">
                {formaterAriary(r.montantAImporter)}
              </CelluleAdaptative>
              <CelluleAdaptative libelle="Déjà importés" className="tabular-nums">
                {r.dejaImportes}
              </CelluleAdaptative>
              <CelluleAdaptative libelle="Refusés" className={cn("tabular-nums", r.refuses > 0 && "font-medium text-retard")}>
                {r.refuses}
              </CelluleAdaptative>
              <CelluleAdaptative libelle="Reste à payer après" droite className="tabular-nums">
                {r.resteApres !== null ? formaterAriary(r.resteApres) : "—"}
              </CelluleAdaptative>
            </LigneAdaptative>
          ))}
        </CorpsAdaptatif>
      </TableauAdaptatif>
      {!tout && <PlusDeLignes restant={recaps.length - visibles.length} onClick={() => setTout(true)} />}
    </>
  );
}
