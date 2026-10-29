import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  appliquerFile,
  construireSituationGuichet,
  recuHorsLigne,
  schemaCopieGuichet,
  type EtudiantCopie,
} from "@/lib/encaissement-hors-ligne";
import { fabriquerAnnee, fabriquerEtudiant, fabriquerFrais, fabriquerInscription, fabriquerPaiement } from "../factories";
import { elementHorsLigne, numero, POSTE_A, reserver, SAISI_LE } from "../factories/hors-ligne";
import { fabriquerEtudiantInscrit, fabriquerMonde, type Monde } from "../factories/scenarios";

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { copieGuichet } = await import("@/server/lectures/copie-guichet");
const { derniersServis, lireRecu, rechercherAuGuichet, situationGuichet } = await import("@/server/lectures/paiements");
const { synchroniserPaiement } = await import("@/server/paiements");

const TARIF = { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };
const MAINTENANT = new Date("2026-11-15T09:00:00Z");

let m: Monde;

beforeEach(async () => {
  m = await fabriquerMonde();
});

const payer = (echeances: { id: string; montantDu: number }[], saisiParId: string, etudiantId: string, montants: number[]) =>
  fabriquerPaiement(
    etudiantId,
    saisiParId,
    montants.flatMap((montant, i) => (montant > 0 && echeances[i] ? [{ echeanceId: echeances[i].id, montant }] : [])),
  );

/** Étudiant sur deux années (2025-2026 partiellement payée, 2026-2027 en 2e année redoublante). */
async function deuxAnnees() {
  const a2025 = await fabriquerAnnee({ anneeDebut: 2025 });
  const etudiant = await fabriquerEtudiant(m.ifs.id, a2025.id);
  const ins2025 = await fabriquerInscription(etudiant.id, a2025.id, { ...TARIF, montantMensuel: 70_000 }, a2025.dateDebut);
  const ins2026 = await fabriquerInscription(etudiant.id, m.annee.id, { ...TARIF, niveau: 2 }, m.annee.dateDebut);
  await db.inscription.update({ where: { id: ins2026.id }, data: { redoublement: true } });
  await payer(ins2025.echeances, m.user.id, etudiant.id, [100_000, 70_000, 70_000, 30_000]);
  await payer(ins2026.echeances, m.user.id, etudiant.id, [100_000, 20_000]);
  return etudiant;
}

async function sortiAvecEcheancesFutures(statut: "ABANDON" | "EXCLU" | "DIPLOME", payerTout = false) {
  const { etudiant, inscription } = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { statut });
  await db.echeance.updateMany({ where: { inscriptionId: inscription.id, type: { not: "DROITS" }, mois: { gt: new Date("2026-11-30T00:00:00Z") } }, data: { nonDueSortie: true } });
  if (payerTout) {
    const dues = inscription.echeances.filter((e) => e.type === "DROITS" || e.mois <= new Date("2026-11-30T00:00:00Z"));
    await payer(dues, m.user.id, etudiant.id, dues.map((e) => e.montantDu));
  }
  return etudiant;
}

describe("copieGuichet : qui figure dans la copie", () => {
  it("les actifs (même soldés ou sans inscription) et les sortis qui doivent encore ; pas les sortis soldés", async () => {
    const actif = (await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF)).etudiant;
    const actifSolde = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    await payer(actifSolde.inscription.echeances, m.user.id, actifSolde.etudiant.id, actifSolde.inscription.echeances.map((e) => e.montantDu));
    const sansInscription = await fabriquerEtudiant(m.ifs.id, m.annee.id);
    const sortiDebiteur = await sortiAvecEcheancesFutures("ABANDON");
    const sortiSolde = await sortiAvecEcheancesFutures("DIPLOME", true);
    const sortiSansRienDeDu = (await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { statut: "EXCLU" })).etudiant;
    await db.echeance.updateMany({ where: { inscription: { etudiantId: sortiSansRienDeDu.id } }, data: { nonDueSortie: true } });

    const copie = await copieGuichet(MAINTENANT);

    const ids = copie.etudiants.map((e) => e.id);
    expect(ids).toContain(actif.id);
    expect(ids).toContain(actifSolde.etudiant.id);
    expect(ids).toContain(sansInscription.id);
    expect(ids).toContain(sortiDebiteur.id);
    expect(ids).not.toContain(sortiSolde.id);
    expect(ids).not.toContain(sortiSansRienDeDu.id);
    expect(copie.genereeLeISO).toBe(MAINTENANT.toISOString());
  });

  it("un sorti qui doit encore garde ses échéances dues, sans celles « non dues après sortie »", async () => {
    const sorti = await sortiAvecEcheancesFutures("ABANDON");

    const e = (await copieGuichet(MAINTENANT)).etudiants.find((x) => x.id === sorti.id)!;

    expect(e.statut).toBe("ABANDON");
    expect(e.echeances.map((x) => [x.type, x.mois]).sort()).toEqual([
      ["DROITS", "2026-10-01"],
      ["MENSUALITE", "2026-10-01"],
      ["MENSUALITE", "2026-11-01"],
    ]);
  });

  it("un sorti dont ne reste que du « non dû » n'est pas encaissable, même quand le jour passe", async () => {
    const sorti = await sortiAvecEcheancesFutures("EXCLU", true);

    for (const maintenant of [MAINTENANT, new Date("2027-06-01T09:00:00Z")]) {
      expect((await copieGuichet(maintenant)).etudiants.map((x) => x.id)).not.toContain(sorti.id);
    }
  });

  it("aucun tarif dans la copie : seulement des échéances portant leurs montants", async () => {
    await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);

    const copie = await copieGuichet(MAINTENANT);

    const texte = JSON.stringify(copie);
    expect(texte).not.toMatch(/tarif|droitsInscription|montantMensuel|nombreMois/i);
    expect(Object.keys(copie).sort()).toEqual(["etudiants", "genereeLeISO"]);
    expect(Object.keys(copie.etudiants[0].echeances[0]).sort()).toEqual(
      ["anneeDebut", "anneeLibelle", "id", "libelle", "mois", "montantDu", "paye", "rangFrais", "type"],
    );
  });

  it("un frais figure dans la copie avec son libellé, son montant, son mois et son ordre de création", async () => {
    const s = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    const a = await fabriquerFrais(m.annee.id, { classes: [{ filiereId: m.ifs.id, niveau: 1 }], libelle: "Frais d'examen", montant: 15_000, inscriptionIds: [s.inscription.id] });
    const b = await fabriquerFrais(m.annee.id, { classes: [{ filiereId: m.ifs.id, niveau: 1 }], libelle: "Stage", montant: 5_000, inscriptionIds: [s.inscription.id] });

    const e = (await copieGuichet(MAINTENANT)).etudiants.find((x) => x.id === s.etudiant.id)!;

    const frais = e.echeances.filter((x) => x.type === "FRAIS").sort((x, y) => x.rangFrais! - y.rangFrais!);
    expect(frais).toMatchObject([
      { libelle: "Frais d'examen", montantDu: 15_000, mois: "2027-03-01", rangFrais: a.frais.rang, paye: 0 },
      { libelle: "Stage", montantDu: 5_000, rangFrais: b.frais.rang },
    ]);
    expect(a.frais.rang).toBeLessThan(b.frais.rang);
    expect(e.echeances.filter((x) => x.type !== "FRAIS").every((x) => x.rangFrais === null)).toBe(true);
  });

  it("la copie sérialisée en JSON est relue par son schéma, étudiants triés par nom", async () => {
    await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { nom: "ZAFY" });
    await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, { nom: "ABEL" });
    await deuxAnnees();

    const copie = await copieGuichet(MAINTENANT);

    expect(schemaCopieGuichet.safeParse(JSON.parse(JSON.stringify(copie))).success).toBe(true);
    const noms = copie.etudiants.map((e) => e.nom);
    expect(noms[0]).toBe("ABEL");
    expect(noms[noms.length - 1]).toBe("ZAFY");
  });

  it("n'embarque pas les échéances soldées des années passées, mais garde l'année la plus récente en entier", async () => {
    const etudiant = await deuxAnnees();

    const e = (await copieGuichet(MAINTENANT)).etudiants.find((x) => x.id === etudiant.id)!;

    expect(e.echeances.filter((x) => x.anneeDebut === 2025).every((x) => x.paye < x.montantDu)).toBe(true);
    expect(e.echeances.filter((x) => x.anneeDebut === 2026)).toHaveLength(11);
  });
});

describe("confidentialité : le guichet ne renvoie ni téléphone ni adresse", () => {
  const COORDONNEES = /telephone|adresse|email|0349998877|034\D*99\D*988\D*77|Rue Secrète|secret@test\.mg/i;

  async function etudiantConfidentiel() {
    const s = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, {
      nom: "CONFIDENT",
      telephone: "0349998877",
      adresse: "Lot 77 Rue Secrète",
      email: "secret@test.mg",
    });
    await payer(s.inscription.echeances, m.user.id, s.etudiant.id, [100_000]);
    return s.etudiant;
  }

  it("copieGuichet", async () => {
    const etudiant = await etudiantConfidentiel();

    const copie = await copieGuichet(MAINTENANT);

    expect(copie.etudiants.map((x) => x.id)).toContain(etudiant.id);
    expect(JSON.stringify(copie)).not.toMatch(COORDONNEES);
  });

  it("situationGuichet", async () => {
    const etudiant = await etudiantConfidentiel();

    const situation = await situationGuichet(etudiant.id, "2026-11-15");

    expect(situation?.etudiant.nom).toBe("CONFIDENT");
    expect(JSON.stringify(situation)).not.toMatch(COORDONNEES);
  });

  it("la recherche et les derniers servis du guichet", async () => {
    const etudiant = await etudiantConfidentiel();

    const trouves = await rechercherAuGuichet("confident", "2026-11-15");
    const servis = await derniersServis(m.user.id, 5, "2026-11-15");

    expect(trouves.map((x) => x.id)).toEqual([etudiant.id]);
    expect(servis.map((x) => x.id)).toEqual([etudiant.id]);
    expect(JSON.stringify([trouves, servis])).not.toMatch(COORDONNEES);
  });
});

describe("parité : la situation du poste hors ligne est celle du serveur", () => {
  const JOURS = ["2025-09-01", "2026-10-31", "2026-11-01", "2026-11-15", "2026-12-31", "2027-01-01", "2027-03-01", "2027-03-31", "2027-04-01", "2027-08-01"];

  async function comparer(etudiantId: string) {
    for (const jour of JOURS) {
      const copie = await copieGuichet(new Date(`${jour}T09:00:00Z`));
      const local = copie.etudiants.find((e) => e.id === etudiantId);
      const serveur = await situationGuichet(etudiantId, jour);
      if (!local) {
        expect(serveur?.etudiant.resteDu, `${jour} : absent de la copie`).toBe(0);
        continue;
      }
      expect(construireSituationGuichet(local, local.echeances, jour), jour).toEqual(serveur);
    }
  }

  it("plusieurs années, redoublant, paiements partiels", async () => {
    await comparer((await deuxAnnees()).id);
  });

  it("étudiant actif sans inscription", async () => {
    await comparer((await fabriquerEtudiant(m.ifs.id, m.annee.id)).id);
  });

  it("étudiant soldé", async () => {
    const s = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    await payer(s.inscription.echeances, m.user.id, s.etudiant.id, s.inscription.echeances.map((e) => e.montantDu));

    await comparer(s.etudiant.id);
  });

  it("sorti qui doit encore, avec échéances non dues", async () => {
    await comparer((await sortiAvecEcheancesFutures("ABANDON")).id);
  });

  it("droits payés en partie", async () => {
    const s = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    await payer(s.inscription.echeances, m.user.id, s.etudiant.id, [20_000]);

    await comparer(s.etudiant.id);
  });

  it("frais : à jour en mars, en retard, frais payé en partie, deux frais du même mois", async () => {
    const classe = [{ filiereId: m.ifs.id, niveau: 1 }];
    const aJour = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    const enRetard = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    const mars = new Date(Date.UTC(2027, 2, 1));
    const examen = await fabriquerFrais(m.annee.id, { classes: classe, libelle: "Frais d'examen", montant: 15_000, mois: mars, inscriptionIds: [aJour.inscription.id, enRetard.inscription.id] });
    const stage = await fabriquerFrais(m.annee.id, { classes: classe, libelle: "Stage", montant: 5_000, mois: mars, inscriptionIds: [aJour.inscription.id, enRetard.inscription.id] });
    const jusquaMars = aJour.inscription.echeances.slice(0, 7);
    await payer(jusquaMars, m.user.id, aJour.etudiant.id, jusquaMars.map((e) => e.montantDu));
    await fabriquerPaiement(aJour.etudiant.id, m.user.id, [{ echeanceId: examen.echeances[0].id, montant: 6_000, resteEcheanceApres: 9_000 }]);
    await payer(enRetard.inscription.echeances.slice(0, 2), m.user.id, enRetard.etudiant.id, [100_000, 80_000]);

    await comparer(aJour.etudiant.id);
    await comparer(enRetard.etudiant.id);
    const ordre = (await situationGuichet(aJour.etudiant.id, "2027-03-10"))!.echeances.map((x) => x.libelle);
    expect(ordre.slice(0, 3)).toEqual(["Frais d'examen", "Stage", "Avril 2027"]);
    expect(stage.frais.rang).toBeGreaterThan(examen.frais.rang);
  });

  it("copie ancienne, sans libellé ni rang de frais : la situation reste celle du serveur", async () => {
    const s = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    await payer(s.inscription.echeances, m.user.id, s.etudiant.id, [40_000]);
    const jour = "2026-11-15";
    const copie = await copieGuichet(new Date(`${jour}T09:00:00Z`));
    const local = copie.etudiants.find((e) => e.id === s.etudiant.id)!;
    const ancienne = local.echeances.map(({ libelle: _l, rangFrais: _r, ...reste }) => reste);

    expect(construireSituationGuichet(local, ancienne, jour)).toEqual(await situationGuichet(s.etudiant.id, jour));
  });

  it("sorti soldé : hors de la copie, le serveur répond « rien à encaisser »", async () => {
    const sorti = await sortiAvecEcheancesFutures("DIPLOME", true);

    expect((await copieGuichet(MAINTENANT)).etudiants.map((e) => e.id)).not.toContain(sorti.id);
    expect((await situationGuichet(sorti.id, "2026-11-15"))?.refus).toMatch(/Rien à encaisser/);
  });
});

describe("parité : le ticket imprimé hors ligne est celui que réimprimera le serveur", () => {
  /** Ticket local avant synchro, puis relecture du même paiement enregistré au serveur. */
  async function comparerTicket(etudiantId: string, montants: number[], saisiLe = SAISI_LE) {
    const instant = new Date(saisiLe);
    const annee = instant.getUTCFullYear();
    const bloc = await reserver(m.user.id, POSTE_A, annee);
    for (const [i, montant] of montants.entries()) {
      const local = (await copieGuichet(instant)).etudiants.find((e) => e.id === etudiantId) as EtudiantCopie;
      const numeroRecu = numero(bloc.libres[i], annee);
      const attendu = recuHorsLigne({ etudiant: local, montant, mode: "ESPECES", operateur: null, reference: null, numeroRecu, instant, caissier: m.user.name });
      if (!attendu.ok) throw new Error(attendu.erreur);

      const r = await synchroniserPaiement(
        elementHorsLigne(
          { etudiantId, saisiParId: m.user.id, numeroRecu, montant, resteDuAffiche: attendu.resteDuAvant },
          { instantSaisie: saisiLe, recuLe: new Date(instant.getTime() + 30 * 60_000) },
        ),
      );
      if (r.statut !== "enregistre") throw new Error(JSON.stringify(r));
      expect(r.aVerifier, "aucune note attendue").toBe(false);

      expect(await lireRecu(r.paiementId), `paiement ${i + 1}`).toEqual({ ...attendu.recu, paiementId: r.paiementId });
    }
  }

  it("deux mois d'un coup, puis un acompte", async () => {
    const s = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    await comparerTicket(s.etudiant.id, [260_000, 30_000]);
  });

  it("paiement qui couvre deux années : libellés de droits précisés par année", async () => {
    await comparerTicket((await deuxAnnees()).id, [150_000]);
  });

  it("droits payés en partie, puis le complément", async () => {
    const s = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    await comparerTicket(s.etudiant.id, [20_000, 80_000]);
  });

  describe("frais", () => {
    const classe = () => [{ filiereId: m.ifs.id, niveau: 1 }];
    const mars = new Date(Date.UTC(2027, 2, 1));
    const JUSQUA_MARS = [100_000, 80_000, 80_000, 80_000, 80_000, 80_000, 80_000];

    /** Étudiant à jour jusqu'en mars (droits compris), avec un frais d'examen exigible en mars. */
    async function aJourAvecFrais(libelle = "Frais d'examen") {
      const s = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
      const { frais, echeances } = await fabriquerFrais(m.annee.id, { classes: classe(), libelle, montant: 15_000, mois: mars, inscriptionIds: [s.inscription.id] });
      const dues = s.inscription.echeances.slice(0, 7);
      await payer(dues, m.user.id, s.etudiant.id, JUSQUA_MARS);
      return { ...s, frais, fraisEcheance: echeances[0] };
    }

    it("le 31 mars : le frais d'examen est soldé avant la mensualité d'avril, ticket local = reçu du serveur", async () => {
      const s = await aJourAvecFrais();
      await comparerTicket(s.etudiant.id, [15_000], "2027-03-31T09:00:00.000Z");

      const lignes = await db.paiementLigne.findMany({ include: { echeance: true }, where: { montant: 15_000 } });
      expect(lignes.map((l) => l.echeance.type)).toEqual(["FRAIS"]);
    });

    it("le 1er avril : la mensualité d'avril, devenue exigible, passe avant le frais, ticket local = reçu du serveur", async () => {
      const s = await aJourAvecFrais();
      await comparerTicket(s.etudiant.id, [15_000], "2027-04-01T09:00:00.000Z");

      const lignes = await db.paiementLigne.findMany({ include: { echeance: true }, where: { montant: 15_000 } });
      expect(lignes.map((l) => [l.echeance.type, l.echeance.mois.toISOString().slice(0, 7)])).toEqual([["MENSUALITE", "2027-04"]]);
    });

    it("frais payé en partie, puis le complément et un surplus en acompte sur la mensualité suivante", async () => {
      const s = await aJourAvecFrais();
      await comparerTicket(s.etudiant.id, [6_000, 29_000], "2027-03-10T09:00:00.000Z");
    });

    it("réimpression un mois plus tard : mêmes lignes et libellé figé, même si le frais a été renommé", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2027-03-10T09:00:00Z") });
      try {
        const s = await aJourAvecFrais("Frais d'examen");
        const bloc = await reserver(m.user.id, POSTE_A, 2027);
        const numeroRecu = numero(bloc.libres[0], 2027);
        const r = await synchroniserPaiement(
          elementHorsLigne(
            { etudiantId: s.etudiant.id, saisiParId: m.user.id, numeroRecu, montant: 15_000, resteDuAffiche: 15_000 + 4 * 80_000 },
            { instantSaisie: "2027-03-10T09:00:00.000Z", recuLe: new Date("2027-03-10T09:30:00Z") },
          ),
        );
        if (r.statut !== "enregistre") throw new Error(JSON.stringify(r));
        const original = await lireRecu(r.paiementId);
        expect(original?.lignes).toEqual([{ libelle: "Frais d'examen", montant: 15_000, acompte: false, resteEcheance: 0 }]);

        await db.frais.update({ where: { id: s.frais.id }, data: { libelle: "Examen final (renommé)" } });
        vi.setSystemTime(new Date("2027-04-12T09:00:00Z"));

        expect(await lireRecu(r.paiementId)).toEqual(original);
        const ligne = await db.paiementLigne.findFirstOrThrow({ where: { paiementId: r.paiementId } });
        expect(ligne.libelle).toBe("Frais d'examen");
      } finally {
        vi.useRealTimers();
      }
    });

    it("le poste hors ligne imprime le libellé de sa copie, le serveur le fige tel quel", async () => {
      const s = await aJourAvecFrais("Frais de stage");
      await comparerTicket(s.etudiant.id, [15_000], "2027-03-10T09:00:00.000Z");
      expect((await db.paiementLigne.findFirstOrThrow({ where: { montant: 15_000 } })).libelle).toBe("Frais de stage");
    });
  });

  it("deux paiements en file du même étudiant : le second ticket part des restes diminués par le premier", async () => {
    const s = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF);
    const bloc = await reserver(m.user.id, POSTE_A);
    const copie = await copieGuichet(MAINTENANT);
    const saisie = (etu: EtudiantCopie, montant: number, i: number) =>
      recuHorsLigne({ etudiant: etu, montant, mode: "ESPECES", operateur: null, reference: null, numeroRecu: numero(bloc.libres[i]), instant: new Date(SAISI_LE), caissier: m.user.name });
    const premier = saisie(copie.etudiants[0], 100_000, 0);
    const vue = appliquerFile(copie, [{ etudiantId: s.etudiant.id, montant: 100_000, instantSaisie: SAISI_LE }]);
    const second = saisie(vue.etudiants[0], 100_000, 1);
    if (!premier.ok || !second.ok) throw new Error("tickets locaux refusés");

    const r1 = await synchroniserPaiement(elementHorsLigne({ etudiantId: s.etudiant.id, saisiParId: m.user.id, numeroRecu: numero(bloc.libres[0]), montant: 100_000, resteDuAffiche: premier.resteDuAvant }));
    const r2 = await synchroniserPaiement(elementHorsLigne({ etudiantId: s.etudiant.id, saisiParId: m.user.id, numeroRecu: numero(bloc.libres[1]), montant: 100_000, resteDuAffiche: second.resteDuAvant }));

    expect([r1, r2].map((r) => r.statut === "enregistre" && r.aVerifier)).toEqual([false, false]);
    expect(second.recu.lignes).toEqual([
      { libelle: "Octobre 2026", montant: 80_000, acompte: false, resteEcheance: 0 },
      { libelle: "Novembre 2026", montant: 20_000, acompte: true, resteEcheance: 60_000 },
    ]);
    if (r2.statut !== "enregistre") throw new Error("second paiement non enregistré");
    expect(await lireRecu(r2.paiementId)).toEqual({ ...second.recu, paiementId: r2.paiementId });
  });
});
