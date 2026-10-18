import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { numerosNonUtilises } from "@/server/lectures/paiements";
import { fabriquerUtilisateur } from "../factories";
import { numero, occuper, POSTE_A, POSTE_B } from "../factories/hors-ligne";
import { fabriquerEtudiantInscrit, fabriquerMonde, type Monde } from "../factories/scenarios";

const TARIF = { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };

let m: Monde;
let etudiantId: string;

beforeEach(async () => {
  m = await fabriquerMonde();
  etudiantId = (await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF)).etudiant.id;
});

/** Bloc écrit directement : les années passées n'ont plus de compteur à faire avancer. */
const bloc = (annee: number, premier: number, dernier: number, poste = POSTE_A, userId = m.user.id, cle = `RECU:${annee}`) =>
  db.blocNumeros.create({ data: { cle, premier, dernier, poste, reserveParId: userId } });

describe("numerosNonUtilises", () => {
  it("année close : les numéros de blocs sans paiement, annulés comptés comme utilisés", async () => {
    await bloc(2025, 1, 10);
    await occuper(etudiantId, m.user.id, [3, 4], { annee: 2025 });
    await occuper(etudiantId, m.user.id, [5], { annee: 2025, annule: true });

    const r = await numerosNonUtilises("2026-11-15");

    expect(r.anneesOuvertes).toEqual([]);
    expect(r.anneesCloses).toEqual([
      { annee: 2025, nombre: 7, numeros: [1, 2, 6, 7, 8, 9, 10].map((n) => numero(n, 2025)) },
    ]);
  });

  it("année close entièrement utilisée : absente de la liste", async () => {
    await bloc(2025, 1, 3);
    await occuper(etudiantId, m.user.id, [1, 2, 3], { annee: 2025 });

    expect((await numerosNonUtilises("2026-11-15")).anneesCloses).toEqual([]);
  });

  it("année ouverte : numéros encore détenus, par poste et par caissier", async () => {
    const autre = await fabriquerUtilisateur("user", { name: "Zo Autre" });
    await bloc(2026, 1, 20, POSTE_A, m.user.id);
    await bloc(2026, 21, 40, POSTE_A, m.user.id);
    await bloc(2026, 41, 60, POSTE_B, autre.id);
    await occuper(etudiantId, m.user.id, [1, 2, 3], { annee: 2026 });

    const r = await numerosNonUtilises("2026-11-15");

    expect(r.anneesCloses).toEqual([]);
    expect(r.anneesOuvertes).toHaveLength(1);
    expect(r.anneesOuvertes[0]).toMatchObject({ annee: 2026, restants: 57 });
    expect(r.anneesOuvertes[0].postes).toEqual([
      { poste: POSTE_A, posteCourt: POSTE_A.slice(0, 8), caissier: { id: m.user.id, nom: "Caissier Test" }, restants: 37, blocs: 2 },
      { poste: POSTE_B, posteCourt: POSTE_B.slice(0, 8), caissier: { id: autre.id, nom: "Zo Autre" }, restants: 20, blocs: 1 },
    ]);
  });

  it("la frontière est l'année du jour : l'année suivante réservée en décembre reste ouverte", async () => {
    await bloc(2026, 1, 5);
    await bloc(2027, 1, 5);

    const decembre = await numerosNonUtilises("2026-12-15");
    expect(decembre.anneesCloses).toEqual([]);
    expect(decembre.anneesOuvertes.map((a) => a.annee)).toEqual([2027, 2026]);

    const janvier = await numerosNonUtilises("2027-01-02");
    expect(janvier.anneesCloses.map((a) => a.annee)).toEqual([2026]);
    expect(janvier.anneesOuvertes.map((a) => a.annee)).toEqual([2027]);
  });

  it("années closes de la plus récente à la plus ancienne", async () => {
    await bloc(2024, 1, 2);
    await bloc(2025, 1, 2);

    expect((await numerosNonUtilises("2026-11-15")).anneesCloses.map((a) => a.annee)).toEqual([2025, 2024]);
  });

  it("un paiement d'une autre année ne consomme pas le numéro du même rang", async () => {
    await bloc(2025, 1, 3);
    await occuper(etudiantId, m.user.id, [1, 2, 3], { annee: 2026 });

    expect((await numerosNonUtilises("2026-11-15")).anneesCloses[0]).toMatchObject({ annee: 2025, nombre: 3 });
  });

  it("ignore les blocs d'autres compteurs (matricules)", async () => {
    await bloc(2025, 1, 5, POSTE_A, m.user.id, "MATRICULE:IF:2025");

    expect(await numerosNonUtilises("2026-11-15")).toEqual({ anneesCloses: [], anneesOuvertes: [] });
  });

  it("aucun bloc : rien à lister", async () => {
    expect(await numerosNonUtilises("2026-11-15")).toEqual({ anneesCloses: [], anneesOuvertes: [] });
  });
});
