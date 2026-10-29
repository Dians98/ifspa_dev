import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { genererEcheances } from "@/lib/ecolage";
import { NOMS_MOIS } from "@/lib/parametres";
import { fabriquerAnnee, fabriquerEtudiant, fabriquerFiliere, fabriquerFrais, fabriquerInscription, fabriquerPaiement, fabriquerTarif } from "../factories";
import { connecter, fabriquerEtudiantInscrit, fabriquerMonde, MAINTENANT, reussi, type Monde } from "../factories/scenarios";

const { getSession, revaliderPagesEcolage } = vi.hoisted(() => ({ getSession: vi.fn(), revaliderPagesEcolage: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/ecolage-revalidation", () => ({ revaliderPagesEcolage }));

const { db } = await import("@/lib/db");
const paiements = await import("@/server/actions/paiements");
const { contexteInscription, lireFicheEtudiant } = await import("@/server/lectures/etudiants");
const { situationGuichet } = await import("@/server/lectures/paiements");

const TARIF = { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(MAINTENANT) });
  getSession.mockReset();
});

afterEach(() => vi.useRealTimers());

describe("contexteInscription : calendrier selon le début d'écolage", () => {
  it.each([
    [1, "janvier", "janvier 2026", "octobre 2026"],
    [9, "septembre", "septembre 2026", "juin 2027"],
    [10, "octobre", "octobre 2026", "juillet 2027"],
    [11, "novembre", "novembre 2026", "août 2027"],
  ])("début d'écolage au mois %i (%s) : droits exigibles en %s, fin en %s", async (moisDebutEcolage, debut, moisDroits, fin) => {
    const annee = await fabriquerAnnee({ anneeDebut: 2026, estCourante: true, moisDebutEcolage });
    const filiere = await fabriquerFiliere({ code: "IF", nom: "Infirmier(e)s" });
    await fabriquerTarif(filiere.id, annee.id, TARIF);

    const c = await contexteInscription();

    expect(c.annee).toMatchObject({
      libelle: "2026-2027",
      moisDebutEcolage,
      libelleMoisDebut: debut,
      moisDroits,
    });
    expect(c.annee).not.toHaveProperty("moisTranches");
    expect(c.annee?.periode).toMatch(new RegExp(`^${debut} 2026 → ${fin}$`));
    const droits = genererEcheances(TARIF, { anneeDebut: 2026, moisDebutEcolage }).filter((e) => e.type === "DROITS");
    expect(droits).toHaveLength(1);
    expect(`${NOMS_MOIS[droits[0].mois.getUTCMonth()]} ${droits[0].mois.getUTCFullYear()}`).toBe(c.annee?.moisDroits);
  });

  it("sans année courante ou année clôturée : refus nommé", async () => {
    const filiere = await fabriquerFiliere({ code: "IF" });
    expect(await contexteInscription()).toMatchObject({ annee: null, filieres: [], refus: expect.stringMatching(/Aucune année scolaire courante/) });

    const annee = await fabriquerAnnee({ anneeDebut: 2026, estCourante: true, cloturee: true });
    await fabriquerTarif(filiere.id, annee.id, TARIF);
    expect(await contexteInscription()).toMatchObject({ refus: expect.stringMatching(/2026-2027 est clôturée/) });
  });

  it("filières actives seulement, matricule pressenti d'après le compteur, tarif et frais prévus par niveau", async () => {
    const m = await fabriquerMonde({ droitsInscription: 100_000 });
    await fabriquerFiliere({ code: "XX", nom: "Inactive", actif: false });
    await db.compteur.create({ data: { cle: "MATRICULE:IF:2026", valeur: 4 } });
    await fabriquerTarif(m.ifs.id, m.annee.id, { niveau: 2, droitsInscription: 2_000 });
    const examen = await fabriquerFrais(m.annee.id, { classes: [{ filiereId: m.ifs.id, niveau: 1 }], libelle: "Frais d'examen", montant: 15_000, mois: new Date(Date.UTC(2027, 2, 1)) });
    await fabriquerFrais(m.annee.id, { classes: [{ filiereId: m.sf.id, niveau: 1 }], libelle: "Frais SF" });

    const c = await contexteInscription();

    expect(c.filieres.map((f) => [f.code, f.matriculeSuivant])).toEqual([["IF", "IF-2026-0005"], ["SF", "SF-2026-0001"]]);
    const [n1, n2, n3] = c.filieres[0].niveaux;
    expect(n1.tarif).toMatchObject({ droitsInscription: 100_000, montantMensuel: 80_000, total: 900_000 });
    expect(n1.tarif).not.toHaveProperty("tranches");
    expect(n1.frais).toEqual([{ id: examen.frais.id, libelle: "Frais d'examen", montant: 15_000, mois: "2027-03-01", libelleMois: "mars 2027" }]);
    expect(n2.tarif).toMatchObject({ droitsInscription: 2_000, total: 2_000 + 10 * 80_000 });
    expect(n2.frais).toEqual([]);
    expect(n3.tarif).toBeNull();
    expect(c.filieres[1].niveaux[0].frais.map((f) => f.libelle)).toEqual(["Frais SF"]);
  });
});

describe("situationGuichet : anneeEnCours", () => {
  let m: Monde;

  beforeEach(async () => {
    m = await fabriquerMonde();
    connecter(getSession, m.admin);
  });

  const payer = (etudiantId: string, lignes: { echeanceId: string; montant: number }[], donnees = {}) =>
    fabriquerPaiement(etudiantId, m.user.id, lignes, donnees);
  const annule = () => ({ annule: true, annuleParId: m.admin.id, dateAnnulation: new Date(), motifAnnulation: "erreur de saisie" });

  it("paiements annulés ignorés : payé et reste de l'année ne comptent que les paiements actifs", async () => {
    const { etudiant, inscription } = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    const [droits, octobre, novembre] = inscription.echeances;
    await payer(etudiant.id, [{ echeanceId: droits.id, montant: 100_000 }, { echeanceId: octobre.id, montant: 80_000 }]);
    await payer(etudiant.id, [{ echeanceId: novembre.id, montant: 80_000 }], annule());

    const s = (await situationGuichet(etudiant.id, "2026-12-15"))!;

    expect(s.anneeEnCours).toEqual({ anneeDebut: 2026, libelle: "2026-2027", du: 900_000, paye: 180_000, reste: 720_000 });
    expect(s.resteDuTotal).toBe(720_000);
  });

  it("tous les paiements annulés : rien de payé", async () => {
    const { etudiant, inscription } = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    await payer(etudiant.id, [{ echeanceId: inscription.echeances[0].id, montant: 100_000 }], annule());

    expect((await situationGuichet(etudiant.id, "2026-12-15"))!.anneeEnCours).toMatchObject({ du: 900_000, paye: 0, reste: 900_000 });
  });

  it("annuler un paiement par l'action fait retomber le payé de l'année", async () => {
    const { etudiant } = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    const recu = reussi(await paiements.encaisser({ etudiantId: etudiant.id, montant: 260_000, mode: "ESPECES", idClient: randomUUID(), resteDuAffiche: 900_000, jourAffiche: "2026-11-15" }));
    expect((await situationGuichet(etudiant.id))!.anneeEnCours).toMatchObject({ paye: 260_000, reste: 640_000 });

    reussi(await paiements.annulerPaiement({ paiementId: recu.paiementId!, motif: "erreur de saisie" }));

    expect((await situationGuichet(etudiant.id))!.anneeEnCours).toMatchObject({ paye: 0, reste: 900_000 });
  });

  it("deux années : seule l'inscription la plus récente, le reste dû total garde les deux", async () => {
    const a2025 = await fabriquerAnnee({ anneeDebut: 2025 });
    const e = await fabriquerEtudiant(m.ifs.id, a2025.id);
    const ancienne = await fabriquerInscription(e.id, a2025.id, TARIF, a2025.dateDebut);
    const courante = await fabriquerInscription(e.id, m.annee.id, { ...TARIF, niveau: 2 }, m.annee.dateDebut);
    await payer(e.id, [{ echeanceId: ancienne.echeances[0].id, montant: 100_000 }]);
    await payer(e.id, [{ echeanceId: courante.echeances[0].id, montant: 40_000 }], annule());
    await payer(e.id, [{ echeanceId: courante.echeances[1].id, montant: 25_000 }]);

    const s = (await situationGuichet(e.id, "2026-12-15"))!;

    expect(s.anneeEnCours).toEqual({ anneeDebut: 2026, libelle: "2026-2027", du: 900_000, paye: 25_000, reste: 875_000 });
    expect(s.resteDuTotal).toBe(800_000 + 875_000);
    expect(s.annees.map((a) => a.libelle)).toEqual(["2025-2026", "2026-2027"]);
  });

  it("année soldée : l'année reste décrite, avec un reste nul", async () => {
    const { etudiant } = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    reussi(await paiements.encaisser({ etudiantId: etudiant.id, montant: 900_000, mode: "ESPECES", idClient: randomUUID(), resteDuAffiche: 900_000, jourAffiche: "2026-11-15" }));

    const s = (await situationGuichet(etudiant.id))!;

    expect(s.refus).toMatch(/Rien à encaisser/);
    expect(s.anneeEnCours).toEqual({ anneeDebut: 2026, libelle: "2026-2027", du: 900_000, paye: 900_000, reste: 0 });
  });

  it("sans inscription : aucune année en cours", async () => {
    const e = await fabriquerEtudiant(m.ifs.id, m.annee.id);
    expect((await situationGuichet(e.id))!.anneeEnCours).toBeNull();
  });
});

describe("lireFicheEtudiant : totalEncaisse", () => {
  let m: Monde;

  beforeEach(async () => {
    m = await fabriquerMonde();
    connecter(getSession, m.admin);
  });

  it("somme des paiements non annulés, toutes années ; les annulés restent listés", async () => {
    const a2025 = await fabriquerAnnee({ anneeDebut: 2025 });
    const e = await fabriquerEtudiant(m.ifs.id, a2025.id);
    const ancienne = await fabriquerInscription(e.id, a2025.id, TARIF, a2025.dateDebut);
    const courante = await fabriquerInscription(e.id, m.annee.id, { ...TARIF, niveau: 2 }, m.annee.dateDebut);
    const p = (echeanceId: string, montant: number, donnees = {}) => fabriquerPaiement(e.id, m.user.id, [{ echeanceId, montant }], donnees);
    await p(ancienne.echeances[0].id, 100_000);
    await p(courante.echeances[0].id, 40_000, { annule: true, annuleParId: m.admin.id, dateAnnulation: new Date(), motifAnnulation: "erreur de saisie" });
    await p(courante.echeances[1].id, 25_000);

    const f = (await lireFicheEtudiant(e.id, "2026-12-15"))!;

    expect(f.totalEncaisse).toBe(125_000);
    expect(f.paiements).toHaveLength(3);
    expect(f.paiements.filter((x) => x.annule)).toHaveLength(1);
  });

  it("sans paiement : zéro ; tous annulés : zéro", async () => {
    const { etudiant, inscription } = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    expect((await lireFicheEtudiant(etudiant.id, "2026-12-15"))!.totalEncaisse).toBe(0);

    await fabriquerPaiement(etudiant.id, m.user.id, [{ echeanceId: inscription.echeances[0].id, montant: 100_000 }], {
      annule: true,
      annuleParId: m.admin.id,
      dateAnnulation: new Date(),
      motifAnnulation: "erreur de saisie",
    });
    expect((await lireFicheEtudiant(etudiant.id, "2026-12-15"))!.totalEncaisse).toBe(0);
  });

  it("encaissement puis annulation par les actions : le total suit, au montant des reçus", async () => {
    const { etudiant } = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    const base = { etudiantId: etudiant.id, mode: "ESPECES" as const };
    const r1 = reussi(await paiements.encaisser({ ...base, montant: 100_000, idClient: randomUUID(), resteDuAffiche: 900_000, jourAffiche: "2026-11-15" }));
    reussi(await paiements.encaisser({ ...base, montant: 30_000, idClient: randomUUID(), resteDuAffiche: 800_000, jourAffiche: "2026-11-15" }));
    expect((await lireFicheEtudiant(etudiant.id, "2026-12-15"))!.totalEncaisse).toBe(130_000);

    reussi(await paiements.annulerPaiement({ paiementId: r1.paiementId!, motif: "erreur de saisie" }));

    expect((await lireFicheEtudiant(etudiant.id, "2026-12-15"))!.totalEncaisse).toBe(30_000);
  });
});
