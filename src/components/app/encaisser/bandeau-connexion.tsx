"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleCheck, Loader2, RefreshCw, TriangleAlert, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EtatHorsLigne } from "@/hooks/use-etat-hors-ligne";
import { useEnLigne } from "@/hooks/use-en-ligne";
import { dateHeureMadagascar } from "@/lib/dates";
import type { ResultatElementSynchro } from "@/lib/encaissement-hors-ligne";
import { cn } from "@/lib/utils";

type Envoye = Extract<ResultatElementSynchro, { statut: "enregistre" | "deja" }>;
type Refuse = Extract<ResultatElementSynchro, { statut: "refuse" }>;

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

function listeDu(date: Date): string {
  const { date: jour, heure } = dateHeureMadagascar(date);
  return `liste du ${jour.slice(0, 5)} à ${heure}`;
}

type Ton = "vert" | "orange" | "bleu";

const TONS: Record<Ton, string> = {
  vert: "border-paye/30 bg-paye-pale",
  orange: "border-attention/40 bg-attention-pale",
  bleu: "border-bleu/40 bg-bleu-pale",
};

/** État du poste : peut-on encaisser, et tout est-il parti au serveur ? Annoncé poliment, sans prendre le focus. */
export function BandeauConnexion({ hl }: { hl: EtatHorsLigne }) {
  const { etat, enAttente, enAttenteAutres, derniereSynchro, sessionExpiree, erreur, resultats } = hl;
  const [masques, setMasques] = useState<ResultatElementSynchro[] | null>(null);
  const enLigne = useEnLigne();

  let ton: Ton;
  let Icone = CircleCheck;
  let titre: string;
  const details: string[] = [];

  if (etat === "synchro") {
    ton = "bleu";
    Icone = Loader2;
    titre = "Synchronisation…";
    if (enAttente > 0) details.push(`${pluriel(enAttente, "paiement part", "paiements partent")} vers le serveur.`);
  } else if (etat === "hors-ligne") {
    ton = "orange";
    Icone = WifiOff;
    titre = "Hors ligne · vous pouvez continuer à encaisser";
    if (enAttente > 0) details.push(`${pluriel(enAttente, "paiement en attente", "paiements en attente")}`);
    details.push(
      derniereSynchro
        ? listeDu(derniereSynchro)
        : "Ce poste n'a pas encore la liste des étudiants : connectez-le une fois à Internet.",
    );
  } else if (sessionExpiree) {
    ton = "orange";
    Icone = TriangleAlert;
    titre = `Reconnectez-vous pour envoyer ${pluriel(enAttente, "paiement", "paiements")}`;
  } else if (erreur) {
    ton = "orange";
    Icone = TriangleAlert;
    titre = "Synchronisation impossible pour le moment";
    details.push(erreur);
  } else if (enAttente > 0) {
    ton = "orange";
    Icone = TriangleAlert;
    titre = `En ligne · ${pluriel(enAttente, "paiement reste", "paiements restent")} à envoyer`;
  } else {
    ton = "vert";
    titre = "En ligne · tout est synchronisé";
  }
  if (enAttenteAutres > 0 && etat !== "synchro") {
    details.push(`${pluriel(enAttenteAutres, "paiement saisi", "paiements saisis")} par un autre compte, en attente de sa connexion.`);
  }

  const visibles = resultats !== masques && resultats.length > 0;

  return (
    <section aria-label="Connexion et synchronisation" className="grid gap-2">
      <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3", TONS[ton])}>
        <div role="status" className="flex min-w-0 flex-1 basis-64 items-start gap-3">
          <Icone
            className={cn(
              "mt-0.5 size-5 shrink-0",
              ton === "vert" && "text-paye",
              ton === "orange" && "text-attention",
              ton === "bleu" && "animate-spin text-bleu motion-reduce:animate-none",
            )}
            aria-hidden
          />
          <div className="min-w-0">
            <p className={cn("font-bold", ton === "vert" ? "text-paye" : ton === "orange" ? "text-attention" : "text-primary")}>{titre}</p>
            {details.length > 0 && <p className="mt-0.5 text-sm text-foreground">{details.join(" · ")}</p>}
            {sessionExpiree && etat !== "hors-ligne" && (
              <p className="mt-0.5 text-sm text-foreground">
                Vos paiements restent sur ce poste.{" "}
                <Link href="/connexion?retour=/app/encaisser" className="font-semibold text-primary underline underline-offset-4">
                  Se reconnecter
                </Link>
              </p>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="bg-card max-md:h-11"
          // Wi-Fi présent mais serveur injoignable : on laisse retenter à la main.
          disabled={etat === "synchro" || !enLigne}
          onClick={() => void hl.synchroniserMaintenant()}
        >
          <RefreshCw aria-hidden />
          Synchroniser
          {!enLigne && <span className="sr-only"> (impossible sans Internet)</span>}
        </Button>
      </div>

      <div role="status">{visibles && <CompteRendu resultats={resultats} masquer={() => setMasques(resultats)} />}</div>
    </section>
  );
}

function CompteRendu({ resultats, masquer }: { resultats: ResultatElementSynchro[]; masquer: () => void }) {
  // « deja » compte aussi : réponse perdue au premier envoi, le ticket a pu être remplacé.
  const envoyes = resultats.filter((r): r is Envoye => r.statut !== "refuse");
  const aVerifier = envoyes.filter((r) => r.aVerifier).length;
  const remplaces = envoyes.filter((r) => r.numeroRemplace);
  const refuses = resultats.filter((r): r is Refuse => r.statut === "refuse");
  const aSignaler = envoyes.filter((r) => r.aVerifier && !r.numeroRemplace);

  return (
    <div className="rounded-xl border bg-card px-4 py-3 text-sm">
      <p className="font-semibold">
        {envoyes.length > 0
          ? `${pluriel(envoyes.length, "paiement envoyé", "paiements envoyés")} au serveur`
          : "Aucun paiement n'a pu être envoyé"}
        {aVerifier > 0 && <span className="text-attention"> · {aVerifier} à vérifier par l&apos;administrateur</span>}
        {refuses.length > 0 && <span className="text-retard"> · {pluriel(refuses.length, "refusé", "refusés")}</span>}
      </p>

      {(remplaces.length > 0 || aSignaler.length > 0 || refuses.length > 0) && (
        <ul className="mt-2 grid gap-2">
          {remplaces.map((r) => (
            <li key={r.idClient} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                <b>
                  Ticket {r.numeroRemplace} à remplacer par le reçu {r.numeroRecu}
                </b>{" "}
                : le parent a un ticket au mauvais numéro.
              </span>
              <Link href={`/app/paiements/${r.paiementId}/recu`} className="font-semibold text-primary underline underline-offset-4">
                Imprimer le reçu {r.numeroRecu}
              </Link>
            </li>
          ))}
          {aSignaler.map((r) => (
            <li key={r.idClient}>{r.message}</li>
          ))}
          {refuses.map((r) => (
            <li key={r.idClient} className="text-retard">
              <b>Refusé :</b> {r.message}{" "}
              <span className="text-muted-foreground">
                {r.code === "AUTEUR"
                  ? "Il attend la connexion de son auteur."
                  : r.code === "ERREUR"
                    ? "Il reste sur ce poste et sera retenté."
                    : "Il reste sur ce poste."}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Button type="button" variant="ghost" size="sm" className="mt-2 -ml-2 max-md:h-11" onClick={masquer}>
        Masquer ce compte rendu
      </Button>
    </div>
  );
}
