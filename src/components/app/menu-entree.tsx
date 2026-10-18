"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { useEnLigne } from "@/hooks/use-en-ligne";
import { estActive, type EntreeMenu } from "./navigation";

// L'icône est rendue côté serveur : un composant ne se transmet pas à un composant client.
type Props = { entree: Pick<EntreeMenu, "libelle" | "href" | "disponibleHorsLigne">; icone: React.ReactNode };

const STYLE_ENTREE =
  "h-10 gap-3 px-3 text-sm font-medium text-sidebar-foreground [&_svg]:size-4.5 data-active:bg-rose-fonce data-active:font-semibold data-active:text-white data-active:hover:bg-rose-fonce/90 data-active:hover:text-white";

// Barre repliée : le libellé sort du flux (le truncate laissait un trait à droite de l'icône) mais reste lu.
const LIBELLE = "group-data-[collapsible=icon]:sr-only";

/** Entrée du menu principal. Hors ligne, seules les entrées `disponibleHorsLigne` restent actives. */
export function MenuEntree({ entree, icone }: Props) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const enLigne = useEnLigne();
  const active = estActive(entree.href, pathname);

  if (!enLigne && !entree.disponibleHorsLigne) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          type="button"
          aria-disabled="true"
          tooltip={`${entree.libelle} : connexion nécessaire`}
          size="lg"
          className="h-auto min-h-10 cursor-not-allowed gap-3 px-3 aria-disabled:pointer-events-auto aria-disabled:opacity-100 py-1.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-transparent hover:text-sidebar-foreground/70 active:bg-transparent active:text-sidebar-foreground/70 [&_svg]:size-4.5"
        >
          {icone}
          <span className="grid leading-tight group-data-[collapsible=icon]:sr-only">
            <span>{entree.libelle}</span>
            <span className="text-xs font-normal">Connexion nécessaire</span>
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={entree.libelle} size="lg" className={STYLE_ENTREE}>
        {enLigne ? (
          <Link href={entree.href} aria-current={active ? "page" : undefined} onClick={() => setOpenMobile(false)}>
            {icone}
            <span className={LIBELLE}>{entree.libelle}</span>
          </Link>
        ) : (
          // Chargement complet : le service worker ne sert la page en cache qu'à une vraie navigation.
          <a href={entree.href} aria-current={active ? "page" : undefined}>
            {icone}
            <span className={LIBELLE}>{entree.libelle}</span>
          </a>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
