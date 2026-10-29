import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fabriquerAnnee, fabriquerEtudiant, fabriquerFiliere, fabriquerFrais, fabriquerInscription, fabriquerPaiement } from "../factories";
import { connecter, fabriquerEtudiantInscrit, fabriquerMonde, MAINTENANT, reussi, type Monde } from "../factories/scenarios";

const { getSession, revalidatePath } = vi.hoisted(() => ({ getSession: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { db } = await import("@/lib/db");
const actions = await import("@/server/actions/frais");

const REFUS_ADMIN = { statut: "erreur", message: "Cette action est réservée à l'administrateur." };
const TARIF = { niveau: 1, droitsInscription: 100_000, montantMensuel: 80_000, nombreMois: 10 };
const normaliser = (t: string) => t.replace(/\s/g, " ");

let m: Monde;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(MAINTENANT) });
  revalidatePath.mockClear();
  getSession.mockReset();
  m = await fabriquerMonde();
  connecter(getSession, m.admin);
});

afterEach(() => vi.useRealTimers());

const classeIF1 = () => [{ filiereId: m.ifs.id, niveau: 1 }];
const inscrit = (donnees = {}) => fabriquerEtudiantInscrit(m.ifs.id, m.annee, TARIF, donnees);

const entree = (surcharge: Record<string, unknown> = {}) => ({
  anneeScolaireId: m.annee.id,
  libelle: "Frais d'examen",
  montant: 15_000,
  mois: "2027-03",
  classes: classeIF1(),
  ...surcharge,
});

const creer = (surcharge: Record<string, unknown> = {}) => actions.creerFrais(entree(surcharge));

const echeancesFrais = (fraisId: string) => db.echeance.findMany({ where: { fraisId }, include: { inscription: true } });

async function photo() {
  return {
    frais: await db.frais.findMany({ orderBy: { id: "asc" }, include: { classes: true } }),
    echeances: await db.echeance.findMany({ orderBy: { id: "asc" } }),
  };
}

describe("accès : administrateur seulement", () => {
  it("le rôle user est refusé sur les quatre actions, même avec une entrée invalide, sans rien modifier", async () => {
    const e = await inscrit();
    const { frais } = await fabriquerFrais(m.annee.id, { classes: classeIF1(), inscriptionIds: [e.inscription.id] });
    const avant = await photo();
    connecter(getSession, m.user);

    expect(await actions.apercuFrais(entree())).toEqual(REFUS_ADMIN);
    expect(await actions.creerFrais(entree({ libelle: "Stage" }))).toEqual(REFUS_ADMIN);
    expect(await actions.modifierFrais({ id: frais.id, libelle: "Autre", montant: 1_000, mois: "2027-04" })).toEqual(REFUS_ADMIN);
    expect(await actions.supprimerFrais({ id: frais.id })).toEqual(REFUS_ADMIN);
    expect(await actions.apercuFrais({} as never)).toEqual(REFUS_ADMIN);
    expect(await actions.creerFrais({} as never)).toEqual(REFUS_ADMIN);
    expect(await actions.modifierFrais({} as never)).toEqual(REFUS_ADMIN);
    expect(await actions.supprimerFrais({} as never)).toEqual(REFUS_ADMIN);

    expect(await photo()).toEqual(avant);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sans session : redirigé vers la connexion, sur les quatre actions", async () => {
    getSession.mockResolvedValue(null);
    await expect(actions.apercuFrais(entree())).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(actions.creerFrais(entree())).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(actions.modifierFrais({ id: "x", libelle: "Stage", montant: 1_000, mois: "2027-04" })).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(actions.supprimerFrais({ id: "x" })).rejects.toThrow(/NEXT_REDIRECT/);
    expect(await db.frais.count()).toBe(0);
  });
});

describe("apercuFrais", () => {
  it("renvoie le nombre d'étudiants concernés et la phrase de récapitulatif, sans rien écrire", async () => {
    await inscrit();
    await inscrit();
    await inscrit({ statut: "ABANDON" });

    const r = reussi(await actions.apercuFrais(entree()));

    expect(r.nombre).toBe(2);
    expect(normaliser(r.phrase)).toBe("2 étudiants recevront 15 000 Ar, exigibles en mars 2027.");
    expect(await db.frais.count()).toBe(0);
    expect(await db.echeance.count({ where: { type: "FRAIS" } })).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("singulier pour un seul étudiant ; classe vide : annonce que les inscrits plus tard le recevront", async () => {
    await inscrit();
    expect(normaliser(reussi(await actions.apercuFrais(entree())).phrase)).toMatch(/^1 étudiant recevra 15 000 Ar, exigibles en mars 2027\.$/);

    const vide = reussi(await actions.apercuFrais(entree({ classes: [{ filiereId: m.sf.id, niveau: 1 }] })));
    expect(vide.nombre).toBe(0);
    expect(vide.phrase).toMatch(/^Aucun étudiant .*ceux inscrits plus tard recevront/);
  });

  it("compte les redoublants et plusieurs classes, jamais les abandons, exclus ni diplômés", async () => {
    await inscrit();
    const redoublant = await inscrit();
    await db.inscription.update({ where: { id: redoublant.inscription.id }, data: { redoublement: true } });
    await inscrit({ statut: "ABANDON" });
    await inscrit({ statut: "EXCLU" });
    await inscrit({ statut: "DIPLOME" });
    await fabriquerEtudiantInscrit(m.sf.id, m.annee, TARIF);

    expect(reussi(await actions.apercuFrais(entree())).nombre).toBe(2);
    expect(reussi(await actions.apercuFrais(entree({ classes: [...classeIF1(), { filiereId: m.sf.id, niveau: 1 }] }))).nombre).toBe(3);
  });

  it("refuse une année clôturée, un mois passé, août ou un mois hors de l'année, comme la création", async () => {
    expect(await actions.apercuFrais(entree({ mois: "2026-10" }))).toMatchObject({ statut: "erreur", erreurs: { mois: expect.stringMatching(/déjà passé/) } });
    expect(await actions.apercuFrais(entree({ mois: "2027-08" }))).toMatchObject({ statut: "erreur", erreurs: { mois: expect.stringMatching(/de octobre à juillet/) } });
    await db.anneeScolaire.update({ where: { id: m.annee.id }, data: { cloturee: true } });
    expect(await actions.apercuFrais(entree())).toMatchObject({ statut: "erreur", message: expect.stringMatching(/clôturée/) });
  });
});

describe("creerFrais", () => {
  it("crée le frais et une échéance FRAIS par inscription de la classe : redoublants compris, sortis et diplômés exclus", async () => {
    const a = await inscrit();
    const redoublant = await inscrit();
    await db.inscription.update({ where: { id: redoublant.inscription.id }, data: { redoublement: true } });
    const abandon = await inscrit({ statut: "ABANDON" });
    const exclu = await inscrit({ statut: "EXCLU" });
    const diplome = await inscrit({ statut: "DIPLOME" });
    const autreClasse = await fabriquerEtudiantInscrit(m.ifs.id, m.annee, { ...TARIF, niveau: 2 });
    const autreFiliere = await fabriquerEtudiantInscrit(m.sf.id, m.annee, TARIF);

    const r = await creer();

    const { id, nombre } = reussi(r);
    expect(nombre).toBe(2);
    expect(r).toMatchObject({ message: expect.stringMatching(/Frais « Frais d'examen » créé\./) });
    const frais = await db.frais.findUniqueOrThrow({ where: { id }, include: { classes: true } });
    expect(frais).toMatchObject({ libelle: "Frais d'examen", montant: 15_000, anneeScolaireId: m.annee.id, creeParId: m.admin.id });
    expect(frais.mois.toISOString().slice(0, 10)).toBe("2027-03-01");
    expect(frais.classes).toMatchObject([{ filiereId: m.ifs.id, niveau: 1 }]);

    const echeances = await echeancesFrais(id);
    expect(echeances.map((e) => e.inscription.etudiantId).sort()).toEqual([a.etudiant.id, redoublant.etudiant.id].sort());
    expect(echeances.every((e) => e.type === "FRAIS" && e.montantDu === 15_000 && !e.nonDueSortie && e.mois.getTime() === frais.mois.getTime())).toBe(true);
    for (const exclus of [abandon, exclu, diplome, autreClasse, autreFiliere]) {
      expect(await db.echeance.count({ where: { fraisId: id, inscription: { etudiantId: exclus.etudiant.id } } })).toBe(0);
    }
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("plusieurs classes d'un coup ; deux frais successifs se cumulent sur la même inscription", async () => {
    const a = await inscrit();
    const sf = await fabriquerEtudiantInscrit(m.sf.id, m.annee, TARIF);

    const premier = reussi(await creer({ classes: [...classeIF1(), { filiereId: m.sf.id, niveau: 1 }] }));
    const second = reussi(await creer({ libelle: "Stage", montant: 5_000, mois: "2027-05" }));

    expect(premier.nombre).toBe(2);
    expect(second.nombre).toBe(1);
    expect(await db.echeance.count({ where: { type: "FRAIS", inscription: { etudiantId: a.etudiant.id } } })).toBe(2);
    expect(await db.echeance.count({ where: { type: "FRAIS", inscription: { etudiantId: sf.etudiant.id } } })).toBe(1);
  });

  it("n'atteint que l'année visée : une inscription d'une autre année n'est pas touchée", async () => {
    const a2025 = await fabriquerAnnee({ anneeDebut: 2025, cloturee: true });
    const ancien = await fabriquerEtudiant(m.ifs.id, a2025.id);
    await fabriquerInscription(ancien.id, a2025.id, TARIF, a2025.dateDebut);
    const courant = await inscrit();

    const { id } = reussi(await creer());

    expect((await echeancesFrais(id)).map((e) => e.inscription.etudiantId)).toEqual([courant.etudiant.id]);
  });

  it("classe vide : le frais est créé sans échéance, il s'appliquera aux inscrits plus tard", async () => {
    const r = await creer();
    expect(reussi(r).nombre).toBe(0);
    expect(await db.frais.count()).toBe(1);
    expect(await db.echeance.count({ where: { type: "FRAIS" } })).toBe(0);
  });

  it("refuse une année clôturée, sans rien écrire", async () => {
    await inscrit();
    await db.anneeScolaire.update({ where: { id: m.annee.id }, data: { cloturee: true } });
    const avant = await photo();

    expect(await creer()).toMatchObject({ statut: "erreur", message: expect.stringMatching(/clôturée/) });

    expect(await photo()).toEqual(avant);
  });

  it.each([
    ["mois passé", "2026-10", /déjà passé/],
    ["août", "2027-08", /de octobre à juillet/],
    ["mois avant l'année", "2026-09", /de octobre à juillet/],
    ["mois après l'année", "2028-03", /de octobre à juillet/],
  ])("refuse %s sur le champ mois, sans rien écrire", async (_nom, mois, message) => {
    await inscrit();
    const avant = await photo();

    expect(await creer({ mois })).toMatchObject({ statut: "erreur", erreurs: { mois: expect.stringMatching(message) } });

    expect(await photo()).toEqual(avant);
  });

  it("accepte le mois en cours et le dernier mois de l'année", async () => {
    reussi(await creer({ mois: "2026-11" }));
    reussi(await creer({ mois: "2027-07", libelle: "Dernier" }));
  });

  it("le mois en cours devient « passé » au mois suivant : refusé le 1er décembre", async () => {
    vi.setSystemTime(new Date("2026-12-01T05:00:00Z"));
    expect(await creer({ mois: "2026-11" })).toMatchObject({ erreurs: { mois: expect.stringMatching(/déjà passé/) } });
    reussi(await creer({ mois: "2026-12" }));
  });

  it("entrée invalide : libellé, montant, classes, filière inconnue ou niveau au-delà de la durée", async () => {
    expect(await creer({ libelle: " " })).toMatchObject({ erreurs: { libelle: expect.any(String) } });
    expect(await creer({ montant: 0 })).toMatchObject({ erreurs: { montant: expect.any(String) } });
    expect(await creer({ montant: 1_000.5 })).toMatchObject({ erreurs: { montant: expect.any(String) } });
    expect(await creer({ classes: [] })).toMatchObject({ erreurs: { classes: expect.any(String) } });
    expect(await creer({ classes: [{ filiereId: "inconnue", niveau: 1 }] })).toMatchObject({ statut: "erreur", message: expect.stringMatching(/n'existe plus/) });
    expect(await creer({ classes: [{ filiereId: m.ifs.id, niveau: 4 }] })).toMatchObject({ statut: "erreur", message: expect.stringMatching(/dure 3 ans/) });
    expect(await creer({ anneeScolaireId: "inconnue" })).toMatchObject({ statut: "erreur", code: "INTROUVABLE" });
    expect(await db.frais.count()).toBe(0);
  });

  it("deux frais du même mois gardent leur ordre de création (rang croissant)", async () => {
    const a = reussi(await creer({ libelle: "Premier" }));
    const b = reussi(await creer({ libelle: "Second" }));
    const [fa, fb] = await Promise.all([db.frais.findUniqueOrThrow({ where: { id: a.id } }), db.frais.findUniqueOrThrow({ where: { id: b.id } })]);
    expect(fa.rang).toBeLessThan(fb.rang);
  });

  it("filière désactivée ignorée de l'effectif : seule la classe visée compte", async () => {
    const ancienne = await fabriquerFiliere({ code: "ZZ", dureeAnnees: 3 });
    await fabriquerEtudiantInscrit(ancienne.id, m.annee, TARIF);
    await inscrit();

    expect(reussi(await creer()).nombre).toBe(1);
  });
});

describe("modifierFrais : frais pas encore payé", () => {
  async function fraisCree() {
    const e = await inscrit();
    const { id } = reussi(await creer());
    return { e, id };
  }

  it("libellé, montant et mois sont recopiés sur les échéances des étudiants concernés", async () => {
    const { id } = await fraisCree();

    const r = await actions.modifierFrais({ id, libelle: "Frais de stage", montant: 20_000, mois: "2027-05" });

    expect(r).toMatchObject({ statut: "succes", message: expect.stringMatching(/Frais « Frais de stage » modifié/) });
    expect(await db.frais.findUniqueOrThrow({ where: { id } })).toMatchObject({ libelle: "Frais de stage", montant: 20_000 });
    const [e] = await echeancesFrais(id);
    expect(e).toMatchObject({ montantDu: 20_000 });
    expect(e.mois.toISOString().slice(0, 10)).toBe("2027-05-01");
  });

  it("les classes d'un frais ne se modifient pas", async () => {
    const { id } = await fraisCree();
    await actions.modifierFrais({ id, libelle: "Frais", montant: 15_000, mois: "2027-03", classes: [{ filiereId: m.sf.id, niveau: 1 }] } as never);
    expect((await db.fraisClasse.findMany({ where: { fraisId: id } })).map((c) => c.filiereId)).toEqual([m.ifs.id]);
  });

  it("refuse un mois passé, août, hors de l'année, un montant invalide ; rien n'est écrit", async () => {
    const { id } = await fraisCree();
    const avant = await photo();

    expect(await actions.modifierFrais({ id, libelle: "Frais", montant: 15_000, mois: "2026-10" })).toMatchObject({ erreurs: { mois: expect.stringMatching(/déjà passé/) } });
    expect(await actions.modifierFrais({ id, libelle: "Frais", montant: 15_000, mois: "2027-08" })).toMatchObject({ erreurs: { mois: expect.any(String) } });
    expect(await actions.modifierFrais({ id, libelle: "Frais", montant: 0, mois: "2027-03" })).toMatchObject({ erreurs: { montant: expect.any(String) } });
    expect(await actions.modifierFrais({ id, libelle: "", montant: 15_000, mois: "2027-03" })).toMatchObject({ erreurs: { libelle: expect.any(String) } });

    expect(await photo()).toEqual(avant);
  });

  it("garder un mois déjà passé est accepté (libellé, puis montant tant que rien n'est payé), en passer à un autre mois passé est refusé", async () => {
    const e = await inscrit();
    const { id } = reussi(await creer({ mois: "2026-11" }));
    vi.setSystemTime(new Date("2026-12-15T09:00:00Z"));

    expect(await actions.modifierFrais({ id, libelle: "Examen final", montant: 15_000, mois: "2026-11" })).toMatchObject({ statut: "succes" });
    expect(await actions.modifierFrais({ id, libelle: "Examen final", montant: 18_000, mois: "2026-11" })).toMatchObject({ statut: "succes" });
    expect((await echeancesFrais(id))[0].montantDu).toBe(18_000);

    const refus = await actions.modifierFrais({ id, libelle: "Examen final", montant: 18_000, mois: "2026-10" });
    expect(refus).toMatchObject({ statut: "erreur", erreurs: { mois: expect.stringMatching(/déjà passé/) } });
    expect((await db.frais.findUniqueOrThrow({ where: { id } })).mois.toISOString().slice(0, 10)).toBe("2026-11-01");

    expect(await actions.modifierFrais({ id, libelle: "Examen final", montant: 18_000, mois: "2027-02" })).toMatchObject({ statut: "succes" });
    expect((await echeancesFrais(id))[0].mois.toISOString().slice(0, 10)).toBe("2027-02-01");
    expect(e.inscription.id).toBe((await echeancesFrais(id))[0].inscriptionId);
  });

  it("un changement de mois recalcule « non dû » des étudiants sortis : exigible après la sortie, plus dû ; jusqu'au mois de sortie, dû", async () => {
    const sorti = await inscrit({ statut: "ABANDON", dateSortie: new Date(Date.UTC(2026, 10, 15)) });
    const actif = await inscrit();
    const { frais } = await fabriquerFrais(m.annee.id, {
      classes: classeIF1(), mois: new Date(Date.UTC(2026, 10, 1)), inscriptionIds: [sorti.inscription.id, actif.inscription.id],
    });
    const etat = async () =>
      Object.fromEntries((await echeancesFrais(frais.id)).map((e) => [e.inscription.etudiantId === sorti.etudiant.id ? "sorti" : "actif", e.nonDueSortie]));
    expect(await etat()).toEqual({ sorti: false, actif: false });

    reussi(await actions.modifierFrais({ id: frais.id, libelle: "Frais", montant: 15_000, mois: "2027-05" }));
    expect(await etat()).toEqual({ sorti: true, actif: false });

    reussi(await actions.modifierFrais({ id: frais.id, libelle: "Frais", montant: 15_000, mois: "2026-11" }));
    expect(await etat()).toEqual({ sorti: false, actif: false });
  });

  it("frais inconnu : INTROUVABLE ; année clôturée : refusé", async () => {
    const { id } = await fraisCree();
    expect(await actions.modifierFrais({ id: "inconnu", libelle: "Frais", montant: 1_000, mois: "2027-03" })).toMatchObject({ code: "INTROUVABLE" });

    await db.anneeScolaire.update({ where: { id: m.annee.id }, data: { cloturee: true } });
    expect(await actions.modifierFrais({ id, libelle: "Autre", montant: 15_000, mois: "2027-03" })).toMatchObject({ message: expect.stringMatching(/clôturée/) });
    expect((await db.frais.findUniqueOrThrow({ where: { id } })).libelle).toBe("Frais d'examen");
  });
});

describe("modifierFrais et supprimerFrais : frais déjà payé", () => {
  const MESSAGE_MODIF = /déjà été payé, même en partie ou par un paiement annulé : seul son libellé peut encore changer/;
  const MESSAGE_SUPPR = /déjà été payé, même en partie ou par un paiement annulé : il ne peut plus être supprimé/;

  async function fraisPaye(annule: boolean) {
    const e = await inscrit();
    const { id } = reussi(await creer());
    const [echeance] = await echeancesFrais(id);
    await fabriquerPaiement(
      e.etudiant.id,
      m.user.id,
      [{ echeanceId: echeance.id, montant: 5_000, resteEcheanceApres: 10_000, libelle: "Frais d'examen" }],
      annule ? { annule: true, annuleParId: m.admin.id, dateAnnulation: new Date(), motifAnnulation: "erreur de saisie" } : {},
    );
    return { id, echeance };
  }

  it.each([
    ["un paiement actif", false],
    ["un paiement annulé", true],
  ])("après %s : montant et mois refusés, libellé accepté, suppression refusée", async (_nom, annule) => {
    const { id, echeance } = await fraisPaye(annule);

    expect(await actions.modifierFrais({ id, libelle: "Frais d'examen", montant: 20_000, mois: "2027-03" })).toMatchObject({ statut: "erreur", message: expect.stringMatching(MESSAGE_MODIF) });
    expect(await actions.modifierFrais({ id, libelle: "Frais d'examen", montant: 15_000, mois: "2027-05" })).toMatchObject({ statut: "erreur", message: expect.stringMatching(MESSAGE_MODIF) });
    expect(await actions.supprimerFrais({ id })).toMatchObject({ statut: "erreur", message: expect.stringMatching(MESSAGE_SUPPR) });

    expect(await actions.modifierFrais({ id, libelle: "Examen final", montant: 15_000, mois: "2027-03" })).toMatchObject({ statut: "succes", message: expect.stringMatching(/renommé/) });
    const frais = await db.frais.findUniqueOrThrow({ where: { id } });
    expect(frais).toMatchObject({ libelle: "Examen final", montant: 15_000 });
    expect(frais.mois.toISOString().slice(0, 10)).toBe("2027-03-01");
    expect(await db.echeance.findUniqueOrThrow({ where: { id: echeance.id } })).toMatchObject({ montantDu: 15_000 });
    expect(await db.paiementLigne.count({ where: { echeanceId: echeance.id } })).toBe(1);
  });

  it("le libellé figé sur la ligne de paiement ne change pas quand le frais est renommé", async () => {
    const { id, echeance } = await fraisPaye(false);

    reussi(await actions.modifierFrais({ id, libelle: "Examen final", montant: 15_000, mois: "2027-03" }));

    expect((await db.paiementLigne.findFirstOrThrow({ where: { echeanceId: echeance.id } })).libelle).toBe("Frais d'examen");
  });

  it("le même montant et le même mois, avec un libellé inchangé, ne sont pas une modification de montant", async () => {
    const { id } = await fraisPaye(false);
    expect(await actions.modifierFrais({ id, libelle: "Frais d'examen", montant: 15_000, mois: "2027-03" })).toMatchObject({ statut: "succes" });
  });
});

describe("supprimerFrais", () => {
  it("supprime le frais, ses classes et ses échéances tant qu'aucun paiement ne l'a touché ; le reste dû des étudiants retombe", async () => {
    const e = await inscrit();
    const { id } = reussi(await creer());
    expect(await db.echeance.count({ where: { fraisId: id } })).toBe(1);

    const r = await actions.supprimerFrais({ id });

    expect(r).toMatchObject({ statut: "succes", message: expect.stringMatching(/Frais « Frais d'examen » supprimé/) });
    expect(await db.frais.count()).toBe(0);
    expect(await db.fraisClasse.count()).toBe(0);
    expect(await db.echeance.count({ where: { type: "FRAIS" } })).toBe(0);
    expect(await db.echeance.count({ where: { inscription: { etudiantId: e.etudiant.id } } })).toBe(11);
  });

  it("un étudiant inscrit ensuite ne reçoit plus le frais supprimé", async () => {
    const { id } = reussi(await creer());
    reussi(await actions.supprimerFrais({ id }));

    const { creerEtudiant } = await import("@/server/actions/etudiants");
    const { saisieEtudiant } = await import("../factories/scenarios");
    const cree = reussi(await creerEtudiant(saisieEtudiant(m.ifs.id)));

    expect(await db.echeance.count({ where: { type: "FRAIS", inscription: { etudiantId: cree.id } } })).toBe(0);
  });

  it("frais inconnu : INTROUVABLE ; année clôturée : refusé", async () => {
    const { id } = reussi(await creer());
    expect(await actions.supprimerFrais({ id: "inconnu" })).toMatchObject({ code: "INTROUVABLE" });

    await db.anneeScolaire.update({ where: { id: m.annee.id }, data: { cloturee: true } });
    expect(await actions.supprimerFrais({ id })).toMatchObject({ message: expect.stringMatching(/clôturée/) });
    expect(await db.frais.count()).toBe(1);
  });

  it("suppression et paiement simultanés : jamais de ligne de paiement sans échéance", async () => {
    const e = await inscrit();
    const { id } = reussi(await creer());
    const [echeance] = await echeancesFrais(id);

    await Promise.all([
      actions.supprimerFrais({ id }),
      fabriquerPaiement(e.etudiant.id, m.user.id, [{ echeanceId: echeance.id, montant: 5_000, resteEcheanceApres: 10_000 }]).catch(() => null),
    ]);

    const lignes = await db.paiementLigne.findMany({ where: { echeanceId: echeance.id } });
    const encore = await db.echeance.count({ where: { id: echeance.id } });
    expect(lignes.length === 0 || encore === 1).toBe(true);
  });
});
