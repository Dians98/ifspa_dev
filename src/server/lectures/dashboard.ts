import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { ModePaiement } from "@/generated/prisma/enums";
import { calculer, totaliser, type AgregatCalcule } from "@/lib/dashboard";
import { db } from "@/lib/db";
import { dateHeureMadagascar, jourDeDate, jourMadagascar, type Jour } from "@/lib/dates";
import { dateLimiteRetard } from "@/lib/ecolage";
import { LIBELLE_MODE, LIBELLE_OPERATEUR } from "@/lib/encaissement";
import { libelleNiveau } from "@/lib/parametres";
import { exigerSession } from "@/server/acces";
import { aplatir, idOpt, type ParamsRecherche } from "@/server/lectures/filtres";

const schemaFiltresDashboard = z.object({ anneeId: idOpt, filiereId: idOpt });

export type FiltresDashboard = {
  /** Année affichée : celle demandée si elle existe, sinon la courante, sinon la plus récente. null : aucune année. */
  anneeId: string | null;
  /** null : toutes les filières. */
  filiereId: string | null;
};

export type FiliereDashboard = { id: string; code: string; nom: string };

export type LigneTableauDashboard = AgregatCalcule & {
  filiere: FiliereDashboard;
  niveau: number;
  /** « 1re année » */
  libelleNiveau: string;
};

export type DernierPaiementDashboard = {
  id: string;
  numeroRecu: string;
  dateISO: string;
  /** « 11/10/2026 » et « 10:24 », heure de Madagascar */
  date: string;
  heure: string;
  etudiant: { id: string; matricule: string; nom: string; prenoms: string };
  montant: number;
  mode: ModePaiement;
  /** « Espèces », ou l'opérateur pour le Mobile Money (« MVola ») */
  modeLibelle: string;
  caissier: string;
  annule: boolean;
  aVerifier: boolean;
};

export type Dashboard = {
  filtres: FiltresDashboard;
  annee: { id: string; libelle: string; estCourante: boolean } | null;
  /** Jour d'arrêté des calculs : est échu ce dont le mois est antérieur au mois de ce jour. */
  jour: Jour;
  options: {
    annees: { id: string; libelle: string; estCourante: boolean }[];
    filieres: FiliereDashboard[];
  };
  cartes: {
    effectif: { total: number; parFiliere: (FiliereDashboard & { effectif: number })[] };
    taux: { valeur: number | null; attendu: number; encaisse: number; bas: boolean };
    enRetard: { nombre: number; sur: number };
  };
  tableau: {
    /** Par code de filière puis niveau ; seulement les classes qui ont des inscriptions sur l'année. */
    lignes: LigneTableauDashboard[];
    sousTotaux: (AgregatCalcule & { filiere: FiliereDashboard })[];
    total: AgregatCalcule;
  };
  /** 10 plus récents, annulés compris, filtrés par filière seulement (pas par année). */
  derniersPaiements: DernierPaiementDashboard[];
};

export const NOMBRE_DERNIERS_PAIEMENTS = 10;

type LigneSqlDashboard = {
  filiereId: string;
  niveau: number;
  effectif: number;
  attendu: bigint | number;
  encaisse: bigint | number;
  enRetard: number;
};

/** SUM d'entiers renvoyé en bigint par Postgres : converti pour rester sérialisable. */
function entier(v: bigint | number): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new RangeError(`Montant hors limites : ${v}.`);
  return n;
}

/**
 * Agrégats d'une année par filière × niveau, mêmes règles que `situation()` (`duEchu`, `payeEchu`) :
 * échéance échue si `mois < limite`, payé = lignes des paiements non annulés plafonné au dû,
 * échéances « non dues » après une sortie exclues. L'argent porte sur toutes les inscriptions de l'année ;
 * effectif et retards seulement sur celles qui ne sont ni en abandon ni en exclusion.
 */
function sqlAgregats(anneeId: string, filiereId: string | null, limite: Date): Prisma.Sql {
  // Comparée en date pure : un Date passé tel quel dépendrait du fuseau de la session Postgres.
  const jourLimite = Prisma.sql`${jourDeDate(limite)}::date`;
  const filtreFiliere = filiereId ? Prisma.sql`AND e."filiereId" = ${filiereId}` : Prisma.empty;
  return Prisma.sql`
    WITH ins AS (
      SELECT i.id, i.niveau, e."filiereId", i.statut NOT IN ('ABANDON', 'EXCLU') AS "dansEffectif"
      FROM inscription i JOIN etudiant e ON e.id = i."etudiantId"
      WHERE i."anneeScolaireId" = ${anneeId} ${filtreFiliere}
    ),
    echues AS (
      SELECT ec."inscriptionId", ec."montantDu" AS du,
        LEAST(COALESCE(SUM(pl.montant) FILTER (WHERE NOT p.annule), 0), ec."montantDu") AS paye
      FROM echeance ec
      JOIN ins ON ins.id = ec."inscriptionId"
      LEFT JOIN paiement_ligne pl ON pl."echeanceId" = ec.id
      LEFT JOIN paiement p ON p.id = pl."paiementId"
      WHERE NOT ec."nonDueSortie" AND ec.mois < ${jourLimite}
      GROUP BY ec.id
    ),
    par_inscription AS (
      SELECT ins.id, ins.niveau, ins."filiereId", ins."dansEffectif",
        COALESCE(SUM(x.du), 0) AS attendu, COALESCE(SUM(x.paye), 0) AS encaisse
      FROM ins LEFT JOIN echues x ON x."inscriptionId" = ins.id
      GROUP BY ins.id, ins.niveau, ins."filiereId", ins."dansEffectif"
    )
    SELECT pi."filiereId", pi.niveau,
      (COUNT(*) FILTER (WHERE pi."dansEffectif"))::int AS effectif,
      SUM(pi.attendu)::bigint AS attendu,
      SUM(pi.encaisse)::bigint AS encaisse,
      (COUNT(*) FILTER (WHERE pi."dansEffectif" AND pi.encaisse < pi.attendu))::int AS "enRetard"
    FROM par_inscription pi
    GROUP BY pi."filiereId", pi.niveau`;
}

/** Tableau de bord : trois cartes, tableau filière × niveau, 10 derniers paiements. */
export async function lireDashboard(
  params?: ParamsRecherche,
  jour: Jour = jourMadagascar(new Date()),
): Promise<Dashboard> {
  await exigerSession();
  const f = schemaFiltresDashboard.parse(aplatir(params));

  const [annees, filieres] = await Promise.all([
    db.anneeScolaire.findMany({ orderBy: { anneeDebut: "desc" }, select: { id: true, libelle: true, estCourante: true } }),
    db.filiere.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, nom: true } }),
  ]);
  const annee = annees.find((a) => a.id === f.anneeId) ?? annees.find((a) => a.estCourante) ?? annees[0] ?? null;
  const filiereId = filieres.some((x) => x.id === f.filiereId) ? (f.filiereId ?? null) : null;
  const parId = new Map(filieres.map((x) => [x.id, x]));
  const filiereDe = (id: string): FiliereDashboard => {
    const filiere = parId.get(id);
    if (!filiere) throw new Error(`Filière ${id} introuvable.`);
    return filiere;
  };

  const [agregats, paiements] = await Promise.all([
    annee
      ? db.$queryRaw<LigneSqlDashboard[]>(sqlAgregats(annee.id, filiereId, dateLimiteRetard(jour)))
      : Promise.resolve([]),
    db.paiement.findMany({
      where: filiereId ? { etudiant: { filiereId } } : {},
      orderBy: [{ date: "desc" }, { numeroRecu: "desc" }],
      take: NOMBRE_DERNIERS_PAIEMENTS,
      select: {
        id: true,
        numeroRecu: true,
        date: true,
        montant: true,
        mode: true,
        operateur: true,
        annule: true,
        aVerifier: true,
        saisiPar: { select: { name: true } },
        etudiant: { select: { id: true, matricule: true, nom: true, prenoms: true } },
      },
    }),
  ]);

  const lignesBrutes = agregats
    .map((l) => ({
      filiereId: l.filiereId,
      niveau: l.niveau,
      effectif: l.effectif,
      attendu: entier(l.attendu),
      encaisse: entier(l.encaisse),
      enRetard: l.enRetard,
    }))
    .sort((a, b) => filiereDe(a.filiereId).code.localeCompare(filiereDe(b.filiereId).code) || a.niveau - b.niveau);
  const { parFiliere, total } = totaliser(lignesBrutes);
  const sousTotaux = parFiliere.map(({ filiereId: id, ...a }) => ({ ...a, filiere: filiereDe(id) }));

  return {
    filtres: { anneeId: annee?.id ?? null, filiereId },
    annee,
    jour,
    options: { annees, filieres },
    cartes: {
      effectif: { total: total.effectif, parFiliere: sousTotaux.map((s) => ({ ...s.filiere, effectif: s.effectif })) },
      taux: { valeur: total.taux, attendu: total.attendu, encaisse: total.encaisse, bas: total.tauxBas },
      enRetard: { nombre: total.enRetard, sur: total.effectif },
    },
    tableau: {
      lignes: lignesBrutes.map((l) => ({
        ...calculer({ effectif: l.effectif, attendu: l.attendu, encaisse: l.encaisse, enRetard: l.enRetard }),
        filiere: filiereDe(l.filiereId),
        niveau: l.niveau,
        libelleNiveau: libelleNiveau(l.niveau),
      })),
      sousTotaux,
      total,
    },
    derniersPaiements: paiements.map((p) => {
      const { date, heure } = dateHeureMadagascar(p.date);
      return {
        id: p.id,
        numeroRecu: p.numeroRecu,
        dateISO: p.date.toISOString(),
        date,
        heure,
        etudiant: p.etudiant,
        montant: p.montant,
        mode: p.mode,
        modeLibelle: p.operateur ? LIBELLE_OPERATEUR[p.operateur] : LIBELLE_MODE[p.mode],
        caissier: p.saisiPar.name,
        annule: p.annule,
        aVerifier: p.aVerifier,
      };
    }),
  };
}
