import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schemaReponseCopie, type ReponseBlocs, type ReponseSynchronisation } from "@/lib/encaissement-hors-ligne";
import { fabriquerUtilisateur } from "../factories";
import { designation, elementHorsLigne, normaliser, numero, POSTE_A, POSTE_B, reserver } from "../factories/hors-ligne";
import { connecter, fabriquerEtudiantInscrit, fabriquerMonde, MAINTENANT, type Monde } from "../factories/scenarios";

const { getSession, revaliderPagesEcolage } = vi.hoisted(() => ({ getSession: vi.fn(), revaliderPagesEcolage: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/ecolage-revalidation", () => ({ revaliderPagesEcolage }));

const { db } = await import("@/lib/db");
const copieRoute = await import("@/app/api/encaissement/copie/route");
const blocsRoute = await import("@/app/api/encaissement/blocs/route");
const synchroRoute = await import("@/app/api/encaissement/synchroniser/route");

const TARIF = { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };
const HEURE_POSTE = "2026-11-15T08:55:00.000Z";

let m: Monde;
let etudiantId: string;
let identite: { nom: string; prenoms: string; matricule: string };

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(MAINTENANT) });
  revaliderPagesEcolage.mockClear();
  getSession.mockReset();
  m = await fabriquerMonde();
  const { etudiant } = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
  etudiantId = etudiant.id;
  identite = etudiant;
  connecter(getSession, m.user);
});

afterEach(() => vi.useRealTimers());

const post = (route: { POST: (r: Request) => Promise<Response> }, corps: unknown) =>
  route.POST(
    new Request("http://localhost/api/encaissement", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof corps === "string" ? corps : JSON.stringify(corps),
    }),
  );

/** Élément de file tel que le poste l'envoie (sans l'instant de réception, propre au serveur). */
function element(numeroRecu: string, surcharge: Record<string, unknown> = {}, auteur = m.user.id) {
  const { recuLe: _recuLe, ...fichier } = elementHorsLigne({ etudiantId, saisiParId: auteur, numeroRecu }, { instantSaisie: HEURE_POSTE });
  return { ...fichier, ...surcharge };
}

const lire = async <T>(r: Response) => (await r.json()) as T;

describe("sans session : 401 JSON, jamais de redirection", () => {
  beforeEach(() => getSession.mockResolvedValue(null));

  it("copie, blocs et synchroniser répondent 401 { code: SESSION } sans cache", async () => {
    const reponses = [
      await copieRoute.GET(),
      await post(blocsRoute, { poste: POSTE_A }),
      await post(synchroRoute, { poste: POSTE_A, elements: [element("R-2026-00001")] }),
    ];

    for (const r of reponses) {
      expect(r.status).toBe(401);
      expect(r.headers.get("Cache-Control")).toBe("no-store");
      expect(r.headers.get("content-type")).toMatch(/application\/json/);
      expect(await lire(r)).toMatchObject({ code: "SESSION", erreur: expect.any(String) });
    }
  });

  it("rien n'est réservé ni enregistré", async () => {
    await post(blocsRoute, { poste: POSTE_A });
    await post(synchroRoute, { poste: POSTE_A, elements: [element("R-2026-00001")] });

    expect(await db.blocNumeros.count()).toBe(0);
    expect(await db.paiement.count()).toBe(0);
  });
});

describe("GET /api/encaissement/copie", () => {
  it("rend la copie du guichet et l'utilisateur de la session, sans cache, pour un user comme pour un admin", async () => {
    for (const u of [m.user, m.admin]) {
      connecter(getSession, u);

      const r = await copieRoute.GET();

      expect(r.status).toBe(200);
      expect(r.headers.get("Cache-Control")).toBe("no-store");
      const corps = schemaReponseCopie.parse(await lire(r));
      expect(corps.utilisateur).toEqual({ id: u.id, nom: u.name });
      expect(corps.etudiants.map((e) => e.id)).toEqual([etudiantId]);
      expect(corps.genereeLeISO).toBe(new Date(MAINTENANT).toISOString());
    }
  });

  it("n'envoie aucun téléphone ni adresse au poste", async () => {
    const texte = await (await copieRoute.GET()).text();

    expect(texte).toContain(identite.matricule);
    expect(texte).not.toMatch(/telephone|adresse|0341234567|Toamasina/i);
  });
});

describe("POST /api/encaissement/blocs", () => {
  it("réserve un bloc pour l'utilisateur de la session et le rend avec l'heure du serveur", async () => {
    const r = await post(blocsRoute, { poste: POSTE_A });

    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    const corps = await lire<ReponseBlocs>(r);
    expect(corps).toMatchObject({ poste: POSTE_A, serveurISO: new Date(MAINTENANT).toISOString() });
    expect(corps.annees).toHaveLength(1);
    expect(corps.annees[0]).toMatchObject({ annee: 2026, libres: 20 });
    expect((await db.blocNumeros.findFirstOrThrow()).reserveParId).toBe(m.user.id);
  });

  it("un second appel avec assez de numéros ne réserve rien de plus", async () => {
    await post(blocsRoute, { poste: POSTE_A });
    await post(blocsRoute, { poste: POSTE_A });

    expect(await db.blocNumeros.count()).toBe(1);
  });

  it("deux postes ou deux caissiers appelant en même temps reçoivent des blocs disjoints", async () => {
    const autre = await fabriquerUtilisateur("user");
    const [a, b] = await Promise.all([post(blocsRoute, { poste: POSTE_A }), post(blocsRoute, { poste: POSTE_B })]);
    connecter(getSession, autre);
    const c = await post(blocsRoute, { poste: POSTE_A });

    const numeros = (await Promise.all([a, b, c].map((r) => lire<ReponseBlocs>(r)))).flatMap((x) => x.annees.flatMap((y) => y.blocs.flatMap((z) => z.libres)));
    expect(numeros).toHaveLength(60);
    expect(new Set(numeros).size).toBe(60);
  });

  it("corps absent, illisible ou poste invalide : 400 INVALIDE", async () => {
    for (const corps of ["", "pas du json", {}, { poste: "poste-1" }, { poste: 12 }]) {
      const r = await post(blocsRoute, corps);
      expect(r.status, JSON.stringify(corps)).toBe(400);
      expect(await lire(r)).toMatchObject({ code: "INVALIDE" });
    }
    expect(await db.blocNumeros.count()).toBe(0);
  });

  it("numéros de l'année épuisés : 409 NUMEROS_EPUISES, rien de réservé", async () => {
    await db.compteur.create({ data: { cle: "RECU:2026", valeur: 99_990 } });

    const r = await post(blocsRoute, { poste: POSTE_A });

    expect(r.status).toBe(409);
    expect(await lire(r)).toMatchObject({ code: "NUMEROS_EPUISES" });
    expect(await db.blocNumeros.count()).toBe(0);
  });
});

describe("POST /api/encaissement/synchroniser", () => {
  beforeEach(async () => {
    await reserver(m.user.id, POSTE_A);
  });

  it("corps illisible, sans élément, trop volumineux ou poste invalide : 400 INVALIDE, sans cache", async () => {
    const trop = Array.from({ length: 101 }, () => element("R-2026-00001"));
    for (const corps of ["pas du json", { poste: POSTE_A, elements: [] }, { poste: POSTE_A, elements: trop }, { poste: "x", elements: [element("R-2026-00001")] }, {}]) {
      const r = await post(synchroRoute, corps);
      expect(r.status).toBe(400);
      expect(r.headers.get("Cache-Control")).toBe("no-store");
      expect(await lire(r)).toMatchObject({ code: "INVALIDE" });
    }
    expect(await db.paiement.count()).toBe(0);
  });

  it("enregistre un paiement valide et revalide les pages", async () => {
    const r = await post(synchroRoute, { poste: POSTE_A, elements: [element(numero(1))] });

    expect(r.status).toBe(200);
    const corps = await lire<ReponseSynchronisation>(r);
    expect(corps.resultats).toMatchObject([{ statut: "enregistre", numeroRecu: "R-2026-00001", aVerifier: false }]);
    expect(corps.serveurISO).toBe(new Date(MAINTENANT).toISOString());
    expect(revaliderPagesEcolage).toHaveBeenCalledTimes(1);
  });

  it("un renvoi est « deja », sans nouveau paiement ni nouvelle revalidation", async () => {
    const corps = { poste: POSTE_A, elements: [element(numero(1))] };
    await post(synchroRoute, corps);
    revaliderPagesEcolage.mockClear();

    const { resultats } = await lire<ReponseSynchronisation>(await post(synchroRoute, corps));

    expect(resultats).toMatchObject([{ statut: "deja", numeroRecu: "R-2026-00001" }]);
    expect(await db.paiement.count()).toBe(1);
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });

  it("un élément invalide ou d'un autre auteur n'a aucun effet sur les autres, et rien n'est enregistré pour l'autre auteur", async () => {
    const autre = await fabriquerUtilisateur("user", { name: "Autre caissier" });
    const invalide = element(numero(1), { montant: 0 });
    const etranger = element(numero(2), {}, autre.id);
    const bon = element(numero(3));

    const r = await post(synchroRoute, { poste: POSTE_A, elements: [invalide, etranger, bon] });

    expect(r.status).toBe(200);
    const { resultats } = await lire<ReponseSynchronisation>(r);
    const parId = new Map(resultats.map((x) => [x.idClient, x]));
    expect(parId.get(invalide.idClient)).toMatchObject({ statut: "refuse", code: "INVALIDE", message: expect.stringMatching(/illisible/) });
    expect(parId.get(etranger.idClient)).toMatchObject({ statut: "refuse", code: "AUTEUR" });
    expect(parId.get(bon.idClient)).toMatchObject({ statut: "enregistre", numeroRecu: "R-2026-00003" });
    expect(resultats).toHaveLength(3);

    const enBase = await db.paiement.findMany();
    expect(enBase.map((p) => p.idClient)).toEqual([bon.idClient]);
    expect(await db.paiement.count({ where: { saisiParId: autre.id } })).toBe(0);
  });

  it("un élément sans idClient lisible est refusé sans faire échouer la requête", async () => {
    const r = await post(synchroRoute, { poste: POSTE_A, elements: [null, 42, { idClient: "x".repeat(200) }, element(numero(1))] });

    const { resultats } = await lire<ReponseSynchronisation>(r);
    expect(resultats.filter((x) => x.statut === "refuse")).toHaveLength(3);
    expect(resultats.filter((x) => x.statut === "enregistre")).toHaveLength(1);
    expect(resultats.find((x) => x.statut === "refuse" && x.idClient.length > 64)).toBeUndefined();
  });

  describe("message de refus : « Ticket R-… · montant · NOM Prénoms (matricule) : »", () => {
    const refus = async (elements: unknown[]) => {
      const { resultats } = await lire<ReponseSynchronisation>(await post(synchroRoute, { poste: POSTE_A, elements }));
      return resultats.map((x) => (x.statut === "refuse" ? normaliser(x.message) : `non refusé : ${x.statut}`));
    };

    it("illisible : numéro, montant et étudiant lus sur l'élément brut", async () => {
      const [message] = await refus([element(numero(1), { mode: "CHEQUE" })]);

      expect(message.startsWith(designation(numero(1), 80_000, identite))).toBe(true);
      expect(message).toMatch(/paiement illisible, \S/);
    });

    it("illisible pour un montant nul : le montant est omis", async () => {
      const [message] = await refus([element(numero(1), { montant: 0 })]);

      expect(message.startsWith(`${designation(numero(1), null, identite)}paiement illisible`)).toBe(true);
    });

    it("illisible sans numéro de reçu : « Paiement sans numéro »", async () => {
      const [message] = await refus([element(numero(1), { numeroRecu: undefined })]);

      expect(message.startsWith(designation(null, 80_000, identite))).toBe(true);
    });

    it("illisible avec un étudiant introuvable : ni nom ni séparateur en trop", async () => {
      const [message] = await refus([element(numero(1), { mode: "CHEQUE", etudiantId: "etudiant-inexistant" })]);

      expect(message.startsWith(`${designation(numero(1), 80_000, null)}paiement illisible`)).toBe(true);
      expect(message).not.toMatch(/undefined|null/);
    });

    it("illisible : un numéro de reçu démesuré est tronqué à 30 caractères", async () => {
      const [message] = await refus([element("R-".padEnd(100, "9"))]);

      expect(message.startsWith(`Ticket ${"R-".padEnd(30, "9")} · `)).toBe(true);
    });

    it("élément qui n'est pas un objet : « Paiement sans numéro » seul", async () => {
      const messages = await refus([null, 42, "texte"]);

      expect(messages).toHaveLength(3);
      for (const message of messages) expect(message.startsWith("Paiement sans numéro : paiement illisible")).toBe(true);
    });

    it("saisi par un autre compte : même début, puis la raison", async () => {
      const autre = await fabriquerUtilisateur("user", { name: "Autre caissier" });

      const [message] = await refus([element(numero(2), {}, autre.id)]);

      expect(message.startsWith(`${designation(numero(2), 80_000, identite)}Saisi par un autre compte`)).toBe(true);
    });

    it("étudiant introuvable : ticket et montant, sans nom, avant la raison", async () => {
      const [message] = await refus([element(numero(1), { etudiantId: "etudiant-inexistant" })]);

      expect(message).toBe(`${designation(numero(1), 80_000, null)}Cet étudiant n'existe plus. Rechargez la page.`);
    });

    it("autre saisie sous un idClient déjà enregistré : même début, puis le reçu existant", async () => {
      const original = element(numero(1));
      await post(synchroRoute, { poste: POSTE_A, elements: [original] });

      const [message] = await refus([{ ...original, numeroRecu: numero(2), montant: 90_000 }]);

      expect(message.startsWith(`${designation(numero(2), 90_000, identite)}Ce paiement est déjà enregistré sous le reçu R-2026-00001`)).toBe(true);
      expect(await db.paiement.count()).toBe(1);
    });

    it("chaque refus d'une même requête porte sa propre désignation", async () => {
      const messages = await refus([element(numero(1), { montant: 0 }), element(numero(2), { mode: "CHEQUE" }), element(numero(3), { etudiantId: "inconnu" })]);

      expect(messages.map((x) => x.split(" · ")[0])).toEqual([`Ticket ${numero(1)}`, `Ticket ${numero(2)}`, `Ticket ${numero(3)}`]);
    });
  });

  it("traite les éléments par heure de saisie, quel que soit l'ordre d'envoi", async () => {
    const premier = element(numero(1), { montant: 100_000, resteDuAffiche: 900_000, instantSaisie: "2026-11-15T08:50:00.000Z" });
    const second = element(numero(2), { montant: 80_000, resteDuAffiche: 800_000, instantSaisie: "2026-11-15T08:55:00.000Z" });

    const { resultats } = await lire<ReponseSynchronisation>(await post(synchroRoute, { poste: POSTE_A, elements: [second, premier] }));

    expect(resultats.map((x) => x.idClient)).toEqual([premier.idClient, second.idClient]);
    expect(resultats.every((x) => x.statut === "enregistre" && !x.aVerifier)).toBe(true);
    const lignes = await db.paiementLigne.findMany({ include: { echeance: true, paiement: true }, orderBy: { paiement: { numeroRecu: "asc" } } });
    expect(lignes.map((l) => [l.paiement.numeroRecu, l.echeance.type, l.montant])).toEqual([
      ["R-2026-00001", "DROITS", 100_000],
      ["R-2026-00002", "MENSUALITE", 80_000],
    ]);
  });

  it("la session d'un administrateur ne peut pas envoyer le paiement d'un caissier", async () => {
    connecter(getSession, m.admin);

    const { resultats } = await lire<ReponseSynchronisation>(await post(synchroRoute, { poste: POSTE_A, elements: [element(numero(1))] }));

    expect(resultats).toMatchObject([{ statut: "refuse", code: "AUTEUR" }]);
    expect(await db.paiement.count()).toBe(0);
    expect(revaliderPagesEcolage).not.toHaveBeenCalled();
  });
});
