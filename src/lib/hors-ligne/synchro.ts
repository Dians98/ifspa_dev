// Synchronisation du poste : envoi de la file, puis copie et blocs rafraîchis. Navigateur seulement.

import {
  MAX_ELEMENTS_SYNCHRO,
  type ElementFile,
  type ErreurApi,
  type ReponseBlocs,
  type ReponseCopie,
  type ReponseSynchronisation,
  type ResultatElementSynchro,
} from "@/lib/encaissement-hors-ligne";
import {
  appliquerResultats,
  demanderStockagePersistant,
  ecrireBlocs,
  ecrireCopie,
  lireFile,
  lireMeta,
  majMeta,
  type PaiementEnFile,
} from "@/lib/hors-ligne/base-locale";

export const CANAL_GUICHET = "ifspa-guichet";
const VERROU_SYNCHRO = "ifspa-synchro";

export type BilanSynchro =
  | { issue: "faite"; resultats: ResultatElementSynchro[]; enAttente: number }
  | { issue: "hors-ligne" }
  | { issue: "session-expiree"; enAttente: number }
  | { issue: "occupee" }
  | { issue: "erreur"; message: string };

class SessionExpiree extends Error {}
class Injoignable extends Error {}

async function appel<T>(url: string, init?: RequestInit): Promise<{ corps: T; dateServeur: string | null }> {
  let reponse: Response;
  try {
    reponse = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    // Coupure réseau, ou serveur injoignable alors que `navigator.onLine` dit le contraire.
    throw new Injoignable();
  }
  if (reponse.status === 401) throw new SessionExpiree();
  const corps = (await reponse.json().catch(() => null)) as T | ErreurApi | null;
  if (!reponse.ok || corps === null) {
    throw new Error((corps as ErreurApi | null)?.erreur ?? `Le serveur a répondu ${reponse.status}.`);
  }
  return { corps: corps as T, dateServeur: reponse.headers.get("Date") };
}

function sansTicket({ recu, caissier, ...element }: PaiementEnFile): ElementFile {
  void recu;
  void caissier;
  return element;
}

function decalageDepuis(serveurISO: string | null | undefined, avant: number, apres: number): number | null {
  const serveur = serveurISO ? Date.parse(serveurISO) : NaN;
  if (Number.isNaN(serveur)) return null;
  // Milieu de l'aller-retour : l'écart reste juste même sur une connexion lente.
  return serveur - (avant + apres) / 2;
}

function prevenirOnglets() {
  if (typeof BroadcastChannel === "undefined") return;
  const canal = new BroadcastChannel(CANAL_GUICHET);
  canal.postMessage("maj");
  canal.close();
}

async function deroulerSynchro(utilisateurId: string): Promise<BilanSynchro> {
  await demanderStockagePersistant();
  const { poste } = await lireMeta();
  const resultats: ResultatElementSynchro[] = [];
  let decalage: number | null = null;

  // Seuls les paiements de l'utilisateur connecté partent : les autres attendent leur auteur (décision 36).
  const aEnvoyer = (await lireFile()).filter((p) => p.saisiParId === utilisateurId).map(sansTicket);
  for (let i = 0; i < aEnvoyer.length; i += MAX_ELEMENTS_SYNCHRO) {
    const avant = Date.now();
    const { corps } = await appel<ReponseSynchronisation>("/api/encaissement/synchroniser", {
      method: "POST",
      body: JSON.stringify({ poste, elements: aEnvoyer.slice(i, i + MAX_ELEMENTS_SYNCHRO) }),
    });
    decalage = decalageDepuis(corps.serveurISO, avant, Date.now()) ?? decalage;
    await appliquerResultats(corps.resultats);
    resultats.push(...corps.resultats);
  }

  const { corps: copie } = await appel<ReponseCopie>("/api/encaissement/copie");
  await ecrireCopie(copie);

  // Après l'envoi de la file : le serveur ne compte plus comme libres les numéros qu'il vient d'enregistrer.
  const avant = Date.now();
  const { corps: blocs } = await appel<ReponseBlocs>("/api/encaissement/blocs", {
    method: "POST",
    body: JSON.stringify({ poste }),
  });
  decalage = decalageDepuis(blocs.serveurISO, avant, Date.now()) ?? decalage;
  await ecrireBlocs(utilisateurId, blocs);

  await majMeta({ derniereSynchroISO: new Date().toISOString(), ...(decalage === null ? {} : { decalage }) });
  const enAttente = (await lireFile()).length;
  return { issue: "faite", resultats, enAttente };
}

/** Une seule synchronisation à la fois sur le poste, même avec plusieurs onglets ouverts. */
export async function synchroniser(utilisateurId: string): Promise<BilanSynchro> {
  const executer = async (): Promise<BilanSynchro> => {
    try {
      return await deroulerSynchro(utilisateurId);
    } catch (e) {
      if (e instanceof Injoignable) return { issue: "hors-ligne" };
      if (e instanceof SessionExpiree) return { issue: "session-expiree", enAttente: (await lireFile()).length };
      return { issue: "erreur", message: e instanceof Error ? e.message : "Synchronisation impossible." };
    } finally {
      prevenirOnglets();
    }
  };
  if (!navigator.locks) return executer();
  return navigator.locks.request(VERROU_SYNCHRO, { ifAvailable: true }, async (verrou) =>
    verrou ? executer() : ({ issue: "occupee" } as const),
  );
}
