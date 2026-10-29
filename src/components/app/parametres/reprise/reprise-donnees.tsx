"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { CircleAlert, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { analyserReprise, type AnalyseReprise, type ResumeImport } from "@/server/actions/import";
import { PanneauParametre } from "../panneau-parametre";
import { RapportReprise } from "./rapport-reprise";
import { ResumeReprise } from "./resume-import";
import { verifierDepot, ZoneDepot } from "./zone-depot";

const COUPURE_ANALYSE = "La connexion a échoué. Rien n'a été enregistré : choisissez le fichier à nouveau et relancez l'analyse.";

type Analyse = AnalyseReprise & { message: string; fichiers: File[]; numero: number };

const lienTexte = "font-medium text-primary underline underline-offset-3";

export function RepriseDonnees({ anneeCourante }: { anneeCourante: string | null }) {
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [analyse, setAnalyse] = useState<Analyse | null>(null);
  const [resume, setResume] = useState<{ donnees: ResumeImport; message: string } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);
  const aideId = useId();
  const erreurId = useId();

  const erreurDepot = verifierDepot(fichiers);
  const erreur = erreurDepot ?? erreurServeur;

  async function lancerAnalyse(liste: File[]) {
    if (enCours) return;
    setEnCours(true);
    setErreurServeur(null);
    const donnees = new FormData();
    for (const f of liste) donnees.append("fichiers", f);
    try {
      const etat = await analyserReprise(donnees);
      if (etat.statut === "erreur") {
        setAnalyse(null);
        setErreurServeur(etat.message);
      } else {
        setAnalyse({ ...etat.donnees, message: etat.message, fichiers: liste, numero: (analyse?.numero ?? 0) + 1 });
      }
    } catch {
      setAnalyse(null);
      setErreurServeur(COUPURE_ANALYSE);
    } finally {
      setEnCours(false);
    }
  }

  function repartir(garderFichiers: boolean) {
    setAnalyse(null);
    setResume(null);
    setErreurServeur(null);
    if (!garderFichiers) setFichiers([]);
  }

  // Régions présentes dès le départ : leur texte change, elles sont annoncées sans déplacer le focus.
  const statut = (
    <p role="status" className="sr-only">
      {enCours ? "Analyse en cours…" : ""}
    </p>
  );

  if (resume) {
    return (
      <>
        {statut}
        <ResumeReprise resume={resume.donnees} message={resume.message} onAutreFichier={() => repartir(false)} />
      </>
    );
  }

  if (analyse) {
    return (
      <>
        {statut}
        <RapportReprise
          key={analyse.numero}
          rapport={analyse.rapport}
          signature={analyse.signature}
          message={analyse.message}
          fichiers={analyse.fichiers}
          reanalyseEnCours={enCours}
          onResume={(donnees, message) => setResume({ donnees, message })}
          onReanalyser={() => lancerAnalyse(analyse.fichiers)}
          onAutreFichier={() => repartir(true)}
        />
      </>
    );
  }

  return (
    <div className="space-y-5">
      {statut}
      <PanneauParametre
        titre="Télécharger le modèle"
        description={anneeCourante ? undefined : "Il faut une année courante pour préparer le modèle."}
      >
        <div className="space-y-4 px-4 py-4 text-sm sm:px-5">
          <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li>Remplissez la feuille « Étudiants » : un étudiant par ligne.</li>
            <li>Saisissez les téléphones et le CIN comme du texte : Excel retire sinon le 0 du début.</li>
            <li>
              Un étudiant entré une année précédente demande que cette année existe : créez-la d&apos;abord dans{" "}
              <Link href="/app/parametres/annees" className={lienTexte}>
                Paramètres › Années scolaires
              </Link>
              , puis clôturez-la.
            </li>
          </ul>

          {anneeCourante ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Button asChild className="max-md:h-11 max-md:w-full">
                <a href="/api/import/modele?format=xlsx" download>
                  <Download aria-hidden />
                  Télécharger le modèle Excel
                </a>
              </Button>
              <p className="flex flex-wrap items-center gap-x-1 text-muted-foreground">
                Sans Excel :
                <a
                  href="/api/import/modele?format=etudiants.csv"
                  download
                  className={`${lienTexte} inline-flex min-h-6 items-center max-md:min-h-11`}
                >
                  CSV Étudiants
                </a>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Button disabled className="max-md:h-11 max-md:w-full">
                <Download aria-hidden />
                Télécharger le modèle Excel
              </Button>
              <p className="flex items-start gap-2 text-attention">
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  Aucune année courante.{" "}
                  <Link href="/app/parametres/annees" className="font-medium underline underline-offset-3">
                    Définissez-la dans Paramètres › Années scolaires
                  </Link>{" "}
                  pour télécharger le modèle.
                </span>
              </p>
            </div>
          )}
        </div>
      </PanneauParametre>

      <PanneauParametre
        titre="Déposer le fichier rempli"
      >
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <ZoneDepot fichiers={fichiers} onChange={(f) => { setFichiers(f); setErreurServeur(null); }} descriptionId={`${aideId} ${erreurId}`} disabled={enCours} />
          <p id={aideId} className="text-sm text-muted-foreground">
            Un fichier .xlsx, ou le CSV Étudiants. 1 Mo au plus.
          </p>
          <p id={erreurId} role="alert" className={erreur ? "flex items-start gap-2 text-sm text-destructive" : "sr-only"}>
            {erreur && <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />}
            {erreur}
          </p>
          <Button
            type="button"
            disabled={enCours || fichiers.length === 0 || erreurDepot !== null}
            aria-describedby={fichiers.length === 0 ? aideId : undefined}
            className="max-md:h-11 max-md:w-full"
            onClick={() => lancerAnalyse(fichiers)}
          >
            {enCours && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
            {enCours ? "Analyse en cours…" : fichiers.length > 1 ? "Analyser les fichiers" : "Analyser le fichier"}
          </Button>
        </div>
      </PanneauParametre>
    </div>
  );
}
