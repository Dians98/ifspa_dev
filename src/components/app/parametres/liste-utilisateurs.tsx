"use client";

import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableRow } from "@/components/ui/table";
import type { UtilisateurParametre } from "@/server/lectures/utilisateurs";
import { changerRole, desactiverUtilisateur, reactiverUtilisateur } from "@/server/actions/utilisateurs";
import { BadgeEtat } from "./badge-etat";
import { BoutonAction } from "./bouton-action";
import { ConfirmationAction } from "./confirmation-action";
import { DialogueReinitialisation } from "./dialogue-reinitialisation";
import { DialogueUtilisateur } from "./dialogue-utilisateur";
import { MotifsRefus } from "./motifs-refus";
import { PanneauParametre } from "./panneau-parametre";
import {
  CelluleAdaptative,
  ColonneAdaptative,
  CorpsAdaptatif,
  EnTeteAdaptatif,
  LigneAdaptative,
  TableauAdaptatif,
} from "./tableau-adaptatif";

// Fuseau fixé : serveur et navigateur doivent écrire la même heure, sinon React signale une divergence.
const FORMAT_SESSION = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Indian/Antananarivo",
});

function initiales(nom: string) {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m.charAt(0).toUpperCase())
    .join("");
}

export function ListeUtilisateurs({ utilisateurs }: { utilisateurs: UtilisateurParametre[] }) {
  return (
    <PanneauParametre
      titre="Utilisateurs"
      description="Pas d'inscription libre : seuls les comptes créés ici peuvent se connecter."
      action={
        <DialogueUtilisateur
          declencheur={
            <Button className="max-md:h-11">
              <Plus aria-hidden />
              Nouvel utilisateur
            </Button>
          }
        />
      }
    >
      <TableauAdaptatif>
        <EnTeteAdaptatif>
          <TableRow>
            <ColonneAdaptative>Utilisateur</ColonneAdaptative>
            <ColonneAdaptative>Rôle</ColonneAdaptative>
            <ColonneAdaptative>Statut</ColonneAdaptative>
            <ColonneAdaptative>Dernière session</ColonneAdaptative>
            <ColonneAdaptative className="text-right">Actions</ColonneAdaptative>
          </TableRow>
        </EnTeteAdaptatif>
        <CorpsAdaptatif>
          {utilisateurs.map((u) => (
            <LigneUtilisateur key={u.id} utilisateur={u} />
          ))}
        </CorpsAdaptatif>
      </TableauAdaptatif>
    </PanneauParametre>
  );
}

function LigneUtilisateur({ utilisateur: u }: { utilisateur: UtilisateurParametre }) {
  const autreRole = u.role === "admin" ? "user" : "admin";
  const motifs = [u.refus.changerRole, u.refus.reinitialiserMotDePasse, u.actif ? u.refus.desactiver : u.refus.reactiver].filter(
    (m): m is string => m !== null,
  );

  return (
    <LigneAdaptative className={u.actif ? undefined : "bg-muted/30"}>
      <CelluleAdaptative pleine>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-primary"
          >
            {initiales(u.nom)}
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 font-medium text-primary">
              {u.nom}
              {u.estMoi && (
                <Badge variant="secondary" className="bg-rose-pale text-rose-fonce">
                  Vous
                </Badge>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Rôle">
        <BadgeEtat ton={u.role === "admin" ? "bleu" : "neutre"} point={false}>
          {u.libelleRole}
        </BadgeEtat>
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Statut">
        {u.actif ? <BadgeEtat ton="vert">Actif</BadgeEtat> : <BadgeEtat ton="neutre">Désactivé</BadgeEtat>}
      </CelluleAdaptative>
      <CelluleAdaptative libelle="Dernière session" className="text-muted-foreground tabular-nums">
        {u.derniereConnexion ? FORMAT_SESSION.format(new Date(u.derniereConnexion)) : "Aucune session ouverte"}
      </CelluleAdaptative>
      <CelluleAdaptative pleine droite>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {u.refus.changerRole === null && (
            <ConfirmationAction
              titre={`Passer ${u.nom} en ${u.role === "admin" ? "secrétariat" : "administrateur"} ?`}
              description={
                autreRole === "admin"
                  ? "Elle ou il pourra annuler des paiements, supprimer et modifier les Paramètres. Ses sessions ouvertes seront fermées : une nouvelle connexion sera nécessaire."
                  : "Elle ou il ne pourra plus ni annuler, ni supprimer, ni accéder aux Paramètres. Ses sessions ouvertes seront fermées : une nouvelle connexion sera nécessaire."
              }
              libelleAction={autreRole === "admin" ? "Passer en administrateur" : "Passer en secrétariat"}
              action={() => changerRole({ userId: u.id, role: autreRole })}
              declencheur={
                <Button variant="outline" size="sm" className="max-md:h-11" aria-label={`Changer le rôle de ${u.nom}`}>
                  {autreRole === "admin" ? "Passer en administrateur" : "Passer en secrétariat"}
                </Button>
              }
            />
          )}
          {u.refus.reinitialiserMotDePasse === null && (
            <DialogueReinitialisation
              userId={u.id}
              nom={u.nom}
              declencheur={
                <Button variant="outline" size="sm" className="max-md:h-11" aria-label={`Réinitialiser le mot de passe de ${u.nom}`}>
                  Réinitialiser le mot de passe
                </Button>
              }
            />
          )}
          {u.actif && u.refus.desactiver === null && (
            <ConfirmationAction
              destructif
              titre={`Désactiver le compte de ${u.nom} ?`}
              description="Elle ou il ne pourra plus se connecter. Ses paiements restent attribués à son nom, et vous pourrez réactiver le compte à tout moment."
              libelleAction="Désactiver le compte"
              action={() => desactiverUtilisateur({ userId: u.id })}
              declencheur={
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive max-md:h-11"
                  aria-label={`Désactiver le compte de ${u.nom}`}
                >
                  Désactiver
                </Button>
              }
            />
          )}
          {!u.actif && u.refus.reactiver === null && (
            <BoutonAction
              action={() => reactiverUtilisateur({ userId: u.id })}
              variant="outline"
              size="sm"
              className="max-md:h-11"
              aria-label={`Réactiver le compte de ${u.nom}`}
            >
              Réactiver
            </BoutonAction>
          )}
          <MotifsRefus motifs={motifs} />
        </div>
      </CelluleAdaptative>
    </LigneAdaptative>
  );
}
