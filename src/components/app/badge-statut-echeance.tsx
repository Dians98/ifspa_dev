import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { LIBELLE_STATUT_ECHEANCE, type StatutEcheance } from "@/lib/ecolage";

// Couleurs de statut distinctes du rose d'accent : un accent ne doit jamais passer pour un retard.
const CLASSES: Record<StatutEcheance, string> = {
  paye: "bg-paye-pale text-paye",
  partiel: "bg-partiel-pale text-partiel",
  retard: "bg-retard-pale text-retard",
  a_venir: "bg-muted text-muted-foreground",
};

export function BadgeStatutEcheance({ statut, className }: { statut: StatutEcheance; className?: string }) {
  return <Badge className={cn(CLASSES[statut], className)}>{LIBELLE_STATUT_ECHEANCE[statut]}</Badge>;
}
