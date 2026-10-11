import { beforeEach, describe, expect, it, vi } from "vitest";

const espions = vi.hoisted(() => {
  const acces: string[] = [];
  // Tout accès à `db` ou `auth.api` est enregistré : l'action refusée ne doit en faire aucun.
  const sonde = (nom: string): unknown =>
    new Proxy(() => undefined, {
      get: (_cible, cle) => {
        if (cle === "then") return undefined;
        acces.push(`${nom}.${String(cle)}`);
        return sonde(`${nom}.${String(cle)}`);
      },
      apply: () => {
        acces.push(`${nom}()`);
        return Promise.resolve(undefined);
      },
    });
  const refus = { statut: "erreur", message: "Cette action est réservée à l'administrateur." } as const;
  return { acces, sonde, refus, revalidatePath: vi.fn(), headers: vi.fn(async () => new Headers()) };
});

const REFUS = espions.refus;

vi.mock("@/server/acces", () => ({
  exigerAdmin: vi.fn(async () => ({ session: null, refus: { ...espions.refus } })),
}));
vi.mock("@/lib/db", () => ({ db: espions.sonde("db") }));
vi.mock("@/lib/auth", () => ({ auth: { api: espions.sonde("auth.api") } }));
vi.mock("next/cache", () => ({ revalidatePath: espions.revalidatePath }));
vi.mock("next/headers", () => ({ headers: espions.headers }));

const parametres = await import("@/server/actions/parametres");
const utilisateurs = await import("@/server/actions/utilisateurs");

const entreeValide: Record<string, unknown> = {
  creerFiliere: { code: "IF", nom: "Infirmier(e)s", dureeAnnees: 3 },
  modifierFiliere: { id: "f1", code: "IF", nom: "Infirmier(e)s", dureeAnnees: 3 },
  activerFiliere: { id: "f1", actif: false },
  supprimerFiliere: { id: "f1" },
  creerAnnee: { anneeDebut: 2027, moisDebutEcolage: 10 },
  definirAnneeCourante: { id: "a1" },
  cloturerAnnee: { id: "a1" },
  rouvrirAnnee: { id: "a1" },
  supprimerAnnee: { id: "a1" },
  enregistrerTarifs: {
    anneeId: "a1",
    lignes: [{ filiereId: "f1", niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 }],
  },
  creerUtilisateur: { nom: "Rasoa Hanta", email: "rasoa@ifspa.mg", role: "admin" },
  changerRole: { userId: "u2", role: "admin" },
  desactiverUtilisateur: { userId: "u2" },
  reactiverUtilisateur: { userId: "u2" },
  reinitialiserMotDePasse: { userId: "u2" },
};

type Action = (entree: unknown) => Promise<unknown>;
const actions = (Object.entries({ ...parametres, ...utilisateurs }) as [string, unknown][]).filter(
  (e): e is [string, Action] => typeof e[1] === "function",
);

describe("actions des Paramètres refusées hors administrateur", () => {
  beforeEach(() => {
    espions.acces.length = 0;
    espions.revalidatePath.mockClear();
    espions.headers.mockClear();
  });

  it("chaque action exportée a une entrée de test", () => {
    expect(actions.map(([nom]) => nom).sort()).toEqual(Object.keys(entreeValide).sort());
  });

  it.each(Object.keys(entreeValide))("%s renvoie le refus sans toucher à la base ni à Better Auth", async (nom) => {
    const action = actions.find(([n]) => n === nom)?.[1];
    expect(action).toBeDefined();
    expect(await action!(entreeValide[nom])).toEqual(REFUS);
    expect(espions.acces).toEqual([]);
    expect(espions.headers).not.toHaveBeenCalled();
    expect(espions.revalidatePath).not.toHaveBeenCalled();
  });

  it("le refus passe avant la validation : une entrée invalide reçoit le même refus", async () => {
    for (const [, action] of actions) expect(await action({})).toEqual(REFUS);
    expect(espions.acces).toEqual([]);
  });
});
