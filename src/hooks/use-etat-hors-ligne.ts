"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResultatElementSynchro } from "@/lib/encaissement-hors-ligne";
import { lireFile, lireMeta } from "@/lib/hors-ligne/base-locale";
import { CANAL_GUICHET, synchroniser, type BilanSynchro } from "@/lib/hors-ligne/synchro";

const INTERVALLE_SYNCHRO_MS = 5 * 60_000;
const INTERVALLE_REESSAI_MS = 30_000;

export type EtatConnexion = "en-ligne" | "hors-ligne" | "synchro";

export type EtatHorsLigne = {
  etat: EtatConnexion;
  /** Paiements encore sur ce poste, tous auteurs confondus. */
  enAttente: number;
  /** Paiements d'un autre compte, qui attendent sa connexion (décision 36). */
  enAttenteAutres: number;
  derniereSynchro: Date | null;
  sessionExpiree: boolean;
  /** Résultats de la dernière synchronisation (refus, à vérifier, numéros remplacés). */
  resultats: ResultatElementSynchro[];
  erreur: string | null;
  synchroniserMaintenant: () => Promise<void>;
};

/** État de connexion du guichet, synchronisation au retour du réseau, toutes les 5 minutes et à la demande. */
export function useEtatHorsLigne(utilisateurId: string): EtatHorsLigne {
  const [etat, setEtat] = useState<EtatConnexion>("en-ligne");
  const [enAttente, setEnAttente] = useState(0);
  const [enAttenteAutres, setEnAttenteAutres] = useState(0);
  const [derniereSynchro, setDerniereSynchro] = useState<Date | null>(null);
  const [sessionExpiree, setSessionExpiree] = useState(false);
  const [resultats, setResultats] = useState<ResultatElementSynchro[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const enCours = useRef(false);

  const relire = useCallback(async () => {
    const [file, meta] = await Promise.all([lireFile(), lireMeta()]);
    setEnAttente(file.length);
    setEnAttenteAutres(file.filter((p) => p.saisiParId !== utilisateurId).length);
    setDerniereSynchro(meta.derniereSynchroISO ? new Date(meta.derniereSynchroISO) : null);
  }, [utilisateurId]);

  const appliquer = useCallback((bilan: BilanSynchro) => {
    switch (bilan.issue) {
      case "faite":
        setEtat("en-ligne");
        setSessionExpiree(false);
        setErreur(null);
        if (bilan.resultats.length > 0) setResultats(bilan.resultats);
        break;
      case "hors-ligne":
        setEtat("hors-ligne");
        break;
      case "session-expiree":
        setEtat("en-ligne");
        setSessionExpiree(true);
        break;
      case "erreur":
        setEtat("en-ligne");
        setErreur(bilan.message);
        break;
      case "occupee":
        break;
    }
  }, []);

  const synchroniserMaintenant = useCallback(async () => {
    if (enCours.current) return;
    enCours.current = true;
    setEtat("synchro");
    try {
      appliquer(await synchroniser(utilisateurId));
    } finally {
      enCours.current = false;
      await relire();
    }
  }, [appliquer, relire, utilisateurId]);

  useEffect(() => {
    const demarrage = window.setTimeout(() => {
      void relire();
      if (navigator.onLine) void synchroniserMaintenant();
      else setEtat("hors-ligne");
    }, 0);

    const auRetour = () => void synchroniserMaintenant();
    const aLaCoupure = () => setEtat("hors-ligne");
    window.addEventListener("online", auRetour);
    window.addEventListener("offline", aLaCoupure);
    const minuteur = window.setInterval(() => {
      if (navigator.onLine) void synchroniserMaintenant();
    }, INTERVALLE_SYNCHRO_MS);

    const canal = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CANAL_GUICHET);
    if (canal) canal.onmessage = () => void relire();

    return () => {
      window.clearTimeout(demarrage);
      window.removeEventListener("online", auRetour);
      window.removeEventListener("offline", aLaCoupure);
      window.clearInterval(minuteur);
      canal?.close();
    };
  }, [relire, synchroniserMaintenant]);

  // Internet coupé en amont, Wi-Fi toujours là : aucun événement `online` ne viendra, on retente plus souvent.
  useEffect(() => {
    if (etat !== "hors-ligne") return;
    const minuteur = window.setInterval(() => {
      if (navigator.onLine) void synchroniserMaintenant();
    }, INTERVALLE_REESSAI_MS);
    return () => window.clearInterval(minuteur);
  }, [etat, synchroniserMaintenant]);

  return { etat, enAttente, enAttenteAutres, derniereSynchro, sessionExpiree, resultats, erreur, synchroniserMaintenant };
}
