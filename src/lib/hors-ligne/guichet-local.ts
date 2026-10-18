// Guichet sans Internet : recherche, situation et encaissement lus et écrits dans la base locale du poste.

import { jourMadagascar } from "@/lib/dates";
import type { DonneesRecu, Encaissement } from "@/lib/encaissement";
import {
  anneeDuRecu,
  appliquerFile,
  construireSituationGuichet,
  horlogeIncoherente,
  instantCorrige,
  recuHorsLigne,
  rechercheLocale,
  type CopieGuichet,
  type ResultatGuichet,
  type SituationGuichet,
} from "@/lib/encaissement-hors-ligne";
import { lireCopie, lireFile, lireMeta, PlusDeNumero, prendreNumeroEtMettreEnFile } from "@/lib/hors-ligne/base-locale";
import { CANAL_GUICHET } from "@/lib/hors-ligne/synchro";

/** Copie du poste vue avec les paiements encore en file déjà déduits ; null si le poste n'a jamais synchronisé. */
async function copieAJour(): Promise<{ copie: CopieGuichet; genereeLe: Date } | null> {
  const [copie, file] = await Promise.all([lireCopie(), lireFile()]);
  if (!copie) return null;
  return { copie: appliquerFile(copie, file), genereeLe: new Date(copie.genereeLeISO) };
}

/** Date de la copie locale, pour le bandeau (« liste du 17/10 à 08:42 ») ; null si elle n'existe pas. */
export async function dateCopieLocale(): Promise<Date | null> {
  const copie = await lireCopie();
  return copie ? new Date(copie.genereeLeISO) : null;
}

export async function rechercherLocalement(q: string, maintenant = new Date()): Promise<ResultatGuichet[]> {
  const c = await copieAJour();
  return c ? rechercheLocale(c.copie, q, jourMadagascar(maintenant)) : [];
}

export async function situationLocale(etudiantId: string, maintenant = new Date()): Promise<SituationGuichet | null> {
  const c = await copieAJour();
  const e = c?.copie.etudiants.find((x) => x.id === etudiantId);
  if (!e) return null;
  const { echeances, ...source } = e;
  return construireSituationGuichet(source, echeances, jourMadagascar(maintenant));
}

export type SaisieGuichetLocal = Pick<
  Encaissement,
  "etudiantId" | "montant" | "mode" | "operateur" | "reference" | "observation" | "idClient"
> & {
  utilisateur: { id: string; nom: string };
};

export type ResultatEncaissementLocal = { ok: true; recu: DonneesRecu; numeroRecu: string } | { ok: false; erreur: string };

/**
 * Encaissement hors ligne : contrôles du guichet sur la copie locale, numéro définitif pris dans le bloc du poste,
 * paiement mis en file pour la prochaine synchronisation. Le ticket rendu est celui à imprimer.
 */
export async function encaisserHorsLigne(s: SaisieGuichetLocal, maintenant = new Date()): Promise<ResultatEncaissementLocal> {
  const meta = await lireMeta();
  if (horlogeIncoherente(maintenant, meta.derniereSynchroISO ? new Date(meta.derniereSynchroISO) : null)) {
    return {
      ok: false,
      erreur:
        "La date ou l'heure de cet ordinateur a reculé depuis la dernière synchronisation. Corrigez-les avant d'encaisser.",
    };
  }
  const instant = instantCorrige(maintenant, meta.decalage);
  const c = await copieAJour();
  const etudiant = c?.copie.etudiants.find((x) => x.id === s.etudiantId);
  if (!etudiant) return { ok: false, erreur: "Étudiant absent de la liste de ce poste : reconnectez-vous pour la mettre à jour." };

  const saisie = { etudiant, instant, montant: s.montant, mode: s.mode, operateur: s.operateur, reference: s.reference, caissier: s.utilisateur.nom };
  // Contrôle avant de consommer un numéro : un montant refusé ne doit pas laisser de trou dans le bloc.
  const essai = recuHorsLigne({ ...saisie, numeroRecu: "" });
  if (!essai.ok) return { ok: false, erreur: essai.erreur };

  try {
    const paiement = await prendreNumeroEtMettreEnFile(s.utilisateur.id, anneeDuRecu(instant), (numeroRecu) => {
      const r = recuHorsLigne({ ...saisie, numeroRecu });
      if (!r.ok) throw new Error(r.erreur);
      return {
        idClient: s.idClient,
        etudiantId: s.etudiantId,
        montant: s.montant,
        mode: s.mode,
        operateur: s.operateur,
        reference: s.reference,
        observation: s.observation,
        resteDuAffiche: r.resteDuAvant,
        poste: meta.poste,
        numeroRecu,
        instantSaisie: instant.toISOString(),
        saisiParId: s.utilisateur.id,
        recu: r.recu,
        caissier: s.utilisateur.nom,
      };
    });
    if (typeof BroadcastChannel !== "undefined") {
      const canal = new BroadcastChannel(CANAL_GUICHET);
      canal.postMessage("maj");
      canal.close();
    }
    return { ok: true, recu: paiement.recu, numeroRecu: paiement.numeroRecu };
  } catch (e) {
    if (e instanceof PlusDeNumero) return { ok: false, erreur: e.message };
    return { ok: false, erreur: e instanceof Error ? e.message : "Encaissement impossible sur ce poste." };
  }
}
