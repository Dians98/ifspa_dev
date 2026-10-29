"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableRow } from "@/components/ui/table";
import type { ResumeImport } from "@/server/actions/import";
import { BadgeEtat } from "../badge-etat";
import { PanneauParametre } from "../panneau-parametre";
import {
  CelluleAdaptative,
  ColonneAdaptative,
  CorpsAdaptatif,
  EnTeteAdaptatif,
  LigneAdaptative,
  TableauAdaptatif,
} from "../tableau-adaptatif";
import { LIGNES_VISIBLES, PlusDeLignes, pluriel } from "./reprise-commun";

export function ResumeReprise({
  resume,
  message,
  onAutreFichier,
}: {
  resume: ResumeImport;
  message: string;
  onAutreFichier: () => void;
}) {
  const messageRef = useRef<HTMLParagraphElement>(null);
  const [tout, setTout] = useState(false);
  const visibles = tout ? resume.etudiants : resume.etudiants.slice(0, LIGNES_VISIBLES);

  // Le focus va au résultat : le lecteur d'écran l'annonce, et la page ne reste pas sur un bouton disparu.
  useEffect(() => messageRef.current?.focus(), []);

  return (
    <PanneauParametre
      titre="Import terminé"
      description="Les étudiants sont enregistrés et inscrits sur l'année courante, avec toutes leurs échéances de l'année."
      action={
        <div className="flex flex-wrap gap-2">
          <Button asChild className="max-md:h-11">
            <Link href="/app/etudiants">Voir les étudiants</Link>
          </Button>
          <Button type="button" variant="outline" className="max-md:h-11" onClick={onAutreFichier}>
            Importer un autre fichier
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-2.5 bg-paye-pale px-4 py-3 text-sm font-medium text-paye sm:px-5">
        <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p ref={messageRef} tabIndex={-1} className="outline-none">
          {message}
        </p>
      </div>

      <dl className="grid gap-x-8 gap-y-3 border-t bg-rose-pale px-4 py-4 text-sm sm:grid-cols-2 sm:px-5">
        <div>
          <dt className="font-heading text-base font-semibold text-primary">Étudiants</dt>
          <dd className="mt-1">
            {pluriel(resume.etudiantsCrees, "créé", "créés")}
            {resume.etudiants.length > resume.etudiantsCrees &&
              `, ${resume.etudiants.length - resume.etudiantsCrees} déjà en base`}
          </dd>
        </div>
      </dl>

      <TableauAdaptatif>
        <EnTeteAdaptatif>
          <TableRow>
            <ColonneAdaptative>N°</ColonneAdaptative>
            <ColonneAdaptative>Nom et prénoms</ColonneAdaptative>
            <ColonneAdaptative>Matricule</ColonneAdaptative>
            <ColonneAdaptative>Statut</ColonneAdaptative>
          </TableRow>
        </EnTeteAdaptatif>
        <CorpsAdaptatif>
          {visibles.map((e) => (
            <LigneAdaptative key={e.id}>
              <CelluleAdaptative libelle="N°" className="tabular-nums">
                {e.numero}
              </CelluleAdaptative>
              <CelluleAdaptative pleine className="font-medium">
                <span className="uppercase">{e.nom}</span> {e.prenoms}
              </CelluleAdaptative>
              <CelluleAdaptative libelle="Matricule">
                <Link
                  href={`/app/etudiants/${e.id}`}
                  className="inline-flex min-h-6 items-center font-medium text-primary tabular-nums underline underline-offset-3 max-md:min-h-11"
                >
                  {e.matricule}
                </Link>
              </CelluleAdaptative>
              <CelluleAdaptative libelle="Statut">
                <BadgeEtat ton={e.nouveau ? "vert" : "neutre"}>{e.nouveau ? "Créé" : "Déjà en base"}</BadgeEtat>
              </CelluleAdaptative>
            </LigneAdaptative>
          ))}
        </CorpsAdaptatif>
      </TableauAdaptatif>
      {!tout && <PlusDeLignes restant={resume.etudiants.length - visibles.length} onClick={() => setTout(true)} />}
    </PanneauParametre>
  );
}
