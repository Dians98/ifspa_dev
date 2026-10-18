"use client";

import Link from "next/link";
import { Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useEnLigne } from "@/hooks/use-en-ligne";
import { estActive } from "./navigation";
import { usePathname } from "next/navigation";

const CHEMIN_ENCAISSER = "/app/encaisser";

/** En-tête : replie la barre sur ordinateur, ouvre le tiroir sur mobile où « Encaisser » reste à un geste. */
export function EnTeteApp() {
  const { isMobile, open, openMobile } = useSidebar();
  const pathname = usePathname();
  const enLigne = useEnLigne();
  const deplie = isMobile ? openMobile : open;
  const libelle = isMobile ? "Ouvrir le menu" : deplie ? "Replier le menu" : "Déplier le menu";

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background px-3">
      <SidebarTrigger aria-label={libelle} aria-expanded={deplie} className="size-11 md:size-9 [&_svg]:size-5" />
      <span className="font-heading text-lg font-bold text-primary md:hidden">IFSPA</span>
      {!estActive(CHEMIN_ENCAISSER, pathname) && (
        <Button asChild size="lg" className="ml-auto h-9 bg-rose-fonce px-3 text-white hover:bg-rose-fonce/90 md:hidden">
          {enLigne ? (
            <Link href={CHEMIN_ENCAISSER}>
              <Banknote aria-hidden />
              Encaisser
            </Link>
          ) : (
            // Chargement complet pour que le service worker serve la page en cache.
            <a href={CHEMIN_ENCAISSER}>
              <Banknote aria-hidden />
              Encaisser
            </a>
          )}
        </Button>
      )}
    </header>
  );
}
