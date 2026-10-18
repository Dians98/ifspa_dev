// Base locale du poste (IndexedDB « ifspa-guichet ») : copie légère du guichet, blocs de numéros, file d'attente.
// Navigateur seulement. Le numéro de reçu est pris et le paiement mis en file dans une seule transaction :
// deux onglets ne peuvent jamais sortir le même numéro.

import type { DonneesRecu } from "@/lib/encaissement";
import type { ElementFile, EtatBlocsPoste, ReponseCopie, ResultatElementSynchro } from "@/lib/encaissement-hors-ligne";
import { nouvelIdentifiant } from "@/lib/hors-ligne/identifiant";
import { formaterNumeroRecu } from "@/lib/matricule";

const NOM_BASE = "ifspa-guichet";
const VERSION_BASE = 1;

/** Paiement en attente : ce qui part au serveur, plus le ticket remis pour pouvoir le réimprimer. */
export type PaiementEnFile = ElementFile & { recu: DonneesRecu; caissier: string };

/** Numéros encore libres d'un utilisateur sur ce poste, par année civile. */
export type BlocsLocaux = { utilisateurId: string; annees: { annee: number; libres: number[] }[] };

export type Meta = {
  poste: string;
  /** Heure du serveur moins heure du poste, en ms, à la dernière synchronisation. */
  decalage: number;
  derniereSynchroISO: string | null;
};

type Magasin = "meta" | "copie" | "blocs" | "file" | "resultats";

let ouverture: Promise<IDBDatabase> | null = null;

function ouvrir(): Promise<IDBDatabase> {
  ouverture ??= new Promise((resoudre, rejeter) => {
    const r = indexedDB.open(NOM_BASE, VERSION_BASE);
    r.onupgradeneeded = () => {
      const base = r.result;
      base.createObjectStore("meta");
      base.createObjectStore("copie");
      base.createObjectStore("blocs", { keyPath: "utilisateurId" });
      base.createObjectStore("file", { keyPath: "idClient" });
      base.createObjectStore("resultats", { keyPath: "idClient" });
    };
    r.onsuccess = () => resoudre(r.result);
    r.onerror = () => {
      ouverture = null;
      rejeter(r.error ?? new Error("Base locale indisponible."));
    };
  });
  return ouverture;
}

function demande<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    r.onsuccess = () => resoudre(r.result);
    r.onerror = () => rejeter(r.error);
  });
}

async function transaction<T>(
  magasins: Magasin[],
  mode: IDBTransactionMode,
  travail: (t: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const base = await ouvrir();
  const t = base.transaction(magasins, mode);
  const fin = new Promise<void>((resoudre, rejeter) => {
    t.oncomplete = () => resoudre();
    t.onabort = () => rejeter(t.error ?? new Error("Opération annulée sur la base locale."));
    t.onerror = () => rejeter(t.error);
  });
  let resultat: T;
  try {
    resultat = await travail(t);
  } catch (e) {
    t.abort();
    await fin.catch(() => undefined);
    throw e;
  }
  await fin;
  return resultat;
}

/** Données à garder même si le navigateur manque de place : la file contient de l'argent reçu. */
export async function demanderStockagePersistant(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Refus du navigateur : la base reste utilisable, seulement plus exposée à un nettoyage automatique.
  }
}

export async function lireMeta(): Promise<Meta> {
  return transaction(["meta"], "readwrite", async (t) => {
    const m = t.objectStore("meta");
    const existant = (await demande(m.get("meta"))) as Meta | undefined;
    if (existant) return existant;
    const neuf: Meta = { poste: nouvelIdentifiant(), decalage: 0, derniereSynchroISO: null };
    m.put(neuf, "meta");
    return neuf;
  });
}

export async function majMeta(modif: Partial<Omit<Meta, "poste">>): Promise<void> {
  await transaction(["meta"], "readwrite", async (t) => {
    const m = t.objectStore("meta");
    const actuel = (await demande(m.get("meta"))) as Meta | undefined;
    if (actuel) m.put({ ...actuel, ...modif }, "meta");
  });
}

export async function lireCopie(): Promise<ReponseCopie | null> {
  return transaction(["copie"], "readonly", async (t) => ((await demande(t.objectStore("copie").get("copie"))) as ReponseCopie) ?? null);
}

export async function ecrireCopie(copie: ReponseCopie): Promise<void> {
  await transaction(["copie"], "readwrite", (t) => {
    t.objectStore("copie").put(copie, "copie");
  });
}

export async function lireFile(): Promise<PaiementEnFile[]> {
  const file = await transaction(["file"], "readonly", async (t) => (await demande(t.objectStore("file").getAll())) as PaiementEnFile[]);
  return file.sort((a, b) => a.instantSaisie.localeCompare(b.instantSaisie));
}

export async function lireBlocs(utilisateurId: string): Promise<BlocsLocaux | null> {
  return transaction(["blocs"], "readonly", async (t) => ((await demande(t.objectStore("blocs").get(utilisateurId))) as BlocsLocaux) ?? null);
}

export function numerosLibres(blocs: BlocsLocaux | null, annee: number): number {
  return blocs?.annees.find((a) => a.annee === annee)?.libres.length ?? 0;
}

/**
 * Blocs renvoyés par le serveur : ses « libres » comptent encore les numéros en file sur ce poste,
 * qu'on retire ici pour ne jamais les ressortir.
 */
export async function ecrireBlocs(utilisateurId: string, etat: EtatBlocsPoste): Promise<void> {
  await transaction(["blocs", "file"], "readwrite", async (t) => {
    const file = (await demande(t.objectStore("file").getAll())) as PaiementEnFile[];
    const enFile = new Set(file.map((p) => p.numeroRecu));
    const annees = etat.annees.map((a) => ({
      annee: a.annee,
      libres: a.blocs
        .flatMap((b) => b.libres)
        .sort((x, y) => x - y)
        .filter((n) => !enFile.has(formaterNumeroRecu(a.annee, n))),
    }));
    t.objectStore("blocs").put({ utilisateurId, annees } satisfies BlocsLocaux);
  });
}

export class PlusDeNumero extends Error {
  constructor() {
    super("Plus de numéro de reçu disponible sur ce poste : reconnectez-vous à Internet pour en recevoir.");
  }
}

/**
 * Prend le plus petit numéro libre de l'année et met le paiement en file, dans la même transaction.
 * `construire` reçoit le numéro et rend le paiement complet (ticket compris).
 */
export async function prendreNumeroEtMettreEnFile(
  utilisateurId: string,
  annee: number,
  construire: (numeroRecu: string) => PaiementEnFile,
): Promise<PaiementEnFile> {
  return transaction(["blocs", "file"], "readwrite", async (t) => {
    const magasin = t.objectStore("blocs");
    const blocs = (await demande(magasin.get(utilisateurId))) as BlocsLocaux | undefined;
    const ligne = blocs?.annees.find((a) => a.annee === annee);
    const numero = ligne?.libres[0];
    if (!blocs || !ligne || numero === undefined) throw new PlusDeNumero();

    const paiement = construire(formaterNumeroRecu(annee, numero));
    ligne.libres = ligne.libres.slice(1);
    magasin.put(blocs);
    t.objectStore("file").add(paiement);
    return paiement;
  });
}

/** Retire de la file ce que le serveur a enregistré (ou avait déjà), garde le dernier résultat pour le bandeau. */
export async function appliquerResultats(resultats: readonly ResultatElementSynchro[]): Promise<void> {
  await transaction(["file", "resultats"], "readwrite", (t) => {
    const file = t.objectStore("file");
    const traces = t.objectStore("resultats");
    for (const r of resultats) {
      if (r.statut !== "refuse") file.delete(r.idClient);
      traces.put({ ...r, recuLeISO: new Date().toISOString() });
    }
  });
}

export type ResultatMemorise = ResultatElementSynchro & { recuLeISO: string };

export async function lireResultats(): Promise<ResultatMemorise[]> {
  return transaction(["resultats"], "readonly", async (t) => (await demande(t.objectStore("resultats").getAll())) as ResultatMemorise[]);
}

export async function oublierResultats(): Promise<void> {
  await transaction(["resultats"], "readwrite", (t) => {
    t.objectStore("resultats").clear();
  });
}

/**
 * Paiements de cet utilisateur qui peuvent encore partir : ils bloquent sa déconnexion.
 * Un refus définitif (illisible, étudiant introuvable) reste sur le poste pour l'administrateur sans bloquer (décision 44).
 */
export async function paiementsAEnvoyer(utilisateurId: string): Promise<number> {
  const [file, resultats] = await Promise.all([lireFile(), lireResultats()]);
  const definitifs = new Set(
    resultats.filter((r) => r.statut === "refuse" && (r.code === "INVALIDE" || r.code === "INTROUVABLE")).map((r) => r.idClient),
  );
  return file.filter((p) => p.saisiParId === utilisateurId && !definitifs.has(p.idClient)).length;
}

/** À la déconnexion : copie (données personnelles) effacée ; poste, blocs et file gardés (de l'argent y attend). */
export async function viderPoste(): Promise<void> {
  // Les résultats restent : ils disent pourquoi un paiement refusé attend encore sur le poste.
  await transaction(["copie"], "readwrite", (t) => {
    t.objectStore("copie").clear();
  });
}
