import { Badge } from "@/components/ui/badge";
import { formaterAriary } from "@/lib/montant";
import type { ResultatGuichet } from "@/lib/encaissement-hors-ligne";

/** « Sorti » (étudiant qui a quitté l'institut) et situation d'écolage : le texte porte l'information, pas la couleur. */
export function BadgesSituation({
  etudiant,
}: {
  etudiant: Pick<ResultatGuichet, "sorti" | "libelleStatut" | "resteEnRetard" | "resteDu">;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {etudiant.sorti && (
        <Badge variant="outline" className="text-foreground">
          Sorti · {etudiant.libelleStatut}
        </Badge>
      )}
      {etudiant.resteEnRetard > 0 ? (
        <Badge className="bg-retard-pale text-retard">En retard {formaterAriary(etudiant.resteEnRetard)}</Badge>
      ) : etudiant.sorti && etudiant.resteDu > 0 ? (
        // « À jour » serait faux : un sorti doit encore ce qui n'était pas soldé à son départ.
        <Badge className="bg-attention-pale text-attention">Doit encore {formaterAriary(etudiant.resteDu)}</Badge>
      ) : (
        <Badge className="bg-paye-pale text-paye">À jour</Badge>
      )}
    </span>
  );
}
