"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { signOut } from "@/lib/auth-client";
import { CHEMIN_CONNEXION, LIBELLE_ROLE, type Role } from "@/lib/roles";

function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  const lettres = mots.length === 1 ? mots[0].slice(0, 2) : mots[0][0] + mots[mots.length - 1][0];
  return lettres.toUpperCase();
}

export function MenuUtilisateur({ nom, role }: { nom: string; role: Role }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);

  async function deconnecter() {
    setEnCours(true);
    try {
      const { error } = await signOut();
      if (error) throw new Error(error.message);
    } catch {
      setEnCours(false);
      toast.error("Déconnexion impossible. Vérifiez votre connexion Internet et réessayez.");
      return;
    }
    router.replace(CHEMIN_CONNEXION);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 py-1 pl-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2 group-data-[collapsible=icon]:p-0">
      <Avatar className="size-9 group-data-[collapsible=icon]:size-8">
        <AvatarFallback className="bg-rose-fonce text-sm font-bold text-white">{initiales(nom)}</AvatarFallback>
      </Avatar>
      {/* sr-only plutôt que hidden : nom et rôle restent lus quand la barre est repliée. */}
      <p className="min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:sr-only">
        <span className="block truncate text-sm font-semibold text-sidebar-primary">{nom}</span>
        <span className="block truncate text-xs text-sidebar-foreground/80">{LIBELLE_ROLE[role]}</span>
      </p>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={deconnecter}
            disabled={enCours}
            aria-label={enCours ? "Déconnexion…" : "Se déconnecter"}
            className="size-9 shrink-0 group-data-[collapsible=icon]:size-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring"
          >
            {enCours ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Se déconnecter</TooltipContent>
      </Tooltip>
    </div>
  );
}
