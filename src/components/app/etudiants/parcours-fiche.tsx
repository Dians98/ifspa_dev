import { Badge } from "@/components/ui/badge";
import { formaterJour } from "@/lib/dates";
import type { DossierEtudiant } from "@/server/lectures/etudiants";
import { EtatVide, PanneauParametre } from "@/components/app/parametres/panneau-parametre";

export function ParcoursFiche({ e }: { e: DossierEtudiant }) {
  const annees = [...e.parcours].reverse();

  return (
    <PanneauParametre
      titre="Parcours scolaire"
      description={`Entrée en ${e.anneeEntree}. Le matricule ${e.matricule} reste le même pendant toute la scolarité.`}
    >
      {annees.length === 0 && !e.sortie ? (
        <EtatVide texte="Aucune inscription enregistrée." />
      ) : (
        <ol className="divide-y">
          {e.sortie && (
            <li className="flex flex-wrap items-start gap-x-6 gap-y-1 bg-muted/50 px-4 py-3.5 sm:px-5">
              <span className="w-24 font-semibold text-primary tabular-nums">
                {e.sortie.date ? formaterJour(e.sortie.date) : "Sans date"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">Sortie : {e.libelleStatut}</p>
                {e.sortie.motif && <p className="mt-0.5 text-sm text-muted-foreground">{e.sortie.motif}</p>}
              </div>
            </li>
          )}
          {annees.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5 sm:px-5">
              <span className="w-24 font-semibold text-primary tabular-nums">{i.annee}</span>
              <span className="min-w-0 flex-1 font-medium">{i.libelleNiveau}</span>
              <div className="flex flex-wrap items-center gap-2">
                {i.redoublement && <Badge variant="outline">Redoublant</Badge>}
                <Badge className="bg-secondary text-secondary-foreground">{i.libelleStatut}</Badge>
              </div>
            </li>
          ))}
        </ol>
      )}
    </PanneauParametre>
  );
}
