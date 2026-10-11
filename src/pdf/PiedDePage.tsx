import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { COULEURS, MARGES } from "@/pdf/styles";
import { pourPdf } from "@/pdf/texte";

const BAS = 22;

const styles = StyleSheet.create({
  pied: {
    position: "absolute",
    left: MARGES.cotes,
    right: MARGES.cotes,
    bottom: BAS,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTopWidth: 0.6,
    borderTopColor: COULEURS.filet,
    fontSize: 7.2,
    color: COULEURS.discret,
  },
  bord: { width: "40%" },
  droite: { width: "40%", textAlign: "right" },
  page: {
    position: "absolute",
    left: MARGES.cotes,
    right: MARGES.cotes,
    bottom: BAS,
    textAlign: "center",
    fontSize: 7.2,
    color: COULEURS.discret,
  },
});

/** Répété sur chaque page : date d'édition, « Page X/Y », mention de l'application. */
export function PiedDePage({ editeLe, editePar }: { editeLe: string; editePar?: string | null }) {
  return (
    <>
      <View style={styles.pied} fixed>
        <Text style={styles.bord}>{pourPdf(`Édité le ${editeLe}${editePar ? ` par ${editePar}` : ""}`)}</Text>
        <Text style={styles.droite}>{"Document généré par l'application IFSPA"}</Text>
      </View>
      {/* Hors de la View : un Text à `render` placé dans une View fixe fait disparaître tout le bloc (react-pdf 4.9). */}
      <Text style={styles.page} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber}/${totalPages}`} />
    </>
  );
}
