import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { ModePaiement, OperateurMobile, type StatutEtudiant, type TypeEcheance } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  ajouterJours,
  dateHeureMadagascar,
  debutJourMadagascar,
  formaterJour,
  jourDeDate,
  jourMadagascar,
  lireJour,
  premierDuMoisSuivant,
  type Jour,
} from "@/lib/dates";
import {
  dateLimiteRetard,
  LIBELLE_STATUT_ECHEANCE,
  preselection,
  resteDuTotal,
  situation,
  suivreEcheance,
  type StatutEcheance,
  type TotauxEcolage,
} from "@/lib/ecolage";
import { construireRecu, type DonneesRecu } from "@/lib/encaissement";
import { ARRETES, ETABLISSEMENT, getCoordonnees } from "@/lib/etablissement";
import { formaterTelephone, LIBELLE_STATUT_ETUDIANT, libelleNiveauInscription, motsRecherche } from "@/lib/etudiants";
import { DUREE_MAX, libelleAnnee, NOMS_MOIS } from "@/lib/parametres";
import {
  echeancesEtudiant,
  restesDe,
  restesParEtudiant,
  sqlDerniereInscription,
  sqlMotsRecherche,
  sqlRestes,
} from "@/server/ecolage";
import { lireDossierEtudiant, paiementAffiche, SELECT_PAIEMENT_AFFICHE, type DossierEtudiant, type PaiementFiche } from "@/server/lectures/etudiants";
import {
  aplatir,
  entierOpt,
  idOpt,
  jourOpt,
  pageOpt,
  pagination,
  texteOpt,
  type Pagination,
  type ParamsRecherche,
} from "@/server/lectures/filtres";

// Lectures sans contrôle de rôle : pages sous /app (layout protégé) ; les appels depuis le client
// passent par les actions de `src/server/actions/paiements.ts`, qui vérifient la session.

export type ResultatGuichet = {
  id: string;
  matricule: string;
  nom: string;
  prenoms: string;
  filiereCode: string;
  /** « 2e année (redoublant) », null sans inscription */
  niveau: string | null;
  statut: StatutEtudiant;
  libelleStatut: string;
  /** Sorti (diplômé, abandon, exclu) : encaissable seulement pour solder ce qu'il doit encore. */
  sorti: boolean;
  resteEnRetard: number;
  resteDu: number;
};

const SELECT_GUICHET = {
  id: true,
  matricule: true,
  nom: true,
  prenoms: true,
  statut: true,
  filiere: { select: { code: true } },
  inscriptions: {
    orderBy: { anneeScolaire: { anneeDebut: "desc" } },
    take: 1,
    select: { niveau: true, redoublement: true },
  },
} as const satisfies Prisma.EtudiantSelect;

type EtudiantGuichet = Prisma.EtudiantGetPayload<{ select: typeof SELECT_GUICHET }>;

function resultatGuichet(e: EtudiantGuichet, restes: Map<string, ReturnType<typeof restesDe>>): ResultatGuichet {
  const r = restesDe(restes, e.id);
  const ins = e.inscriptions[0];
  return {
    id: e.id,
    matricule: e.matricule,
    nom: e.nom,
    prenoms: e.prenoms,
    filiereCode: e.filiere.code,
    niveau: ins ? libelleNiveauInscription(ins.niveau, ins.redoublement) : null,
    statut: e.statut,
    libelleStatut: LIBELLE_STATUT_ETUDIANT[e.statut],
    sorti: e.statut !== "ACTIF",
    resteEnRetard: r.resteEnRetard,
    resteDu: r.resteDu,
  };
}

/** Encaissables : les actifs, et les sortis qui doivent encore quelque chose. */
function encaissable(e: { statut: StatutEtudiant }, resteDu: number): boolean {
  return e.statut === "ACTIF" || resteDu > 0;
}

/** Recherche du guichet (nom, prénoms, matricule, sans accents), 10 résultats, actifs d'abord. */
export async function rechercherAuGuichet(
  q: string,
  jour: Jour = jourMadagascar(new Date()),
): Promise<ResultatGuichet[]> {
  const mots = motsRecherche(q);
  if (mots.length === 0) return [];
  const candidats = await db.$queryRaw<{ id: string }[]>`
    SELECT e.id FROM etudiant e
    WHERE ${Prisma.join(sqlMotsRecherche(mots), " AND ")}
    ORDER BY (e.statut = 'ACTIF') DESC, e.nom, e.prenoms
    LIMIT 50`;
  const ids = candidats.map((c) => c.id);
  const [etudiants, restes] = await Promise.all([
    db.etudiant.findMany({ where: { id: { in: ids } }, select: SELECT_GUICHET }),
    restesParEtudiant(ids, dateLimiteRetard(jour)),
  ]);
  const parId = new Map(etudiants.map((e) => [e.id, e]));
  return ids
    .map((id) => parId.get(id))
    .filter((e): e is EtudiantGuichet => !!e && encaissable(e, restesDe(restes, e.id).resteDu))
    .slice(0, 10)
    .map((e) => resultatGuichet(e, restes));
}

/** Derniers étudiants distincts encaissés par ce caissier (paiements non annulés), du plus récent au plus ancien. */
export async function derniersServis(
  userId: string,
  n = 5,
  jour: Jour = jourMadagascar(new Date()),
): Promise<(ResultatGuichet & { dernierPassageISO: string })[]> {
  const derniers = await db.$queryRaw<{ etudiantId: string; dernier: Date }[]>`
    SELECT p."etudiantId", MAX(p.date) AS dernier FROM paiement p
    WHERE p."saisiParId" = ${userId} AND NOT p.annule
    GROUP BY p."etudiantId" ORDER BY dernier DESC LIMIT ${Math.min(Math.max(1, Math.trunc(n)), 20)}`;
  const ids = derniers.map((d) => d.etudiantId);
  const [etudiants, restes] = await Promise.all([
    db.etudiant.findMany({ where: { id: { in: ids } }, select: SELECT_GUICHET }),
    restesParEtudiant(ids, dateLimiteRetard(jour)),
  ]);
  const parId = new Map(etudiants.map((e) => [e.id, e]));
  return derniers.flatMap((d) => {
    const e = parId.get(d.etudiantId);
    if (!e || !encaissable(e, restesDe(restes, e.id).resteDu)) return [];
    return [{ ...resultatGuichet(e, restes), dernierPassageISO: d.dernier.toISOString() }];
  });
}

export type EcheanceGuichet = {
  id: string;
  libelle: string;
  type: TypeEcheance;
  /** « 2026-10-01 » */
  mois: Jour;
  montantDu: number;
  paye: number;
  reste: number;
  echue: boolean;
  statut: StatutEcheance;
  libelleStatut: string;
};

export type SituationGuichet = {
  etudiant: ResultatGuichet & { filiereNom: string; telephone: string | null; anneeScolaire: string | null };
  jour: Jour;
  /** Message à afficher à la place du formulaire (rien à encaisser), sinon null. */
  refus: string | null;
  /** Par année scolaire, de la plus ancienne à la plus récente ; seulement les échéances non soldées. */
  annees: { anneeDebut: number; libelle: string; niveau: string | null; reste: number; resteEnRetard: number; echeances: EcheanceGuichet[] }[];
  /** Mêmes échéances, à plat, dans l'ordre de solde : base de `montantPourCases` et `repartirPaiement`. */
  echeances: EcheanceGuichet[];
  /** Cases cochées par défaut : les échéances en retard. */
  preselection: string[];
  /** À renvoyer tel quel dans `encaisser({ resteDuAffiche })`. */
  resteDuTotal: number;
  resteEnRetard: number;
  /** Année de l'inscription la plus récente, échéances soldées comprises ; null sans inscription. */
  anneeEnCours: { anneeDebut: number; libelle: string; du: number; paye: number; reste: number } | null;
};

/** Ce que le guichet affiche pour un étudiant : échéances non soldées toutes années, cases présélectionnées. */
export async function situationGuichet(
  etudiantId: string,
  jour: Jour = jourMadagascar(new Date()),
): Promise<SituationGuichet | null> {
  const e = await db.etudiant.findUnique({
    where: { id: etudiantId },
    select: {
      ...SELECT_GUICHET,
      telephone: true,
      filiere: { select: { code: true, nom: true } },
      inscriptions: {
        orderBy: { anneeScolaire: { anneeDebut: "desc" } },
        select: { niveau: true, redoublement: true, anneeScolaire: { select: { anneeDebut: true, libelle: true } } },
      },
    },
  });
  if (!e) return null;

  const toutes = await echeancesEtudiant(db, etudiantId);
  const nonSoldees = toutes.map((x) => ({ ...x, ...suivreEcheance(x, jour) })).filter((x) => x.reste > 0);
  const derniere = e.inscriptions[0]?.anneeScolaire;
  const totauxDerniere = derniere
    ? situation(toutes, jour).parAnnee.find((a) => a.anneeDebut === derniere.anneeDebut)
    : undefined;
  const echeances: EcheanceGuichet[] = nonSoldees.map((x) => ({
    id: x.id,
    libelle: x.libelle,
    type: x.type,
    mois: jourDeDate(x.mois),
    montantDu: x.montantDu,
    paye: x.paye,
    reste: x.reste,
    echue: x.echue,
    statut: x.statut,
    libelleStatut: LIBELLE_STATUT_ECHEANCE[x.statut],
  }));
  const total = resteDuTotal(nonSoldees);
  const retard = nonSoldees.filter((x) => x.echue).reduce((s, x) => s + x.reste, 0);
  const restes = new Map([[e.id, { resteDu: total, resteEnRetard: retard, moisEnRetard: 0, anneesEnRetard: [] }]]);

  const annees = [...new Set(nonSoldees.map((x) => x.anneeDebut))].map((anneeDebut) => {
    const ins = e.inscriptions.find((i) => i.anneeScolaire.anneeDebut === anneeDebut);
    const ech = nonSoldees.filter((x) => x.anneeDebut === anneeDebut);
    return {
      anneeDebut,
      libelle: ins?.anneeScolaire.libelle ?? libelleAnnee(anneeDebut),
      niveau: ins ? libelleNiveauInscription(ins.niveau, ins.redoublement) : null,
      reste: resteDuTotal(ech),
      resteEnRetard: ech.filter((x) => x.echue).reduce((s, x) => s + x.reste, 0),
      echeances: echeances.filter((x) => ech.some((y) => y.id === x.id)),
    };
  });

  return {
    etudiant: {
      ...resultatGuichet(e, restes),
      filiereNom: e.filiere.nom,
      telephone: e.telephone ? formaterTelephone(e.telephone) : null,
      anneeScolaire: e.inscriptions[0]?.anneeScolaire.libelle ?? null,
    },
    jour,
    refus: total === 0 ? "Rien à encaisser : toutes les échéances de cet étudiant sont soldées." : null,
    annees,
    echeances,
    preselection: preselection(nonSoldees, jour),
    resteDuTotal: total,
    resteEnRetard: retard,
    anneeEnCours: derniere
      ? {
          anneeDebut: derniere.anneeDebut,
          libelle: derniere.libelle,
          du: totauxDerniere?.du ?? 0,
          paye: totauxDerniere?.paye ?? 0,
          reste: totauxDerniere?.reste ?? 0,
        }
      : null,
  };
}

/**
 * Reçu reconstruit uniquement depuis les valeurs figées à l'émission (lignes, restes) :
 * la réimpression est identique à l'original, annulation exceptée.
 * Jamais dans une transaction : Prisma y lance ses relations en parallèle sur une seule connexion.
 */
export async function lireRecu(paiementId: string): Promise<DonneesRecu | null> {
  const p = await db.paiement.findUnique({
    where: { id: paiementId },
    select: {
      id: true,
      numeroRecu: true,
      date: true,
      montant: true,
      mode: true,
      operateur: true,
      reference: true,
      resteApres: true,
      retardApres: true,
      annule: true,
      dateAnnulation: true,
      motifAnnulation: true,
      saisiPar: { select: { name: true } },
      annulePar: { select: { name: true } },
      etudiant: { select: { matricule: true, nom: true, prenoms: true, filiere: { select: { nom: true } } } },
      lignes: {
        select: {
          montant: true,
          resteEcheanceApres: true,
          echeance: {
            select: {
              type: true,
              tranche: true,
              mois: true,
              ordre: true,
              inscription: {
                select: {
                  niveau: true,
                  redoublement: true,
                  droitsEnTranches: true,
                  anneeScolaire: { select: { anneeDebut: true, libelle: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!p) return null;

  // Niveau et année du reçu : ceux de l'année la plus récente payée, liens qui ne changent plus.
  const plusRecente = p.lignes
    .map((l) => l.echeance.inscription)
    .reduce<(typeof p.lignes)[number]["echeance"]["inscription"] | null>(
      (m, i) => (!m || i.anneeScolaire.anneeDebut > m.anneeScolaire.anneeDebut ? i : m),
      null,
    );

  return construireRecu({
    paiementId: p.id,
    numero: p.numeroRecu,
    instant: p.date,
    etudiant: { matricule: p.etudiant.matricule, nom: p.etudiant.nom, prenoms: p.etudiant.prenoms, filiere: p.etudiant.filiere.nom },
    inscription: plusRecente
      ? { niveau: plusRecente.niveau, redoublement: plusRecente.redoublement, anneeLibelle: plusRecente.anneeScolaire.libelle }
      : { niveau: 1, redoublement: false, anneeLibelle: "" },
    lignes: p.lignes.map((l) => ({
      montant: l.montant,
      resteEcheanceApres: l.resteEcheanceApres,
      echeance: {
        type: l.echeance.type,
        tranche: l.echeance.tranche,
        mois: l.echeance.mois,
        ordre: l.echeance.ordre,
        droitsEnTranches: l.echeance.inscription.droitsEnTranches,
        anneeDebut: l.echeance.inscription.anneeScolaire.anneeDebut,
        anneeLibelle: l.echeance.inscription.anneeScolaire.libelle,
      },
    })),
    montant: p.montant,
    mode: p.mode,
    operateur: p.operateur,
    reference: p.reference,
    resteApres: p.resteApres,
    retardApres: p.retardApres,
    caissier: p.saisiPar.name,
    annulation: p.annule
      ? { instant: p.dateAnnulation ?? p.date, par: p.annulePar?.name ?? "", motif: p.motifAnnulation ?? "" }
      : null,
  });
}

// Paiements

export const TAILLE_PAGE_PAIEMENTS = 50;

const FILTRES_MODE = ["tous", ModePaiement.ESPECES, ModePaiement.MOBILE_MONEY, ...Object.values(OperateurMobile)] as const;
const FILTRES_STATUT = ["tous", "valides", "annules", "aVerifier"] as const;

const schemaFiltresPaiements = z.object({
  /** jour : `jour` (défaut aujourd'hui) ; mois : `mois` AAAA-MM (défaut ce mois) ; annee : `anneeId` (défaut l'année courante) ; plage : `du`..`au` inclus. */
  periode: z.enum(["jour", "mois", "annee", "plage"]).catch("jour"),
  jour: jourOpt,
  mois: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().catch(undefined),
  anneeId: idOpt,
  du: jourOpt,
  au: jourOpt,
  mode: z.enum(FILTRES_MODE).catch("tous"),
  caissierId: idOpt,
  statut: z.enum(FILTRES_STATUT).catch("tous"),
  q: texteOpt,
  page: pageOpt,
});
export type FiltresPaiements = z.output<typeof schemaFiltresPaiements>;

export type LignePaiement = PaiementFiche & {
  etudiant: { id: string; matricule: string; nom: string; prenoms: string };
};

export type ListePaiements = Pagination & {
  lignes: LignePaiement[];
  filtres: FiltresPaiements;
  /** Bornes effectives, jours inclus, heure de Madagascar. */
  periode: { du: Jour; au: Jour; libelle: string };
  /** Sur toute la liste filtrée (pas seulement la page), paiements annulés exclus. */
  totaux: { montant: number; nombre: number; especes: number; mobileMoney: number; annules: number; aVerifier: number };
  caissiers: { id: string; nom: string }[];
  annees: { id: string; libelle: string; estCourante: boolean }[];
};

function nomMois(jour: Jour): string {
  const { annee, mois } = lireJour(jour);
  const nom = NOMS_MOIS[mois - 1];
  return `${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${annee}`;
}

async function bornesPeriode(f: FiltresPaiements, jour: Jour): Promise<{ du: Jour; auExclu: Jour; libelle: string }> {
  switch (f.periode) {
    case "jour": {
      const j = f.jour ?? jour;
      return { du: j, auExclu: ajouterJours(j, 1), libelle: j === jour ? `Aujourd'hui, ${formaterJour(j)}` : formaterJour(j) };
    }
    case "mois": {
      const debut = f.mois ? `${f.mois}-01` : premierDuMoisSuivant(jour, 0);
      return { du: debut, auExclu: premierDuMoisSuivant(debut), libelle: nomMois(debut) };
    }
    case "annee": {
      const a = await db.anneeScolaire.findFirst({
        where: f.anneeId ? { id: f.anneeId } : { estCourante: true },
        select: { libelle: true, dateDebut: true },
      });
      if (a) {
        // Douze mois à partir du début de l'année scolaire : les paiements de l'été restent comptés.
        const debut = jourDeDate(a.dateDebut);
        return { du: debut, auExclu: premierDuMoisSuivant(debut, 12), libelle: `Année ${a.libelle}` };
      }
      const { annee } = lireJour(jour);
      return { du: `${annee}-01-01`, auExclu: `${annee + 1}-01-01`, libelle: `Année ${annee}` };
    }
    case "plage": {
      let du = f.du ?? jour;
      let au = f.au ?? jour;
      if (du > au) [du, au] = [au, du];
      return { du, auExclu: ajouterJours(au, 1), libelle: `Du ${formaterJour(du)} au ${formaterJour(au)}` };
    }
  }
}

/** Historique filtré, paginé, avec les totaux de caisse de toute la sélection. */
export async function lirePaiements(
  params?: ParamsRecherche,
  jour: Jour = jourMadagascar(new Date()),
): Promise<ListePaiements> {
  const f = schemaFiltresPaiements.parse(aplatir(params));
  const bornes = await bornesPeriode(f, jour);

  const et: Prisma.PaiementWhereInput[] = [
    { date: { gte: debutJourMadagascar(bornes.du), lt: debutJourMadagascar(bornes.auExclu) } },
  ];
  if (f.mode === "ESPECES" || f.mode === "MOBILE_MONEY") et.push({ mode: f.mode });
  else if (f.mode !== "tous") et.push({ operateur: f.mode });
  if (f.caissierId) et.push({ saisiParId: f.caissierId });
  if (f.statut === "valides") et.push({ annule: false });
  if (f.statut === "annules") et.push({ annule: true });
  if (f.statut === "aVerifier") et.push({ aVerifier: true });
  const mots = motsRecherche(f.q ?? "");
  if (f.q && mots.length) {
    et.push({
      OR: [
        { numeroRecu: { contains: f.q.trim(), mode: "insensitive" } },
        { AND: mots.map((m) => ({ etudiant: { recherche: { contains: m } } })) },
      ],
    });
  }
  const where: Prisma.PaiementWhereInput = { AND: et };
  const valides: Prisma.PaiementWhereInput = { AND: [...et, { annule: false }] };

  const [total, somme, parMode, annules, aVerifier, caissiers, annees] = await Promise.all([
    db.paiement.count({ where }),
    db.paiement.aggregate({ where: valides, _sum: { montant: true }, _count: { _all: true } }),
    db.paiement.groupBy({ by: ["mode"], where: valides, _sum: { montant: true } }),
    db.paiement.count({ where: { AND: [...et, { annule: true }] } }),
    db.paiement.count({ where: { AND: [...et, { aVerifier: true }] } }),
    db.user.findMany({
      where: { paiementsSaisis: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.anneeScolaire.findMany({ orderBy: { anneeDebut: "desc" }, select: { id: true, libelle: true, estCourante: true } }),
  ]);
  const pages = pagination(total, f.page, TAILLE_PAGE_PAIEMENTS);
  const page = Math.min(f.page, pages.pages);

  const lignes = await db.paiement.findMany({
    where,
    orderBy: [{ date: "desc" }, { numeroRecu: "desc" }],
    skip: (page - 1) * TAILLE_PAGE_PAIEMENTS,
    take: TAILLE_PAGE_PAIEMENTS,
    select: { ...SELECT_PAIEMENT_AFFICHE, etudiant: { select: { id: true, matricule: true, nom: true, prenoms: true } } },
  });
  const sommeMode = (m: ModePaiement) => parMode.find((x) => x.mode === m)?._sum.montant ?? 0;

  return {
    ...pages,
    page,
    filtres: { ...f, page },
    periode: { du: bornes.du, au: ajouterJours(bornes.auExclu, -1), libelle: bornes.libelle },
    lignes: lignes.map((p) => ({ ...paiementAffiche(p), etudiant: p.etudiant })),
    totaux: {
      montant: somme._sum.montant ?? 0,
      nombre: somme._count._all,
      especes: sommeMode("ESPECES"),
      mobileMoney: sommeMode("MOBILE_MONEY"),
      annules,
      aVerifier,
    },
    caissiers: caissiers.map((c) => ({ id: c.id, nom: c.name })),
    annees,
  };
}

// Impayés

const schemaFiltresImpayes = z.object({
  filiereId: idOpt,
  niveau: entierOpt(1, DUREE_MAX),
  q: texteOpt,
  /** « 2 mois et plus » */
  moisMin: entierOpt(1, 60),
});
export type FiltresImpayes = z.output<typeof schemaFiltresImpayes>;

export type LigneImpaye = {
  id: string;
  matricule: string;
  nom: string;
  prenoms: string;
  filiere: { code: string; nom: string };
  niveau: number | null;
  libelleNiveau: string | null;
  telephone: string | null;
  telephoneAffiche: string | null;
  moisEnRetard: number;
  resteEnRetard: number;
  /** Reste dû toutes années, échéances à venir comprises. */
  resteDu: number;
  /** Années ayant au moins une échéance en retard, « 2025-2026 ». */
  anneesEnRetard: string[];
  dernierPaiement: { dateISO: string; date: string; montant: number } | null;
};

export type ListeImpayes = {
  lignes: LigneImpaye[];
  filtres: FiltresImpayes;
  totaux: { etudiants: number; resteEnRetard: number };
  options: { filieres: { id: string; code: string; nom: string; dureeAnnees: number }[]; niveauMax: number };
  jour: Jour;
};

type LigneSqlImpaye = {
  id: string;
  matricule: string;
  nom: string;
  prenoms: string;
  telephone: string | null;
  filiereCode: string;
  filiereNom: string;
  niveau: number | null;
  redoublement: boolean | null;
  resteEnRetard: number;
  moisEnRetard: number;
  resteDu: number;
  anneesEnRetard: string[];
  dernierDate: Date | null;
  dernierMontant: number | null;
};

/** Étudiants actifs en retard, toutes années ; du plus de mois en retard au moins. Pas de pagination (relances, export). */
export async function lireImpayes(
  params?: ParamsRecherche,
  jour: Jour = jourMadagascar(new Date()),
): Promise<ListeImpayes> {
  const f = schemaFiltresImpayes.parse(aplatir(params));
  const limite = dateLimiteRetard(jour);

  const conditions: Prisma.Sql[] = [Prisma.sql`e.statut = 'ACTIF'`, Prisma.sql`r."resteEnRetard" > 0`];
  conditions.push(...sqlMotsRecherche(motsRecherche(f.q ?? "")));
  if (f.filiereId) conditions.push(Prisma.sql`e."filiereId" = ${f.filiereId}`);
  if (f.niveau) conditions.push(Prisma.sql`ins.niveau = ${f.niveau}`);
  if (f.moisMin) conditions.push(Prisma.sql`r."moisEnRetard" >= ${f.moisMin}`);

  const [lignes, filieres] = await Promise.all([
    db.$queryRaw<LigneSqlImpaye[]>`
      SELECT e.id, e.matricule, e.nom, e.prenoms, e.telephone,
        f.code AS "filiereCode", f.nom AS "filiereNom", ins.niveau, ins.redoublement,
        r."resteEnRetard", r."moisEnRetard", r."resteDu", r."anneesEnRetard",
        dp.date AS "dernierDate", dp.montant AS "dernierMontant"
      FROM etudiant e
      JOIN filiere f ON f.id = e."filiereId"
      ${sqlDerniereInscription}
      JOIN (${sqlRestes(limite, null)}) r ON r."etudiantId" = e.id
      LEFT JOIN LATERAL (
        SELECT p.date, p.montant FROM paiement p
        WHERE p."etudiantId" = e.id AND NOT p.annule ORDER BY p.date DESC LIMIT 1
      ) dp ON true
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY r."moisEnRetard" DESC, r."resteEnRetard" DESC, e.nom, e.prenoms`,
    db.filiere.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, nom: true, dureeAnnees: true } }),
  ]);

  return {
    lignes: lignes.map((l) => ({
      id: l.id,
      matricule: l.matricule,
      nom: l.nom,
      prenoms: l.prenoms,
      filiere: { code: l.filiereCode, nom: l.filiereNom },
      niveau: l.niveau,
      libelleNiveau: l.niveau === null ? null : libelleNiveauInscription(l.niveau, l.redoublement ?? false),
      telephone: l.telephone,
      telephoneAffiche: l.telephone ? formaterTelephone(l.telephone) : null,
      moisEnRetard: l.moisEnRetard,
      resteEnRetard: l.resteEnRetard,
      resteDu: l.resteDu,
      anneesEnRetard: l.anneesEnRetard,
      dernierPaiement:
        l.dernierDate && l.dernierMontant !== null
          ? { dateISO: l.dernierDate.toISOString(), date: dateHeureMadagascar(l.dernierDate).date, montant: l.dernierMontant }
          : null,
    })),
    filtres: f,
    totaux: { etudiants: lignes.length, resteEnRetard: lignes.reduce((s, l) => s + l.resteEnRetard, 0) },
    options: { filieres, niveauMax: Math.max(1, ...filieres.map((x) => x.dureeAnnees)) },
    jour,
  };
}

// Relevé d'écolage (A4)

export type Releve = {
  dossier: DossierEtudiant;
  /** Récapitulatif général, toutes années. */
  recapitulatif: TotauxEcolage;
  etablissement: {
    nom: string;
    sigle: string;
    ville: string;
    region: string;
    adresse: string | null;
    telephone: string | null;
    email: string | null;
    arretes: { reference: string; annee: number; objet: string }[];
  };
  /** « 11/10/2026 à 10:24 », heure de Madagascar */
  editeLe: string;
};

/** Tout ce qu'imprime le relevé : identité, années (niveau, redoublant, lignes et sous-total), récapitulatif, paiements. */
export async function lireReleve(etudiantId: string, maintenant: Date = new Date()): Promise<Releve | null> {
  const jour = jourMadagascar(maintenant);
  const [dossier, coordonnees] = await Promise.all([lireDossierEtudiant(etudiantId, jour), getCoordonnees()]);
  if (!dossier) return null;
  const { date, heure } = dateHeureMadagascar(maintenant);
  return {
    dossier,
    recapitulatif: dossier.situation,
    etablissement: {
      nom: ETABLISSEMENT.nom,
      sigle: ETABLISSEMENT.sigle,
      ville: coordonnees.ville,
      region: ETABLISSEMENT.region,
      adresse: coordonnees.adresse,
      telephone: coordonnees.telephone,
      email: coordonnees.email,
      arretes: ARRETES.map((a) => ({ reference: a.reference, annee: a.annee, objet: a.objet })),
    },
    editeLe: `${date} à ${heure}`,
  };
}
