import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { situation, suivreEcheance } from "@/lib/ecolage";
import { echeancesEtudiant, restesParEtudiant, sqlRestes } from "@/server/ecolage";
import { lireEtudiants, lireFicheEtudiant, TAILLE_PAGE_ETUDIANTS } from "@/server/lectures/etudiants";
import { fabriquerAnnee, fabriquerEtudiant, fabriquerFiliere, fabriquerInscription, fabriquerPaiement } from "../factories";
import { fabriquerEtudiantInscrit, fabriquerMonde, type Monde } from "../factories/scenarios";

const TARIF = { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };

let m: Monde;

beforeEach(async () => {
  m = await fabriquerMonde();
});

type Inscrit = Awaited<ReturnType<typeof fabriquerEtudiantInscrit>>;

const payerLignes = (e: Inscrit, lignes: [number, number][], donnees = {}) =>
  fabriquerPaiement(
    e.etudiant.id,
    m.user.id,
    lignes.map(([i, montant]) => ({ echeanceId: e.inscription.echeances[i].id, montant })),
    donnees,
  );

const annule = { annule: true, annuleParId: "", dateAnnulation: new Date("2026-11-16T07:00:00Z"), motifAnnulation: "erreur de saisie" };

/** Ce que `situation()` de la logique pure dit d'un étudiant à un jour donné : la référence des requêtes SQL. */
async function attendu(id: string, jour: string) {
  const echeances = await echeancesEtudiant(db, id);
  const s = situation(echeances, jour);
  const annees = echeances
    .map((e) => ({ ...e, ...suivreEcheance(e, jour) }))
    .filter((e) => e.echue && e.reste > 0)
    .map((e) => e.anneeLibelle);
  return {
    resteDu: s.reste,
    resteEnRetard: s.resteEnRetard,
    moisEnRetard: s.moisEnRetard,
    anneesEnRetard: [...new Set(annees)].sort(),
  };
}

/** Étudiants dans des états de paiement variés, dont un sur deux années et un sorti avec dette. */
async function cohorte() {
  const rien = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { nom: "RIEN" });
  const soldeOctobre = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { nom: "SOLDE" });
  await payerLignes(soldeOctobre, [[0, 100_000], [1, 80_000]]);
  const partiel = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { nom: "PARTIEL" });
  await payerLignes(partiel, [[0, 100_000], [1, 30_000]]);
  const annulé = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { nom: "ANNULE" });
  await payerLignes(annulé, [[0, 100_000], [1, 80_000]], { ...annule, annuleParId: m.admin.id });
  const aVance = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { nom: "AVANCE" });
  await payerLignes(aVance, [[2, 80_000], [3, 80_000]]);
  const tout = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { nom: "TOUT" });
  await payerLignes(tout, tout.inscription.echeances.map((e, i): [number, number] => [i, e.montantDu]));
  const sorti = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { nom: "SORTI", statut: "DIPLOME" });

  const a2025 = await fabriquerAnnee({ anneeDebut: 2025 });
  const deuxAns = await fabriquerEtudiant(m.ifs.id, a2025.id, { nom: "DEUXANS" });
  const ins2025 = await fabriquerInscription(deuxAns.id, a2025.id, TARIF, a2025.dateDebut);
  await fabriquerInscription(deuxAns.id, m.annee.id, { ...TARIF, niveau: 2 }, m.annee.dateDebut);
  await fabriquerPaiement(deuxAns.id, m.user.id, [{ echeanceId: ins2025.echeances[0].id, montant: 100_000 }]);

  return [rien, soldeOctobre, partiel, annulé, aVance, tout, sorti].map((x) => x.etudiant).concat(deuxAns);
}

const JOURS = [
  "2025-10-31", "2025-11-01", "2026-09-30", "2026-10-01", "2026-10-31",
  "2026-11-01", "2026-11-30", "2026-12-01", "2027-07-31", "2027-08-01",
];

describe("filtre « en retard » et restes SQL : cohérence avec situation()", () => {
  it("la limite : octobre est « à venir » le 31/10 et « en retard » le 1er novembre", async () => {
    const e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);

    const veille = await lireEtudiants({ enRetard: "1" }, "2026-10-31");
    const lendemain = await lireEtudiants({ enRetard: "1" }, "2026-11-01");

    expect(veille.lignes).toEqual([]);
    expect(lendemain.lignes).toMatchObject([{ id: e.etudiant.id, resteEnRetard: 180_000, moisEnRetard: 1, resteDu: 900_000 }]);
  });

  it("un acompte sur un mois non échu ne met pas en retard ; échu et non soldé, si", async () => {
    const e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    await payerLignes(e, [[0, 100_000], [1, 80_000], [2, 20_000]]);

    expect((await lireEtudiants({ enRetard: "1" }, "2026-11-30")).lignes).toEqual([]);
    expect((await lireEtudiants({ enRetard: "1" }, "2026-12-01")).lignes).toMatchObject([
      { id: e.etudiant.id, resteEnRetard: 60_000, moisEnRetard: 1 },
    ]);
  });

  it.each(JOURS)("à %s : restes, mois et années en retard identiques à situation() pour chaque étudiant", async (jour) => {
    const etudiants = await cohorte();

    const liste = await lireEtudiants({}, jour);

    expect(liste.lignes).toHaveLength(etudiants.length);
    for (const e of etudiants) {
      const a = await attendu(e.id, jour);
      const ligne = liste.lignes.find((l) => l.id === e.id)!;
      expect({ resteDu: ligne.resteDu, resteEnRetard: ligne.resteEnRetard, moisEnRetard: ligne.moisEnRetard }, e.nom).toEqual({
        resteDu: a.resteDu,
        resteEnRetard: a.resteEnRetard,
        moisEnRetard: a.moisEnRetard,
      });
    }

    const enRetard = await lireEtudiants({ enRetard: "1" }, jour);
    const attenduEnRetard = [];
    for (const e of etudiants) if ((await attendu(e.id, jour)).resteEnRetard > 0) attenduEnRetard.push(e.id);
    expect(enRetard.lignes.map((l) => l.id).sort()).toEqual(attenduEnRetard.sort());
  });

  it.each(JOURS)("à %s : les impayés sont les étudiants actifs en retard selon situation()", async (jour) => {
    const { lireImpayes } = await import("@/server/lectures/paiements");
    const etudiants = await cohorte();

    const impayes = await lireImpayes({}, jour);

    const attendus = [];
    for (const e of etudiants) {
      const a = await attendu(e.id, jour);
      if (e.statut === "ACTIF" && a.resteEnRetard > 0) attendus.push({ id: e.id, ...a });
    }
    expect(impayes.lignes.map((l) => l.id).sort()).toEqual(attendus.map((a) => a.id).sort());
    for (const l of impayes.lignes) {
      const a = attendus.find((x) => x.id === l.id)!;
      expect({ resteDu: l.resteDu, resteEnRetard: l.resteEnRetard, moisEnRetard: l.moisEnRetard, anneesEnRetard: l.anneesEnRetard }).toEqual({
        resteDu: a.resteDu,
        resteEnRetard: a.resteEnRetard,
        moisEnRetard: a.moisEnRetard,
        anneesEnRetard: a.anneesEnRetard,
      });
    }
    expect(impayes.totaux).toEqual({ etudiants: attendus.length, resteEnRetard: attendus.reduce((s, a) => s + a.resteEnRetard, 0) });
  });
});

describe("sqlRestes", () => {
  it("restreint aux étudiants demandés, ou à tous avec null ; un étudiant sans échéance n'a pas de ligne", async () => {
    const a = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    const b = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    await fabriquerEtudiant(m.ifs.id, m.annee.id);
    const limite = new Date("2026-11-01T00:00:00Z");

    const seul = await db.$queryRaw<{ etudiantId: string }[]>(sqlRestes(limite, [a.etudiant.id]));
    const tous = await db.$queryRaw<{ etudiantId: string }[]>(sqlRestes(limite, null));

    expect(seul.map((r) => r.etudiantId)).toEqual([a.etudiant.id]);
    expect(tous.map((r) => r.etudiantId).sort()).toEqual([a.etudiant.id, b.etudiant.id].sort());
  });

  it("tranche de droits et mensualité du même mois comptent pour un seul mois en retard", async () => {
    const e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, {}, 3);

    const restes = await restesParEtudiant([e.etudiant.id], new Date("2027-01-01T00:00:00Z"));

    expect(restes.get(e.etudiant.id)).toEqual({
      resteDu: 900_000,
      resteEnRetard: 3 * 80_000 + 100_000,
      moisEnRetard: 3,
      anneesEnRetard: ["2026-2027"],
    });
  });

  it("ignore les paiements annulés et ne descend jamais sous zéro sur une échéance surpayée", async () => {
    const e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    await payerLignes(e, [[0, 100_000]], { ...annule, annuleParId: m.admin.id });
    await payerLignes(e, [[1, 80_000]]);
    await payerLignes(e, [[1, 80_000]]);

    const restes = await restesParEtudiant([e.etudiant.id], new Date("2026-11-01T00:00:00Z"));

    expect(restes.get(e.etudiant.id)).toMatchObject({ resteDu: 900_000 - 80_000, resteEnRetard: 100_000 });
  });

  it("aucun identifiant : table vide sans requête", async () => {
    expect((await restesParEtudiant([], new Date())).size).toBe(0);
  });
});

describe("lireEtudiants : filtres, tri et pagination", () => {
  async function scene() {
    const a2025 = await fabriquerAnnee({ anneeDebut: 2025 });
    const alpha = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { nom: "ALPHA", prenoms: "Éloïse" });
    const bravo = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, { ...TARIF, niveau: 2 }, { nom: "BRAVO" });
    const charlie = await fabriquerEtudiantInscrit(m.sf.id, m.annee, TARIF, { nom: "CHARLIE", statut: "ABANDON" });
    const delta = await fabriquerEtudiant(m.ifs.id, a2025.id, { nom: "DELTA" });
    await fabriquerInscription(delta.id, a2025.id, TARIF, a2025.dateDebut);
    await fabriquerInscription(delta.id, m.annee.id, { ...TARIF, niveau: 2 }, m.annee.dateDebut);
    return { a2025, alpha: alpha.etudiant, bravo: bravo.etudiant, charlie: charlie.etudiant, delta };
  }

  const noms = (l: { lignes: { nom: string }[] }) => l.lignes.map((x) => x.nom);

  it("trie par nom et décrit chaque ligne : filière, niveau le plus récent, année, statut", async () => {
    const s = await scene();
    await db.inscription.updateMany({ where: { etudiantId: s.bravo.id }, data: { redoublement: true } });

    const liste = await lireEtudiants({}, "2026-11-15");

    expect(noms(liste)).toEqual(["ALPHA", "BRAVO", "CHARLIE", "DELTA"]);
    expect(liste.lignes[0]).toMatchObject({
      matricule: s.alpha.matricule,
      filiere: { code: "IF", nom: "Infirmier(e)s" },
      niveau: 1,
      libelleNiveau: "1re année",
      anneeScolaire: "2026-2027",
      statut: "ACTIF",
      libelleStatut: "Active",
      resteDu: 900_000,
      resteEnRetard: 180_000,
      moisEnRetard: 1,
    });
    expect(liste.lignes[1].libelleNiveau).toBe("2e année (redoublant)");
    expect(liste.lignes[2]).toMatchObject({ statut: "ABANDON", libelleStatut: "Abandon", filiere: { code: "SF" } });
    expect(liste.lignes[3]).toMatchObject({ niveau: 2, libelleNiveau: "2e année" });
    expect(liste).toMatchObject({ total: 4, page: 1, pages: 1, taillePage: TAILLE_PAGE_ETUDIANTS });
    expect(liste.options.filieres.map((f) => f.code)).toEqual(["IF", "SF"]);
    expect(liste.options.annees.map((a) => a.libelle)).toEqual(["2026-2027", "2025-2026"]);
    expect(liste.options.niveauMax).toBe(3);
  });

  it("filtre par filière, statut, niveau (inscription la plus récente), année et niveau dans l'année", async () => {
    const s = await scene();
    const j = "2026-11-15";

    expect(noms(await lireEtudiants({ filiereId: m.ifs.id }, j))).toEqual(["ALPHA", "BRAVO", "DELTA"]);
    expect(noms(await lireEtudiants({ filiereId: m.sf.id }, j))).toEqual(["CHARLIE"]);
    expect(noms(await lireEtudiants({ statut: "ABANDON" }, j))).toEqual(["CHARLIE"]);
    expect(noms(await lireEtudiants({ niveau: "2" }, j))).toEqual(["BRAVO", "DELTA"]);
    expect(noms(await lireEtudiants({ anneeId: s.a2025.id }, j))).toEqual(["DELTA"]);
    expect(noms(await lireEtudiants({ anneeId: s.a2025.id, niveau: "1" }, j))).toEqual(["DELTA"]);
    expect(noms(await lireEtudiants({ anneeId: s.a2025.id, niveau: "2" }, j))).toEqual([]);
    expect(noms(await lireEtudiants({ anneeId: m.annee.id, niveau: "2" }, j))).toEqual(["BRAVO", "DELTA"]);
    expect(noms(await lireEtudiants({ filiereId: m.ifs.id, niveau: "1", statut: "ACTIF" }, j))).toEqual(["ALPHA"]);
  });

  it("recherche sans accent ni casse, par nom, prénoms ou matricule ; jokers LIKE traités littéralement", async () => {
    const s = await scene();
    const j = "2026-11-15";

    expect(noms(await lireEtudiants({ q: "eloise" }, j))).toEqual(["ALPHA"]);
    expect(noms(await lireEtudiants({ q: "ÉLOÏSE alpha" }, j))).toEqual(["ALPHA"]);
    expect(noms(await lireEtudiants({ q: s.bravo.matricule }, j))).toEqual(["BRAVO"]);
    expect(noms(await lireEtudiants({ q: "zzz" }, j))).toEqual([]);
    for (const q of ["%", "_", "a_p", "\\"]) expect(noms(await lireEtudiants({ q }, j)), q).toEqual([]);
  });

  it("ignore les filtres invalides au lieu de planter", async () => {
    await scene();
    const liste = await lireEtudiants(
      { statut: "INCONNU", niveau: "99", page: "abc", enRetard: "peut-être", filiereId: "", q: "x".repeat(300) },
      "2026-11-15",
    );
    expect(liste.page).toBe(1);
    expect(liste.filtres).toMatchObject({ statut: undefined, niveau: undefined, page: 1, enRetard: false, q: undefined });
    expect(liste.lignes).toHaveLength(4);
  });

  it("pagine par 25 : 26 étudiants donnent deux pages, une page trop haute est ramenée à la dernière", async () => {
    for (let i = 0; i < 26; i++) await fabriquerEtudiant(m.ifs.id, m.annee.id, { nom: `ETU${String(i).padStart(2, "0")}` });

    const p1 = await lireEtudiants({}, "2026-11-15");
    const p2 = await lireEtudiants({ page: "2" }, "2026-11-15");
    const hors = await lireEtudiants({ page: "9" }, "2026-11-15");

    expect(p1).toMatchObject({ total: 26, pages: 2, page: 1 });
    expect(p1.lignes).toHaveLength(25);
    expect(p2.lignes.map((l) => l.nom)).toEqual(["ETU25"]);
    expect(hors).toMatchObject({ page: 2 });
    expect(hors.lignes.map((l) => l.nom)).toEqual(["ETU25"]);
    expect(p1.lignes[0]).toMatchObject({ niveau: null, libelleNiveau: null, anneeScolaire: null, resteDu: 0, resteEnRetard: 0 });
  });

  it("base vide : une page, aucune ligne", async () => {
    await db.etudiant.deleteMany();
    expect(await lireEtudiants({}, "2026-11-15")).toMatchObject({ total: 0, pages: 1, page: 1, lignes: [] });
  });

  it("niveauMax suit la plus longue filière", async () => {
    await fabriquerFiliere({ code: "XX", dureeAnnees: 5 });
    expect((await lireEtudiants({}, "2026-11-15")).options.niveauMax).toBe(5);
  });
});

describe("lireFicheEtudiant", () => {
  it("étudiant inconnu : null", async () => {
    expect(await lireFicheEtudiant("inconnu", "2026-11-15")).toBeNull();
  });

  it("identité, parcours, échéances suivies et situation à la date du jour", async () => {
    const e = await fabriquerEtudiantInscrit(
      m.ifs.id, m.annee, TARIF,
      { nom: "RAKOTO", telephone: "0341234567", dateNaissance: new Date("2005-03-14T00:00:00Z"), creeParId: m.user.id },
      3,
    );
    await payerLignes(e, [[0, 34_000], [1, 80_000], [2, 10_000]]);

    const f = (await lireFicheEtudiant(e.etudiant.id, "2026-11-15"))!;

    expect(f).toMatchObject({
      nom: "RAKOTO",
      libelleSexe: "Féminin",
      dateNaissance: "2005-03-14",
      dateNaissanceAffichee: "14/03/2005",
      telephoneAffiche: "034 12 345 67",
      statut: "ACTIF",
      sortie: null,
      anneeEntree: "2026-2027",
      creePar: "Caissier Test",
      jour: "2026-11-15",
      filiere: { code: "IF" },
    });
    expect(f.parcours).toHaveLength(1);
    const p = f.parcours[0];
    expect(p).toMatchObject({ annee: "2026-2027", niveau: 1, droitsEnTranches: 3, libelleNiveau: "1re année", libelleStatut: "En cours" });
    expect(p.echeances).toHaveLength(13);
    expect(p.echeances.slice(0, 5).map((x) => [x.libelle, x.paye, x.statut])).toEqual([
      ["Droits — tranche 1/3", 34_000, "paye"],
      ["Octobre 2026", 80_000, "paye"],
      ["Droits — tranche 2/3", 10_000, "partiel"],
      ["Novembre 2026", 0, "a_venir"],
      ["Droits — tranche 3/3", 0, "a_venir"],
    ]);
    expect(f.situation).toEqual({ du: 900_000, paye: 124_000, reste: 776_000, resteEnRetard: 0, moisEnRetard: 0, duEchu: 114_000, payeEchu: 114_000 });
    expect(p.totaux).toEqual(f.situation);
    expect(f.paiements).toHaveLength(1);
  });

  it("les paiements annulés figurent dans l'historique mais ne comptent plus dans la situation", async () => {
    const e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    await payerLignes(e, [[0, 100_000]], { numeroRecu: "R-2026-00001" });
    await payerLignes(e, [[1, 80_000]], { numeroRecu: "R-2026-00002", ...annule, annuleParId: m.admin.id });

    const f = (await lireFicheEtudiant(e.etudiant.id, "2026-11-15"))!;

    expect(f.situation).toMatchObject({ paye: 100_000, reste: 800_000, resteEnRetard: 80_000, moisEnRetard: 1 });
    expect(f.paiements.map((p) => [p.numeroRecu, p.annule])).toEqual(expect.arrayContaining([["R-2026-00001", false], ["R-2026-00002", true]]));
    const a = f.paiements.find((p) => p.annule)!;
    expect(a.annulation).toEqual({ date: "16/11/2026", par: "Admin Test", motif: "erreur de saisie" });
  });

  it("sortie renseignée pour un étudiant sorti", async () => {
    const e = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, {
      statut: "ABANDON", dateSortie: new Date("2026-12-05T00:00:00Z"), motifSortie: "Déménagement",
    });
    const f = (await lireFicheEtudiant(e.etudiant.id, "2026-12-10"))!;
    expect(f).toMatchObject({ statut: "ABANDON", libelleStatut: "Abandon", sortie: { date: "2026-12-05", motif: "Déménagement" } });
  });

  it("deux années : chacune suivie pour elle-même, la situation générale les additionne", async () => {
    const a2025 = await fabriquerAnnee({ anneeDebut: 2025 });
    const etudiant = await fabriquerEtudiant(m.ifs.id, a2025.id);
    const ins2025 = await fabriquerInscription(etudiant.id, a2025.id, TARIF, a2025.dateDebut);
    await fabriquerInscription(etudiant.id, m.annee.id, { ...TARIF, niveau: 2 }, m.annee.dateDebut);
    await fabriquerPaiement(etudiant.id, m.user.id, ins2025.echeances.map((x) => ({ echeanceId: x.id, montant: x.montantDu })));

    const f = (await lireFicheEtudiant(etudiant.id, "2026-11-15"))!;

    expect(f.parcours.map((p) => [p.annee, p.niveau, p.totaux.reste, p.totaux.resteEnRetard])).toEqual([
      ["2025-2026", 1, 0, 0],
      ["2026-2027", 2, 900_000, 180_000],
    ]);
    expect(f.situation).toMatchObject({ du: 1_800_000, paye: 900_000, reste: 900_000, resteEnRetard: 180_000 });
  });

  it("tranchesModifiables : faux dès une ligne de paiement sur les droits, annulée comprise ; année clôturée", async () => {
    const libre = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    const paye = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    await payerLignes(paye, [[0, 10_000]], { ...annule, annuleParId: m.admin.id });
    const surMensualite = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    await payerLignes(surMensualite, [[1, 10_000]]);

    const lire = async (e: Inscrit) => (await lireFicheEtudiant(e.etudiant.id, "2026-11-15"))!.parcours[0];

    expect(await lire(libre)).toMatchObject({ tranchesModifiables: true, refusTranches: null });
    expect(await lire(paye)).toMatchObject({ tranchesModifiables: false, refusTranches: expect.stringMatching(/même annulés/) });
    expect((await lire(surMensualite)).tranchesModifiables).toBe(true);

    await db.anneeScolaire.update({ where: { id: m.annee.id }, data: { cloturee: true } });
    expect(await lire(libre)).toMatchObject({ tranchesModifiables: false, anneeCloturee: true, refusTranches: expect.stringMatching(/clôturée/) });
  });
});
