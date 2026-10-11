"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { dateDuJour, jourDeDate, jourMadagascar } from "@/lib/dates";
import { echec, echecCode, echecValidation, succes, type EtatAction } from "@/lib/etat-action";
import {
  borneDebutSortie,
  controleSortie,
  echeancesNonDuesApresSortie,
  LIBELLE_TYPE_SORTIE,
  schemaSortie,
  type EntreeSortie,
} from "@/lib/sorties";
import { exigerAdmin } from "@/server/acces";
import { OPTIONS_TRANSACTION, verrouillerEtudiant } from "@/server/ecolage";
import { revaliderPagesEcolage } from "@/server/ecolage-revalidation";

const ETUDIANT_INTROUVABLE = "Cet étudiant n'existe plus. Rechargez la page.";

/**
 * Admin seulement. Abandon ou exclusion : statut, date et motif sur l'étudiant, inscription en cours fermée,
 * échéances des mois suivants sans paiement marquées « non dues ». Rien n'est supprimé ni aucun montant réécrit.
 */
export async function enregistrerSortie(entree: EntreeSortie): Promise<EtatAction<{ echeancesNonDues: number }>> {
  const { refus } = await exigerAdmin();
  if (refus) return refus;

  const lu = schemaSortie.safeParse(entree);
  if (!lu.success) return echecValidation(lu.error);
  const { etudiantId, type, date, motif } = lu.data;
  const jour = jourMadagascar(new Date());

  const etat = await db.$transaction(async (tx): Promise<EtatAction<{ echeancesNonDues: number }>> => {
    const etudiant = await verrouillerEtudiant(tx, etudiantId);
    if (!etudiant) return echecCode("INTROUVABLE", ETUDIANT_INTROUVABLE);

    const inscriptions = await tx.inscription.findMany({
      where: { etudiantId },
      select: { id: true, statut: true, anneeScolaire: { select: { dateDebut: true } } },
    });
    const refusSortie = controleSortie({
      statutEtudiant: etudiant.statut,
      date,
      jour,
      borneDebut: borneDebutSortie(
        inscriptions.map((i) => ({ enCours: i.statut === "EN_COURS", debut: jourDeDate(i.anneeScolaire.dateDebut) })),
        jour,
      ),
    });
    if (refusSortie) {
      return refusSortie.champ
        ? echec(refusSortie.message, { [refusSortie.champ]: refusSortie.message })
        : echec(refusSortie.message);
    }

    const echeances = await tx.echeance.findMany({
      where: { inscription: { etudiantId } },
      select: {
        id: true,
        mois: true,
        nonDueSortie: true,
        _count: { select: { lignesPaiement: { where: { paiement: { annule: false } } } } },
      },
    });
    const nonDues = echeancesNonDuesApresSortie(
      echeances.map((e) => ({ id: e.id, mois: e.mois, nonDueSortie: e.nonDueSortie, lignesNonAnnulees: e._count.lignesPaiement })),
      date,
    );

    await tx.etudiant.update({
      where: { id: etudiantId },
      data: { statut: type, dateSortie: dateDuJour(date), motifSortie: motif },
    });
    await tx.inscription.updateMany({ where: { etudiantId, statut: "EN_COURS" }, data: { statut: type } });
    if (nonDues.length) {
      await tx.echeance.updateMany({ where: { id: { in: nonDues } }, data: { nonDueSortie: true } });
    }

    const suite =
      nonDues.length === 0
        ? "toutes ses échéances restent dues."
        : `${nonDues.length} échéance${nonDues.length > 1 ? "s" : ""} des mois suivants ne ${nonDues.length > 1 ? "sont" : "est"} plus due${nonDues.length > 1 ? "s" : ""}.`;
    return succes(`${LIBELLE_TYPE_SORTIE[type]} enregistré${type === "EXCLU" ? "e" : ""} : ${suite}`, {
      echeancesNonDues: nonDues.length,
    });
  }, OPTIONS_TRANSACTION);

  if (etat.statut === "succes") {
    revaliderPagesEcolage();
    revalidatePath("/app/admissions", "layout");
  }
  return etat;
}
