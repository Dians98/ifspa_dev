"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const ONGLETS_PARAMETRES = [
  { href: "/app/parametres/filieres", libelle: "Filières" },
  { href: "/app/parametres/annees", libelle: "Années scolaires" },
  { href: "/app/parametres/tarifs", libelle: "Tarifs" },
  { href: "/app/parametres/utilisateurs", libelle: "Utilisateurs" },
  { href: "/app/parametres/import", libelle: "Reprise des données" },
] as const;

/** Onglets en vraies pages : l'adresse, le retour arrière et l'actualisation restent justes. */
export function OngletsParametres() {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections des paramètres" className="mb-5 overflow-x-auto border-b">
      <ul className="flex min-w-max gap-1">
        {ONGLETS_PARAMETRES.map(({ href, libelle }) => {
          const actif = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={actif ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-11 items-center rounded-t-md border-b-[3px] px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  actif
                    ? "border-rose font-semibold text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-primary",
                )}
              >
                {libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
