import "server-only";
import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Sexe, StatutEtudiant } from "@/generated/prisma/enums";
import { formaterJour } from "@/lib/dates";
import type { StatutEcheance } from "@/lib/ecolage";
import { LIBELLE_STATUT_ETUDIANT } from "@/lib/etudiants";
import { libelleNiveau } from "@/lib/parametres";
import { EnTete } from "@/pdf/EnTete";
import { PiedDePage } from "@/pdf/PiedDePage";
import { enregistrerPolices } from "@/pdf/polices";
import { COULEURS, stylesCommuns } from "@/pdf/styles";
import { arPdf, pourPdf } from "@/pdf/texte";
import type { InscriptionFiche, PaiementFiche } from "@/server/lectures/etudiants";
import type { Releve } from "@/server/lectures/paiements";

const STATUT_FEMININ: Record<StatutEtudiant, string> = {
  ACTIF: "Active",
  DIPLOME: "Diplômée",
  ABANDON: "Abandon",
  EXCLU: "Exclue",
};

function statutEtudiant(statut: StatutEtudiant, sexe: Sexe): string {
  return sexe === "F" ? STATUT_FEMININ[statut] : LIBELLE_STATUT_ETUDIANT[statut];
}

function redoublant(sexe: Sexe): string {
  return sexe === "F" ? "redoublante" : "redoublant";
}

/** Montant, ou tiret quand il est nul (colonnes « payé » et « reste »). */
function arOuTiret(n: number): string {
  return n === 0 ? "—" : arPdf(n);
}

function pluriel(n: number, mot: string): string {
  return `${n} ${mot}${n > 1 ? "s" : ""}`;
}

const L = {
  du: 74,
  paye: 74,
  reste: 74,
  statut: 64,
  recu: 76,
  date: 56,
  mode: 76,
  reference: 112,
  montant: 72,
} as const;
const LARGEUR_AVANT_MONTANT = L.recu + L.date + L.mode + L.reference;

const s = StyleSheet.create({
  section: { marginTop: 14 },
  titreSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
    marginBottom: 4,
  },
  titre: { fontSize: 10, fontWeight: 700, color: COULEURS.principale },
  mention: { fontSize: 7.8, fontWeight: 600, color: COULEURS.texte },
  aDroite: { fontSize: 7.8, color: COULEURS.discret, textAlign: "right" },

  identite: { marginTop: 14, padding: 10, borderWidth: 0.6, borderColor: COULEURS.filet, borderRadius: 4 },
  nomEtudiant: { fontSize: 12, fontWeight: 700, color: COULEURS.principale },
  champs: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  champ: { width: "33.33%", paddingRight: 10, marginTop: 5 },
  etiquette: { fontSize: 6.6, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: COULEURS.discret },
  valeur: { fontWeight: 600 },

  entete: { flexDirection: "row", borderBottomWidth: 0.9, borderBottomColor: COULEURS.principale },
  th: {
    paddingVertical: 3,
    paddingHorizontal: 5,
    fontSize: 6.8,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: COULEURS.principale,
  },
  ligne: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COULEURS.filetTableau },
  td: { paddingVertical: 2.7, paddingHorizontal: 5 },
  total: { flexDirection: "row", borderTopWidth: 0.9, borderTopColor: COULEURS.principale, fontWeight: 700 },
  souple: { flex: 1 },
  m: { textAlign: "right" },
  annulee: { color: COULEURS.discret },
  barre: { textDecoration: "line-through" },
  motif: { fontSize: 7, color: COULEURS.discret },
  note: { marginTop: 4, fontSize: 7.4, color: COULEURS.discret },

  recap: { flexDirection: "row", borderWidth: 0.9, borderColor: COULEURS.principale, borderRadius: 4 },
  case: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, borderLeftWidth: 0.6, borderLeftColor: COULEURS.filet },
  premiereCase: { borderLeftWidth: 0 },
  chiffre: { marginTop: 2, fontSize: 11, fontWeight: 700 },
  precision: { fontSize: 7.4, color: COULEURS.discret },
});

// Lisible en noir et blanc : le statut se lit au texte et à la graisse, jamais à la seule couleur.
const STYLE_STATUT: Record<StatutEcheance, { fontWeight: number; color: string }> = {
  paye: { fontWeight: 400, color: COULEURS.texte },
  partiel: { fontWeight: 600, color: COULEURS.texte },
  retard: { fontWeight: 700, color: COULEURS.texte },
  a_venir: { fontWeight: 400, color: COULEURS.discret },
};

function Champ({ etiquette, valeur }: { etiquette: string; valeur: string }) {
  return (
    <View style={s.champ}>
      <Text style={s.etiquette}>{etiquette}</Text>
      <Text style={s.valeur}>{pourPdf(valeur)}</Text>
    </View>
  );
}

function Identite({ releve }: { releve: Releve }) {
  const d = releve.dossier;
  const derniere = d.parcours.at(-1);
  const sortie = d.sortie?.date ? ` le ${formaterJour(d.sortie.date)}` : "";
  const champs: { etiquette: string; valeur: string }[] = [
    { etiquette: "Matricule", valeur: d.matricule },
    { etiquette: "Filière", valeur: d.filiere.nom },
    { etiquette: "Statut", valeur: `${statutEtudiant(d.statut, d.sexe)}${sortie}` },
  ];
  if (derniere) {
    champs.push({
      etiquette: d.statut === "ACTIF" ? "Niveau actuel" : "Niveau de sortie",
      valeur: `${libelleNiveau(derniere.niveau)}${derniere.redoublement ? ` (${redoublant(d.sexe)})` : ""}`,
    });
  }
  champs.push({ etiquette: "Année d'entrée", valeur: d.anneeEntree });
  champs.push({
    etiquette: d.sexe === "F" ? "Née le" : "Né le",
    valeur: `${d.dateNaissanceAffichee} à ${d.lieuNaissance}`,
  });
  if (d.telephoneAffiche) champs.push({ etiquette: "Téléphone", valeur: d.telephoneAffiche });

  return (
    <View style={s.identite} wrap={false}>
      <Text style={s.nomEtudiant}>{pourPdf(`${d.nom} ${d.prenoms}`)}</Text>
      <View style={s.champs}>
        {champs.map((c) => (
          <Champ key={c.etiquette} {...c} />
        ))}
      </View>
    </View>
  );
}

function AnneeScolaire({ inscription: i, sexe, jour }: { inscription: InscriptionFiche; sexe: Sexe; jour: string }) {
  const situation = i.anneeCloturee ? `Année clôturée · ${i.libelleStatut}` : `Situation au ${formaterJour(jour)}`;
  return (
    <View style={s.section}>
      <View style={s.titreSection} minPresenceAhead={60}>
        <Text style={s.titre}>
          {`Année ${i.annee} · ${libelleNiveau(i.niveau)}`}
          {i.redoublement && <Text style={s.mention}>{`  ${redoublant(sexe)}`}</Text>}
        </Text>
        <Text style={s.aDroite}>{situation}</Text>
      </View>
      {i.echeances.length === 0 ? (
        <Text style={s.note}>Aucune échéance pour cette année.</Text>
      ) : (
        <View>
          <View style={s.entete} wrap={false}>
            <Text style={[s.th, s.souple]}>Échéance</Text>
            <Text style={[s.th, s.m, { width: L.du }]}>Dû</Text>
            <Text style={[s.th, s.m, { width: L.paye }]}>Payé</Text>
            <Text style={[s.th, s.m, { width: L.reste }]}>Reste</Text>
            <Text style={[s.th, { width: L.statut }]}>Statut</Text>
          </View>
          {i.echeances.map((e) => (
            <View key={e.id} style={s.ligne} wrap={false}>
              <Text style={[s.td, s.souple]}>{pourPdf(e.libelle)}</Text>
              <Text style={[s.td, s.m, { width: L.du }]}>{arPdf(e.montantDu)}</Text>
              <Text style={[s.td, s.m, { width: L.paye }]}>{arOuTiret(e.paye)}</Text>
              <Text style={[s.td, s.m, { width: L.reste }]}>{arOuTiret(e.reste)}</Text>
              <Text style={[s.td, { width: L.statut }, STYLE_STATUT[e.statut]]}>{e.libelleStatut}</Text>
            </View>
          ))}
          <View style={s.total} wrap={false}>
            <Text style={[s.td, s.souple]}>{`Sous-total ${i.annee}`}</Text>
            <Text style={[s.td, s.m, { width: L.du }]}>{arPdf(i.totaux.du)}</Text>
            <Text style={[s.td, s.m, { width: L.paye }]}>{arPdf(i.totaux.paye)}</Text>
            <Text style={[s.td, s.m, { width: L.reste }]}>{arPdf(i.totaux.reste)}</Text>
            <Text style={[s.td, { width: L.statut }]} />
          </View>
        </View>
      )}
    </View>
  );
}

function Recapitulatif({ releve }: { releve: Releve }) {
  const r = releve.recapitulatif;
  const { parcours, jour } = releve.dossier;
  const aVenir = r.reste - r.resteEnRetard;
  const etendue = parcours.length
    ? `Parcours ${parcours[0].anneeDebut}-${parcours[parcours.length - 1].anneeDebut + 1}`
    : "";
  return (
    <View style={s.section} wrap={false}>
      <View style={s.titreSection}>
        <Text style={s.titre}>Récapitulatif général</Text>
        <Text style={s.aDroite}>{etendue}</Text>
      </View>
      <View style={s.recap}>
        <View style={[s.case, s.premiereCase]}>
          <Text style={s.etiquette}>Total dû</Text>
          <Text style={s.chiffre}>{arPdf(r.du)}</Text>
        </View>
        <View style={s.case}>
          <Text style={s.etiquette}>Total payé</Text>
          <Text style={s.chiffre}>{arPdf(r.paye)}</Text>
        </View>
        <View style={s.case}>
          <Text style={s.etiquette}>Reste à payer</Text>
          <Text style={s.chiffre}>{arPdf(r.reste)}</Text>
          {r.resteEnRetard > 0 && aVenir > 0 && (
            <Text style={s.precision}>{`dont échéances à venir : ${arPdf(aVenir)}`}</Text>
          )}
        </View>
        <View style={s.case}>
          <Text style={s.etiquette}>{`En retard au ${formaterJour(jour)}`}</Text>
          <Text style={s.chiffre}>{r.resteEnRetard > 0 ? arPdf(r.resteEnRetard) : "Néant"}</Text>
          {r.moisEnRetard > 0 && <Text style={s.precision}>{`${r.moisEnRetard} mois de retard`}</Text>}
        </View>
      </View>
    </View>
  );
}

function modePaiement(p: PaiementFiche): string {
  return p.operateurLibelle ?? p.modeLibelle;
}

function Paiements({ paiements }: { paiements: PaiementFiche[] }) {
  // La lecture les donne du plus récent au plus ancien ; un relevé se lit dans l'ordre chronologique.
  const chronologiques = [...paiements].reverse();
  const valides = paiements.filter((p) => !p.annule);
  const annules = paiements.length - valides.length;
  const resume = `${pluriel(valides.length, "reçu")} ${valides.length > 1 ? "valides" : "valide"}${
    annules ? ` · ${pluriel(annules, "annulé")}` : ""
  }`;
  return (
    <View style={s.section}>
      <View style={s.titreSection} minPresenceAhead={40}>
        <Text style={s.titre}>Paiements enregistrés</Text>
        <Text style={s.aDroite}>{paiements.length ? resume : ""}</Text>
      </View>
      {paiements.length === 0 ? (
        <Text style={s.note}>Aucun paiement enregistré pour cet étudiant.</Text>
      ) : (
        <View>
          <View style={s.entete} wrap={false}>
            <Text style={[s.th, { width: L.recu }]}>N° de reçu</Text>
            <Text style={[s.th, { width: L.date }]}>Date</Text>
            <Text style={[s.th, { width: L.mode }]}>Mode</Text>
            <Text style={[s.th, { width: L.reference }]}>Référence</Text>
            <Text style={[s.th, s.m, { width: L.montant }]}>Montant</Text>
            <Text style={[s.th, s.souple]}>Statut</Text>
          </View>
          {chronologiques.map((p) => (
            <View key={p.id} style={[s.ligne, p.annule ? s.annulee : {}]} wrap={false}>
              <Text style={[s.td, { width: L.recu, fontWeight: 600 }]}>{p.numeroRecu}</Text>
              <Text style={[s.td, { width: L.date }]}>{p.date}</Text>
              <Text style={[s.td, { width: L.mode }]}>{pourPdf(modePaiement(p))}</Text>
              <Text style={[s.td, { width: L.reference }]}>{pourPdf(p.reference ?? "—")}</Text>
              <Text style={[s.td, s.m, { width: L.montant }, p.annule ? s.barre : {}]}>{arPdf(p.montant)}</Text>
              <View style={[s.td, s.souple]}>
                <Text style={p.annule ? { fontWeight: 700 } : {}}>{p.annule ? "Annulé" : "Valide"}</Text>
                {p.annulation?.motif && <Text style={s.motif}>{pourPdf(p.annulation.motif)}</Text>}
              </View>
            </View>
          ))}
          <View style={s.total} wrap={false}>
            <Text style={[s.td, { width: LARGEUR_AVANT_MONTANT }]}>Total des paiements valides</Text>
            <Text style={[s.td, s.m, { width: L.montant }]}>{arPdf(valides.reduce((t, p) => t + p.montant, 0))}</Text>
            <Text style={[s.td, s.souple]} />
          </View>
        </View>
      )}
    </View>
  );
}

/** Relevé d'écolage A4 d'un étudiant : identité, années du parcours, récapitulatif, paiements. */
export function DocumentReleve({ releve, editePar }: { releve: Releve; editePar?: string | null }) {
  const d = releve.dossier;
  return (
    <Document
      title={`Relevé d'écolage ${d.matricule}`}
      author={releve.etablissement.sigle}
      subject={`Relevé d'écolage de ${d.nom} ${d.prenoms}`}
      creator="Application IFSPA"
      producer="Application IFSPA"
      language="fr"
    >
      <Page size="A4" style={stylesCommuns.page}>
        <EnTete etablissement={releve.etablissement} titre="RELEVÉ D'ÉCOLAGE" sousTitre={`Édité le ${releve.editeLe}`} />
        <Identite releve={releve} />
        {d.parcours.length === 0 ? (
          <Text style={s.note}>Aucune inscription enregistrée pour cet étudiant.</Text>
        ) : (
          d.parcours.map((i) => <AnneeScolaire key={i.id} inscription={i} sexe={d.sexe} jour={d.jour} />)
        )}
        <Recapitulatif releve={releve} />
        <Paiements paiements={d.paiements} />
        <PiedDePage editeLe={releve.editeLe} editePar={editePar} />
      </Page>
    </Document>
  );
}

/** PDF du relevé ; `editePar` : nom de l'utilisateur qui l'imprime, affiché en pied de page. */
export async function rendreReleve(releve: Releve, editePar?: string | null): Promise<Buffer> {
  enregistrerPolices();
  return renderToBuffer(<DocumentReleve releve={releve} editePar={editePar} />);
}
