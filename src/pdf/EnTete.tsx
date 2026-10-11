import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Releve } from "@/server/lectures/paiements";
import { COULEURS } from "@/pdf/styles";
import { pourPdf } from "@/pdf/texte";

type Etablissement = Releve["etablissement"];

// Références imposées par le plan pour l'en-tête ; le texte complet vient de ARRETES.
const NUMEROS_AGREMENT = ["04460/2011", "15482/2011"];
const NUMERO_RENOUVELLEMENT = "056/2024";

let logo: Buffer | null = null;
function lireLogo(): Buffer {
  logo ??= readFileSync(path.join(process.cwd(), "public/brand/logo-ifspa.png"));
  return logo;
}

function sansPrefixe(reference: string): string {
  return reference.replace(/^N°\s*/i, "");
}

/** « Arrêtés n° 04460/2011-MESupRes et n° 15482/2011-MESupRES · Renouvellement n° 056/2024 » */
export function ligneAgrements(arretes: Etablissement["arretes"]): string {
  const agrements = NUMEROS_AGREMENT.flatMap((n) => arretes.filter((a) => a.reference.includes(n)));
  const parties: string[] = [];
  if (agrements.length) {
    const refs = agrements.map((a) => `n° ${sansPrefixe(a.reference)}`).join(" et ");
    parties.push(`${agrements.length > 1 ? "Arrêtés" : "Arrêté"} ${refs}`);
  }
  // Forme courte du plan : la référence complète (« …/SG/DGES/SG ») est insécable et déborde.
  if (arretes.some((a) => a.reference.includes(NUMERO_RENOUVELLEMENT))) {
    parties.push(`Renouvellement n° ${NUMERO_RENOUVELLEMENT}`);
  }
  return parties.join(" · ");
}

const styles = StyleSheet.create({
  bandeau: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 8,
    borderBottomWidth: 1.4,
    borderBottomColor: COULEURS.principale,
  },
  logo: { width: 62, height: 42, objectFit: "contain" },
  institut: { flex: 1 },
  nom: { fontSize: 11, fontWeight: 700, lineHeight: 1.2, color: COULEURS.principale },
  ligne: { fontSize: 8.2, color: COULEURS.texteSecondaire },
  agrements: { marginTop: 2, fontSize: 6.6, color: COULEURS.discret },
  titreBloc: { width: 150, alignItems: "flex-end" },
  titre: { fontSize: 14, fontWeight: 700, lineHeight: 1.1, color: COULEURS.principale, textAlign: "right" },
  sousTitre: { marginTop: 3, fontSize: 8, color: COULEURS.texteSecondaire, textAlign: "right" },
});

/** En-tête des documents A4 : logo, institut, coordonnées renseignées, agréments, titre du document. */
export function EnTete({
  etablissement,
  titre,
  sousTitre,
}: {
  etablissement: Etablissement;
  titre: string;
  sousTitre?: string;
}) {
  const contact = [etablissement.adresse, etablissement.telephone, etablissement.email].filter(
    (x): x is string => !!x && x.trim() !== "",
  );
  const agrements = ligneAgrements(etablissement.arretes);
  return (
    <View style={styles.bandeau}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf : pas d'attribut alt dans un PDF. */}
      <Image style={styles.logo} src={{ data: lireLogo(), format: "png" }} />
      <View style={styles.institut}>
        <Text style={styles.nom}>{etablissement.nom}</Text>
        <Text style={styles.ligne}>
          {pourPdf(`${etablissement.sigle} · ${etablissement.ville}, Madagascar`)}
        </Text>
        {contact.length > 0 && <Text style={styles.ligne}>{pourPdf(contact.join(" · "))}</Text>}
        {agrements && <Text style={styles.agrements}>{agrements}</Text>}
      </View>
      <View style={styles.titreBloc}>
        <Text style={styles.titre}>{titre}</Text>
        {sousTitre && <Text style={styles.sousTitre}>{pourPdf(sousTitre)}</Text>}
      </View>
    </View>
  );
}
