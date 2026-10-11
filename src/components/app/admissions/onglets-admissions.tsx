"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ONGLETS = [
  { href: "/app/admissions", libelle: "Classes" },
  { href: "/app/admissions/historique", libelle: "Historique" },
] as const;

/** Onglets en vraies pages : l'adresse et le retour arrière restent justes. */
export function OngletsAdmissions() {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections du passage en année supérieure" className="mb-5 overflow-x-auto border-b">
      <ul className="flex min-w-max gap-1">
        {ONGLETS.map(({ href, libelle }) => {
          const actif = pathname === href;
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
