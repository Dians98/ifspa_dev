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
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { CHEMIN_ACCUEIL_APP, type Role } from "@/lib/roles";
import logo from "../../../public/brand/logo-ifspa.png";
import { MenuEntree } from "./menu-entree";
import { MenuUtilisateur } from "./menu-utilisateur";
import { navigationPour } from "./navigation";

export function BarreLaterale({ nom, role }: { nom: string; role: Role }) {
  const groupes = navigationPour(role);

  return (
    <Sidebar>
      {/* Repère pour les lecteurs d'écran : logo, menu et compte forment un seul bloc nommé. */}
      <aside aria-label="Barre latérale" className="flex h-full min-h-0 w-full flex-col">
      <SidebarHeader className="p-4 pb-2">
        <Link
          href={CHEMIN_ACCUEIL_APP}
          className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <Image src={logo} alt="" className="size-12 rounded-full bg-white p-0.5" />
          <span className="leading-tight">
            <span className="block font-heading text-xl font-bold text-sidebar-primary">IFSPA</span>
            <span className="block text-xs text-sidebar-foreground/80">Gestion de l&apos;écolage</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label="Menu principal" className="flex flex-col pb-2">
          {groupes.map((groupe) => (
            <SidebarGroup key={groupe.id} className="px-3 py-1.5">
              <SidebarGroupLabel className="h-7 px-3 text-[0.7rem] font-bold tracking-wider text-rose-clair uppercase">
                {groupe.libelle}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {groupe.entrees.map(({ id, icone: Icone, libelle, href, principale }) => (
                    <MenuEntree key={id} entree={{ libelle, href, principale }} icone={<Icone aria-hidden />} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>

      <SidebarSeparator className="mx-0" />
      <SidebarFooter className="gap-3 p-3">
        <MenuUtilisateur nom={nom} role={role} />
        <p className="px-2 text-[0.7rem] text-sidebar-foreground/75">
          © {new Date().getFullYear()} IFSPA — Conçu et réalisé par{" "}
          <a
            href="https://dians98.vercel.app/"
            target="_blank"
            rel="noopener"
            className="underline hover:text-sidebar-primary"
          >
            Diano ANDRIANTSALAMA
            <span className="sr-only"> (nouvel onglet)</span>
          </a>
        </p>
      </SidebarFooter>
      </aside>
    </Sidebar>
  );
}
