"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { DialogueMotDePasse } from "@/components/app/dialogue-mot-de-passe";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEnLigne } from "@/hooks/use-en-ligne";
import { usePaiementsEnAttente } from "@/hooks/use-paiements-en-attente";
import { signOut } from "@/lib/auth-client";
import { paiementsAEnvoyer, viderPoste } from "@/lib/hors-ligne/base-locale";
import { viderCachesEncaisser } from "@/lib/hors-ligne/service-worker";
import { cn } from "@/lib/utils";
import { CHEMIN_CONNEXION, LIBELLE_ROLE, type Role } from "@/lib/roles";

function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  const lettres = mots.length === 1 ? mots[0].slice(0, 2) : mots[0][0] + mots[mots.length - 1][0];
  return lettres.toUpperCase();
}

export function MenuUtilisateur({ utilisateurId, nom, role }: { utilisateurId: string; nom: string; role: Role }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const enLigne = useEnLigne();
  const enAttente = usePaiementsEnAttente(utilisateurId);

  // Un paiement en attente est de l'argent déjà reçu : on ne quitte pas avant son envoi.
  const raison = !enLigne
    ? "Déconnexion impossible hors ligne : reconnectez-vous à Internet."
    : enAttente > 0
      ? `Déconnexion impossible : ${enAttente} paiement${enAttente > 1 ? "s" : ""} à envoyer. Ouvrez Encaisser et attendez la fin de la synchronisation.`
      : null;

  async function deconnecter() {
    if (raison || enCours) return;
    setEnCours(true);
    try {
      // Relecture juste avant de partir : un paiement a pu être saisi dans un autre onglet.
      if ((await paiementsAEnvoyer(utilisateurId)) > 0) {
        setEnCours(false);
        toast.error("Des paiements attendent d'être envoyés : déconnexion annulée.");
        return;
      }
      const { error } = await signOut();
      if (error) throw new Error(error.message);
      await Promise.all([viderPoste(), viderCachesEncaisser()]).catch(() => {});
    } catch {
      setEnCours(false);
      toast.error("Déconnexion impossible. Vérifiez votre connexion Internet et réessayez.");
      return;
    }
    router.replace(CHEMIN_CONNEXION);
    router.refresh();
  }

  return (
    // grid-cols-1 : sans largeur de colonne bornée, un nom long élargit la grille et rogne le bouton.
    <div className="grid grid-cols-1 gap-2">
      <div className="flex min-w-0 items-center gap-3 py-1 pl-2group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2 group-data-[collapsible=icon]:p-0">
        <Avatar className="size-9 group-data-[collapsible=icon]:size-8">
          <AvatarFallback className="bg-rose-fonce text-sm font-bold text-white">{initiales(nom)}</AvatarFallback>
        </Avatar>
        {/* sr-only plutôt que hidden : nom et rôle restent lus quand la barre est repliée. */}
        <p className="min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:sr-only">
          <span className="block truncate text-sm font-semibold text-sidebar-primary">{nom}</span>
          <span className="block truncate text-xs text-sidebar-foreground/80">{LIBELLE_ROLE[role]}</span>
        </p>
        <DialogueMotDePasse
          declencheur={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!enLigne}
              aria-label="Changer mon mot de passe"
              title={enLigne ? "Changer mon mot de passe" : "Changement du mot de passe impossible hors ligne"}
              className="size-9 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:size-8"
            >
              <KeyRound aria-hidden />
            </Button>
          }
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={deconnecter}
              disabled={enCours}
              aria-disabled={raison ? true : undefined}
              aria-describedby={raison ? "raison-deconnexion" : undefined}
              aria-label={enCours ? "Déconnexion…" : "Se déconnecter"}
              className={cn(
                "size-9 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:size-8",
                raison && "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-sidebar-foreground",
              )}
            >
              {enCours ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{raison ?? "Se déconnecter"}</TooltipContent>
        </Tooltip>
      </div>
      <p
        id="raison-deconnexion"
        role="status"
        className="px-2 text-xs leading-snug text-sidebar-foreground group-data-[collapsible=icon]:sr-only"
      >
        {raison}
      </p>
    </div>
  );
}
