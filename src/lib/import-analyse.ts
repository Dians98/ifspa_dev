import { createHash } from "node:crypto";
import type { StatutEtudiant } from "@/generated/prisma/enums";
import { dateDuJour, jourDeDate, type Jour } from "@/lib/dates";
import { controleDroits, echeanceFrais, genererEcheances, type EcheanceGeneree, type TarifEcheances } from "@/lib/ecolage";
import { estDoublon, LIBELLE_STATUT_ETUDIANT, normaliserRecherche } from "@/lib/etudiants";
import { lireDate, validerEtudiants, type EtudiantImport } from "@/lib/import";
import { messageImport, type LieuMessage, type MessageImport, type RepriseLue } from "@/lib/import-lecture";
import { COLONNES_ETUDIANTS, FEUILLE_ETUDIANTS, type CleEtudiant } from "@/lib/import-modele";
import { libelleAnnee, libelleNiveau } from "@/lib/parametres";

// Analyse de la reprise sans rien écrire : contrôles globaux, étudiants (nouveaux, déjà en base, refusés).
// Les paiements ne sont pas repris. Pur (ni base, ni horloge) ; node:crypto pour la signature : serveur seulement,
// un composant client n'importe d'ici que des types.

export type FiliereReprise = { id: string; code: string; nom: string; dureeAnnees: number; actif: boolean };
export type AnneeReprise = { id: string; anneeDebut: number; libelle: string; cloturee: boolean };
export type AnneeCouranteReprise = AnneeReprise & { moisDebutEcolage: number };
export type TarifReprise = TarifEcheances & { filiereId: string; niveau: number };
/** Frais de l'année courante : copiés sur les étudiants créés par l'import dans ses classes. */
export type FraisReprise = { id: string; montant: number; mois: Date; rang: number; classes: { filiereId: string; niveau: number }[] };

/** Étudiant en base né un jour cité par le fichier : candidat au doublon (`estDoublon`). */
export type EtudiantEnBase = {
  id: string;
  matricule: string;
  nom: string;
  prenoms: string;
  /** Colonne `@db.Date`, minuit UTC. */
  dateNaissance: Date;
  filiereId: string;
  /** `anneeDebut` de son année d'entrée. */
  anneeEntree: number;
  statut: StatutEtudiant;
  /** Inscription sur l'année courante, null s'il n'en a pas. */
  inscriptionCourante: { niveau: number; redoublement: boolean } | null;
};

export type ContexteReprise = {
  anneeCourante: AnneeCouranteReprise | null;
  filieres: FiliereReprise[];
  /** Toutes les années en base, courante comprise. */
  annees: AnneeReprise[];
  /** Tarifs de l'année courante. */
  tarifs: TarifReprise[];
  /** Frais de l'année courante, par ordre de création. */
  frais: FraisReprise[];
  etudiantsEnBase: EtudiantEnBase[];
};

export type StatutEtudiantReprise = "nouveau" | "existant" | "refuse";

export type EtudiantPlan = {
  ligne: number;
  numero: string | null;
  statut: StatutEtudiantReprise;
  /** Lu et validé ; null si la ligne a une erreur de saisie. */
  donnees: EtudiantImport | null;
  /** Nouveau : filière et année d'entrée en base, tarif copié dans ses échéances. */
  filiereId: string | null;
  anneeEntreeId: string | null;
  tarif: TarifEcheances | null;
  /** Nouveau : frais de l'année courante copiés sur ses échéances. */
  fraisIds: string[];
  /** Nouveau : total des échéances de l'année courante. */
  duAnnee: number | null;
  /** Étudiant déjà en base (statut « existant », ou refusé pour une différence avec la base). */
  existant: { id: string; matricule: string } | null;
};

export type TotauxReprise = {
  etudiants: { lus: number; nouveaux: number; existants: number; refuses: number };
  erreurs: number;
  avertissements: number;
};

export type RapportReprise = {
  /** Une erreur au moins : rien ne peut être importé. */
  bloquant: boolean;
  annee: { id: string; libelle: string } | null;
  /** Globaux d'abord, puis par ligne ; erreurs avant avertissements. */
  messages: MessageImport[];
  /** Ordre d'import : filière, année d'entrée, N° (c'est l'ordre des matricules) ; lignes illisibles à la fin. */
  etudiants: EtudiantPlan[];
  totaux: TotauxReprise;
  /** Tout ce qui sera écrit, une ligne JSON par élément ; sa signature lie la confirmation au plan affiché. */
  canonique: string;
};

/** Étudiant du plan tel que l'écran l'affiche. */
export type EtudiantRapport = {
  ligne: number;
  numero: string | null;
  statut: StatutEtudiantReprise;
  /** Null si la ligne est illisible (erreur de saisie). */
  nom: string | null;
  prenoms: string | null;
  filiere: string | null;
  niveau: number | null;
  /** Déjà en base. */
  matricule: string | null;
  /** Nouveau : total des échéances de l'année courante. */
  duAnnee: number | null;
};

/** Ce que l'action renvoie à l'écran : sans les données internes du plan (ids, tarifs). */
export type RapportRepriseAllege = {
  bloquant: boolean;
  annee: RapportReprise["annee"];
  messages: MessageImport[];
  etudiants: EtudiantRapport[];
  totaux: TotauxReprise;
};

export function allegerRapport(r: RapportReprise): RapportRepriseAllege {
  return {
    bloquant: r.bloquant,
    annee: r.annee,
    messages: r.messages,
    etudiants: r.etudiants.map((e) => ({
      ligne: e.ligne,
      numero: e.numero,
      statut: e.statut,
      nom: e.donnees?.nom ?? null,
      prenoms: e.donnees?.prenoms ?? null,
      filiere: e.donnees?.filiere ?? null,
      niveau: e.donnees?.niveau ?? null,
      matricule: e.existant?.matricule ?? null,
      duAnnee: e.duAnnee,
    })),
    totaux: r.totaux,
  };
}

/** Signature du plan, à renvoyer avec la confirmation : l'import refuse un plan qui a changé depuis le rapport. */
export function signatureReprise(canonique: string): string {
  return createHash("sha256").update(canonique).digest("hex");
}

/** Jours de naissance lisibles du fichier : le contexte ne charge que les étudiants nés ces jours-là. */
export function joursNaissanceCites(lu: RepriseLue): Jour[] {
  const jours = new Set<Jour>();
  for (const l of lu.etudiants.lignes) {
    const d = lireDate(l.cellules.dateNaissance);
    if (d.ok) jours.add(d.valeur);
  }
  return [...jours].sort();
}

const LIGNES_CITEES_MAX = 15;

function lignesCitees(lignes: number[]): string {
  const triees = [...new Set(lignes)].sort((a, b) => a - b);
  if (triees.length === 1) return `ligne ${triees[0]}`;
  const vues = triees.slice(0, LIGNES_CITEES_MAX).join(", ");
  return triees.length > LIGNES_CITEES_MAX ? `lignes ${vues} et ${triees.length - LIGNES_CITEES_MAX} autres` : `lignes ${vues}`;
}

const colonneEtudiant = (cle: CleEtudiant) => COLONNES_ETUDIANTS.find((c) => c.cle === cle)!.entete;

function comparerNumeros(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "", "fr", { numeric: true });
}

function identite(e: { nom: string; prenoms: string; dateNaissance: Jour }): string {
  return `${normaliserRecherche(e.nom)}|${normaliserRecherche(e.prenoms)}|${e.dateNaissance}`;
}

/** Échéances FRAIS d'une classe, telles que l'import les crée (même fonction pour l'analyse et l'écriture). */
export function echeancesFraisReprise(
  frais: readonly FraisReprise[],
  filiereId: string,
  niveau: number,
): (EcheanceGeneree & { rangFrais: number })[] {
  return [...frais]
    .filter((f) => f.classes.some((c) => c.filiereId === filiereId && c.niveau === niveau))
    .sort((a, b) => a.rang - b.rang)
    .map((f) => ({ ...echeanceFrais(f), rangFrais: f.rang }));
}

const GRAVITE_ORDRE = { erreur: 0, avertissement: 1 } as const;
const FEUILLE_ORDRE = (f: MessageImport["feuille"]) => (f === null ? 0 : 1);

function trierMessages(messages: MessageImport[]): MessageImport[] {
  return messages
    .map((m, i) => ({ m, i }))
    .sort(
      (a, b) =>
        FEUILLE_ORDRE(a.m.feuille) - FEUILLE_ORDRE(b.m.feuille) ||
        (a.m.ligne ?? 0) - (b.m.ligne ?? 0) ||
        GRAVITE_ORDRE[a.m.gravite] - GRAVITE_ORDRE[b.m.gravite] ||
        a.i - b.i,
    )
    .map((x) => x.m);
}

function totaux(etudiants: EtudiantPlan[], messages: MessageImport[]): TotauxReprise {
  const compter = (s: StatutEtudiantReprise) => etudiants.filter((x) => x.statut === s).length;
  return {
    etudiants: { lus: etudiants.length, nouveaux: compter("nouveau"), existants: compter("existant"), refuses: compter("refuse") },
    erreurs: messages.filter((m) => m.gravite === "erreur").length,
    avertissements: messages.filter((m) => m.gravite === "avertissement").length,
  };
}

function canonique(annee: { id: string; libelle: string }, etudiants: EtudiantPlan[]): string {
  const lignes: unknown[][] = [["annee", annee.id, annee.libelle]];
  for (const e of etudiants) {
    const d = e.donnees;
    if (e.statut === "nouveau" && d && e.tarif) {
      lignes.push([
        "nouveau", e.ligne, e.numero, d.nom, d.prenoms, d.sexe, d.dateNaissance, d.lieuNaissance, d.cin, d.telephone, d.adresse,
        d.tuteurNom, d.tuteurTelephone, d.tuteurProfession, e.filiereId, e.anneeEntreeId, d.anneeEntree, d.niveau, d.redoublant,
        e.tarif.droitsInscription, e.tarif.montantMensuel, e.tarif.nombreMois, e.fraisIds.join(","),
      ]);
    } else if (e.statut === "existant" && e.existant) {
      lignes.push(["existant", e.ligne, e.numero, e.existant.id]);
    }
  }
  return lignes.map((l) => JSON.stringify(l)).join("\n");
}

function sansPlan(lu: RepriseLue, messages: MessageImport[], annee: RapportReprise["annee"]): RapportReprise {
  const tries = trierMessages(messages);
  return {
    bloquant: true,
    annee,
    messages: tries,
    etudiants: [],
    totaux: { ...totaux([], tries), etudiants: { lus: lu.etudiants.lignes.length, nouveaux: 0, existants: 0, refuses: 0 } },
    canonique: "",
  };
}

/**
 * Rapport et plan d'import, sans rien écrire. `jour` : jour de l'analyse à Madagascar.
 * Un fichier avec une seule erreur n'importe rien (`bloquant`) ; le plan reste détaillé pour la corriger.
 */
export function analyserReprise(lu: RepriseLue, ctx: ContexteReprise, jour: Jour): RapportReprise {
  const messages: MessageImport[] = [...lu.messages];
  const ajouter = (gravite: MessageImport["gravite"], raison: string, lieu: LieuMessage = {}) =>
    messages.push(messageImport(gravite, raison, lieu));

  const annee = ctx.anneeCourante;
  if (!annee) {
    ajouter("erreur", "Aucune année scolaire courante : définissez-la dans Paramètres › Années avant d'importer.");
    return sansPlan(lu, messages, null);
  }
  const anneeRapport = { id: annee.id, libelle: annee.libelle };
  if (annee.cloturee) {
    ajouter("erreur", `L'année ${annee.libelle} est clôturée : aucune inscription n'est possible. Définissez l'année courante dans Paramètres › Années.`);
    return sansPlan(lu, messages, anneeRapport);
  }
  if (messages.some((m) => m.gravite === "erreur")) return sansPlan(lu, messages, anneeRapport);

  const enteteNiveau = lu.etudiants.entetes.niveau ?? colonneEtudiant("niveau");
  if (lu.anneeNiveau !== annee.libelle) {
    ajouter(
      "erreur",
      lu.anneeNiveau
        ? `cet en-tête ne correspond pas à l'année courante ${annee.libelle} : téléchargez le modèle de ${annee.libelle} et recopiez-y vos données.`
        : `l'en-tête doit dire l'année : « Niveau ${annee.libelle} ». Téléchargez le modèle de l'année courante.`,
      { feuille: FEUILLE_ETUDIANTS, ligne: lu.etudiants.ligneEntetes, colonne: enteteNiveau },
    );
  }
  if (lu.etudiants.lignes.length === 0) ajouter("erreur", "la feuille ne contient aucun étudiant.", { feuille: FEUILLE_ETUDIANTS });

  const ve = validerEtudiants(lu.etudiants, { jour });
  messages.push(...ve.messages);

  const filiereParCode = new Map(ctx.filieres.map((f) => [f.code.toUpperCase(), f]));
  const filiereParId = new Map(ctx.filieres.map((f) => [f.id, f]));
  const anneeParDebut = new Map(ctx.annees.map((a) => [a.anneeDebut, a]));
  const tarifs = new Map(ctx.tarifs.map((t) => [`${t.filiereId}:${t.niveau}`, t]));
  const candidatsParJour = new Map<Jour, EtudiantEnBase[]>();
  for (const e of ctx.etudiantsEnBase) {
    const j = jourDeDate(e.dateNaissance);
    candidatsParJour.set(j, [...(candidatsParJour.get(j) ?? []), e]);
  }
  const parIdentite = new Map<string, number[]>();
  for (const e of ve.valides) parIdentite.set(identite(e), [...(parIdentite.get(identite(e)) ?? []), e.ligne]);

  const etudiants: EtudiantPlan[] = [];
  const anneesManquantes = new Map<number, number[]>();
  const tarifsManquants = new Map<string, { filiere: FiliereReprise; niveau: number; lignes: number[] }>();

  for (const e of ve.valides) {
    const plan: EtudiantPlan = {
      ligne: e.ligne, numero: e.numero, statut: "refuse", donnees: e,
      filiereId: null, anneeEntreeId: null, tarif: null, fraisIds: [], duAnnee: null, existant: null,
    };
    etudiants.push(plan);
    let refuse = false;
    const ici = (gravite: MessageImport["gravite"], cle: CleEtudiant | null, raison: string, valeur: string | null = null) => {
      if (gravite === "erreur") refuse = true;
      ajouter(gravite, raison, { feuille: FEUILLE_ETUDIANTS, ligne: e.ligne, colonne: cle ? colonneEtudiant(cle) : null, valeur });
    };

    const memes = parIdentite.get(identite(e))!;
    if (memes.length > 1) {
      ici("erreur", "nom", `même nom, prénoms et date de naissance qu'à la ${lignesCitees(memes.filter((l) => l !== e.ligne))} : un étudiant ne figure qu'une fois.`, e.nom);
      continue;
    }

    const naissance = dateDuJour(e.dateNaissance);
    const candidats = (candidatsParJour.get(e.dateNaissance) ?? []).filter((c) =>
      estDoublon(c, { nom: e.nom, prenoms: e.prenoms, dateNaissance: naissance }),
    );
    if (candidats.length > 1) {
      ici("erreur", "nom", `plusieurs étudiants en base portent ce nom, ces prénoms et cette date de naissance (${candidats.map((c) => c.matricule).join(", ")}) : l'import ne sait pas lequel compléter.`, e.nom);
      continue;
    }

    if (candidats.length === 1) {
      const c = candidats[0];
      plan.existant = { id: c.id, matricule: c.matricule };
      const filiereBase = filiereParId.get(c.filiereId);
      if (filiereBase?.code.toUpperCase() !== e.filiere) {
        ici("erreur", "filiere", `étudiant déjà en base (${c.matricule}) en filière ${filiereBase?.code ?? "inconnue"} : la filière d'un étudiant ne change pas, corrigez le fichier.`, e.filiere);
      }
      const insc = c.inscriptionCourante;
      if (!insc) {
        ici("erreur", "niveau", `étudiant déjà en base (${c.matricule}) sans inscription en ${annee.libelle} : inscrivez-le (Admissions) ou retirez la ligne du fichier.`, String(e.niveau));
      } else if (insc.niveau !== e.niveau) {
        ici("erreur", "niveau", `étudiant déjà en base (${c.matricule}), inscrit en ${libelleNiveau(insc.niveau)} en ${annee.libelle} : corrigez le niveau du fichier.`, String(e.niveau));
      }
      if (refuse) continue;
      plan.statut = "existant";
      const sorti = c.statut !== "ACTIF" ? `, sorti (${LIBELLE_STATUT_ETUDIANT[c.statut]})` : "";
      ici("avertissement", "nom", `déjà en base sous le matricule ${c.matricule}${sorti} : il n'est pas recréé.`, e.nom);
      if (insc && insc.redoublement !== e.redoublant) {
        ici("avertissement", "redoublant", `la base l'indique ${insc.redoublement ? "redoublant" : "non redoublant"} : la base fait foi.`, e.redoublant ? "oui" : "non");
      }
      if (c.anneeEntree !== e.anneeEntree) {
        ici("avertissement", "anneeEntree", `année d'entrée ${c.anneeEntree} dans la base : le matricule ${c.matricule} est conservé.`, String(e.anneeEntree));
      }
      continue;
    }

    const filiere = filiereParCode.get(e.filiere);
    if (!filiere) {
      const codes = ctx.filieres.filter((f) => f.actif).map((f) => f.code).join(", ");
      ici("erreur", "filiere", `filière inconnue${codes ? ` (filières : ${codes})` : ""} : corrigez le code ou créez la filière dans Paramètres › Filières.`, e.filiere);
    } else if (!filiere.actif) {
      ici("erreur", "filiere", `la filière ${filiere.code} est désactivée : elle n'accepte plus d'inscription.`, e.filiere);
    } else if (e.niveau > filiere.dureeAnnees) {
      ici("erreur", "niveau", `la filière ${filiere.code} dure ${filiere.dureeAnnees} ans : pas de ${libelleNiveau(e.niveau)}.`, String(e.niveau));
    }

    const anneeEntree = anneeParDebut.get(e.anneeEntree);
    if (e.anneeEntree > annee.anneeDebut) {
      ici("erreur", "anneeEntree", `année d'entrée postérieure à l'année courante ${annee.libelle}.`, String(e.anneeEntree));
    } else if (!anneeEntree) {
      refuse = true;
      anneesManquantes.set(e.anneeEntree, [...(anneesManquantes.get(e.anneeEntree) ?? []), e.ligne]);
    } else {
      const attendu = annee.anneeDebut - e.anneeEntree + 1;
      if (e.redoublant && e.anneeEntree === annee.anneeDebut) {
        ici("avertissement", "redoublant", `redoublant, mais entré cette année (${e.anneeEntree}) : vérifiez l'année d'entrée.`, "oui");
      } else if (e.niveau > attendu) {
        ici("avertissement", "niveau", `${libelleNiveau(e.niveau)} pour une entrée en ${e.anneeEntree} : inscription directe dans ce niveau ? Sinon, corrigez l'année d'entrée.`, String(e.niveau));
      } else if (e.niveau < attendu && !e.redoublant) {
        ici("avertissement", "niveau", `entré en ${e.anneeEntree}, il serait en ${libelleNiveau(attendu)} : indiquez « oui » dans Redoublant, ou corrigez l'année d'entrée.`, String(e.niveau));
      }
    }

    if (filiere && filiere.actif && e.niveau <= filiere.dureeAnnees) {
      const tarif = tarifs.get(`${filiere.id}:${e.niveau}`);
      if (!tarif) {
        refuse = true;
        const cle = `${filiere.id}:${e.niveau}`;
        const groupe = tarifsManquants.get(cle) ?? { filiere, niveau: e.niveau, lignes: [] };
        groupe.lignes.push(e.ligne);
        tarifsManquants.set(cle, groupe);
      } else {
        const refusDroits = controleDroits(tarif.droitsInscription);
        if (refusDroits) ici("erreur", "niveau", refusDroits, String(e.niveau));
        else if (!refuse && anneeEntree) {
          const montants = { droitsInscription: tarif.droitsInscription, montantMensuel: tarif.montantMensuel, nombreMois: tarif.nombreMois };
          try {
            const frais = echeancesFraisReprise(ctx.frais, filiere.id, e.niveau);
            const generees = [...genererEcheances(montants, annee), ...frais];
            plan.statut = "nouveau";
            plan.filiereId = filiere.id;
            plan.anneeEntreeId = anneeEntree.id;
            plan.tarif = montants;
            plan.fraisIds = frais.flatMap((f) => (f.fraisId ? [f.fraisId] : []));
            plan.duAnnee = generees.reduce((s, g) => s + g.montantDu, 0);
          } catch (err) {
            if (!(err instanceof RangeError)) throw err;
            ici("erreur", "niveau", err.message, String(e.niveau));
          }
        }
      }
    }
  }

  for (const [debut, lignes] of [...anneesManquantes].sort((a, b) => a[0] - b[0])) {
    ajouter("erreur", `l'année ${libelleAnnee(debut)} n'existe pas (${lignesCitees(lignes)}) : créez l'année ${libelleAnnee(debut)} dans Paramètres › Années, puis clôturez-la.`, {
      feuille: FEUILLE_ETUDIANTS,
      colonne: colonneEtudiant("anneeEntree"),
      valeur: String(debut),
    });
  }
  for (const g of tarifsManquants.values()) {
    ajouter("erreur", `tarif manquant pour ${g.filiere.nom} ${libelleNiveau(g.niveau)} en ${annee.libelle} (${lignesCitees(g.lignes)}) : saisissez-le dans Paramètres › Tarifs.`, {
      feuille: FEUILLE_ETUDIANTS,
      colonne: colonneEtudiant("niveau"),
    });
  }

  for (const r of ve.refusees) {
    etudiants.push({
      ligne: r.ligne, numero: r.numero, statut: "refuse", donnees: null,
      filiereId: null, anneeEntreeId: null, tarif: null, fraisIds: [], duAnnee: null, existant: null,
    });
  }

  etudiants.sort((a, b) => {
    if (!a.donnees || !b.donnees) return a.donnees ? -1 : b.donnees ? 1 : a.ligne - b.ligne;
    return (
      a.donnees.filiere.localeCompare(b.donnees.filiere) ||
      a.donnees.anneeEntree - b.donnees.anneeEntree ||
      comparerNumeros(a.numero, b.numero) ||
      a.ligne - b.ligne
    );
  });

  if (!etudiants.some((e) => e.statut === "nouveau") && !messages.some((m) => m.gravite === "erreur")) {
    ajouter("avertissement", "Rien à importer : les étudiants du fichier sont déjà en base.");
  }

  const tries = trierMessages(messages);
  return {
    bloquant: tries.some((m) => m.gravite === "erreur"),
    annee: anneeRapport,
    messages: tries,
    etudiants,
    totaux: totaux(etudiants, tries),
    canonique: canonique(anneeRapport, etudiants),
  };
}
