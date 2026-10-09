"use client";

import Link from "next/link";
import { Banknote, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { estActive } from "./navigation";
import { usePathname } from "next/navigation";

const CHEMIN_ENCAISSER = "/app/encaisser";

/** En-tête des petits écrans : ouvre le tiroir du menu, garde « Encaisser » à un geste. */
export function EnTeteApp() {
  const { toggleSidebar } = useSidebar();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background px-3 md:hidden">
      <Button type="button" variant="ghost" size="icon-lg" onClick={toggleSidebar} aria-label="Ouvrir le menu">
        <Menu aria-hidden />
      </Button>
      <span className="font-heading text-lg font-bold text-primary">IFSPA</span>
      {!estActive(CHEMIN_ENCAISSER, pathname) && (
        <Button asChild size="lg" className="ml-auto h-9 bg-rose-fonce px-3 text-white hover:bg-rose-fonce/90">
          <Link href={CHEMIN_ENCAISSER}>
            <Banknote aria-hidden />
            Encaisser
          </Link>
        </Button>
      )}
    </header>
  );
}
