"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { estActive, type EntreeMenu } from "./navigation";

// L'icône est rendue côté serveur : un composant ne se transmet pas à un composant client.
type Props = { entree: Pick<EntreeMenu, "libelle" | "href">; icone: React.ReactNode };

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
        tooltip={entree.libelle}
        size="lg"
        className="h-10 gap-3 px-3 text-sm font-medium text-sidebar-foreground [&_svg]:size-4.5 data-active:bg-rose-fonce data-active:font-semibold data-active:text-white data-active:hover:bg-rose-fonce/90 data-active:hover:text-white"
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
