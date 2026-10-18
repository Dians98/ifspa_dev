import Image from "next/image";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { CHEMIN_ACCUEIL_APP, type Role } from "@/lib/roles";
import logo from "../../../public/brand/logo-ifspa.png";
import { MenuEntree } from "./menu-entree";
import { MenuUtilisateur } from "./menu-utilisateur";
import { navigationPour } from "./navigation";

export function BarreLaterale({ utilisateurId, nom, role }: { utilisateurId: string; nom: string; role: Role }) {
  const groupes = navigationPour(role);

  return (
    <Sidebar collapsible="icon">
      {/* Repère pour les lecteurs d'écran : logo, menu et compte forment un seul bloc nommé. */}
      <aside aria-label="Barre latérale" className="flex h-full min-h-0 w-full flex-col">
      <SidebarHeader className="p-4 pb-2 group-data-[collapsible=icon]:p-2">
        <Link
          href={CHEMIN_ACCUEIL_APP}
          className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <Image
            src={logo}
            alt=""
            className="size-12 shrink-0 rounded-full bg-white p-0.5 group-data-[collapsible=icon]:size-8"
          />
          {/* sr-only plutôt que hidden : le lien garde son nom quand la barre est repliée. */}
          <span className="font-heading text-xl font-bold leading-tight text-sidebar-primary group-data-[collapsible=icon]:sr-only">
            IFSPA
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label="Menu principal" className="flex flex-col pb-2">
          {groupes.map((groupe) => (
            <SidebarGroup key={groupe.id} className="px-3 py-1.5 group-data-[collapsible=icon]:px-2">
              <SidebarGroupLabel className="h-7 px-3 text-[0.7rem] font-bold tracking-wider text-rose-clair uppercase">
                {groupe.libelle}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {groupe.entrees.map(({ id, icone: Icone, libelle, href, disponibleHorsLigne }) => (
                    <MenuEntree
                      key={id}
                      entree={{ libelle, href, disponibleHorsLigne }}
                      icone={<Icone aria-hidden />}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>

      <SidebarSeparator className="mx-0" />
      <SidebarFooter className="p-3 group-data-[collapsible=icon]:p-2">
        <MenuUtilisateur utilisateurId={utilisateurId} nom={nom} role={role} />
      </SidebarFooter>
      <SidebarRail aria-label="Replier ou déplier le menu" title="Replier ou déplier le menu" />
      </aside>
    </Sidebar>
  );
}
