"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { estActive, type EntreeMenu } from "./navigation";

// L'icône est rendue côté serveur : un composant ne se transmet pas à un composant client.
type Props = { entree: Pick<EntreeMenu, "libelle" | "href" | "principale">; icone: React.ReactNode };

/**
 * Entrée unique du menu principal. Point d'extension : l'état hors ligne
 * (grisé + « Connexion nécessaire » pour les entrées sans `disponibleHorsLigne`) s'ajoutera ici.
 */
export function MenuEntree({ entree, icone }: Props) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const active = estActive(entree.href, pathname);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        size="lg"
        className={cn(
          "h-10 gap-3 px-3 text-sm font-medium text-sidebar-foreground",
          "data-active:bg-sidebar-primary data-active:font-semibold data-active:text-sidebar-primary-foreground",
          "[&_svg]:size-4.5",
          entree.principale
            ? "bg-rose-fonce text-white hover:bg-rose-fonce/90 hover:text-white data-active:bg-rose-fonce data-active:text-white data-active:ring-2 data-active:ring-white"
            : "data-active:[&_svg]:text-rose-fonce",
        )}
      >
        <Link
          href={entree.href}
          aria-current={active ? "page" : undefined}
          onClick={() => setOpenMobile(false)}
        >
          {icone}
          <span>{entree.libelle}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
