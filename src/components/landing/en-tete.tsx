"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { LogIn, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import logo from "../../../public/brand/logo-ifspa.png";

const LIENS = [
  { href: "#institut", label: "L'institut" },
  { href: "#filieres", label: "Filières" },
  { href: "#admission", label: "Admission" },
  { href: "#galerie", label: "Galerie" },
  { href: "#agrements", label: "Agréments" },
  { href: "#contact", label: "Contact" },
];

// « chiffres » n'a pas de lien : il compte pour la section qui le précède.
const SECTIONS = ["institut", "chiffres", "filieres", "admission", "galerie", "agrements", "contact"];

/** Section en cours de lecture ; null tant qu'on est sur l'accueil. */
function useSectionActive() {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const visibles = new Set<string>();
    const io = new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) {
          if (e.isIntersecting) visibles.add(e.target.id);
          else visibles.delete(e.target.id);
        }
        const courante = SECTIONS.filter((id) => visibles.has(id)).pop();
        if (courante) setActive(courante === "chiffres" ? "institut" : courante);
        else if (window.scrollY < window.innerHeight * 0.5) setActive(null);
      },
      // Bande fine à 40 % de la hauteur de l'écran : une seule section la traverse.
      { rootMargin: "-40% 0px -59% 0px" },
    );
    SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);
  return active;
}

export function EnTete() {
  const active = useSectionActive();
  const sansAnimation = useReducedMotion();
  const [decolle, setDecolle] = useState(false);
  useEffect(() => {
    const maj = () => setDecolle(window.scrollY > 8);
    maj();
    window.addEventListener("scroll", maj, { passive: true });
    return () => window.removeEventListener("scroll", maj);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-background/95 backdrop-blur transition-shadow duration-300 supports-[backdrop-filter]:bg-background/85",
        decolle && "shadow-sm",
      )}
    >
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 rounded-md">
          <Image src={logo} alt="Logo de l'IFSPA" width={65} height={44} className="h-11 w-auto" priority />
          <span className="leading-tight">
            <span className="block font-heading text-xl font-bold text-primary">IFSPA</span>
            <span className="hidden text-xs text-muted-foreground sm:block">
              Paramédicaux · Toamasina
            </span>
          </span>
        </Link>

        <nav aria-label="Navigation principale" className="hidden items-center gap-8 text-sm font-medium lg:flex">
          {LIENS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              aria-current={active === l.href.slice(1) ? "location" : undefined}
              className={cn(
                "relative py-2 transition-colors hover:text-primary",
                active === l.href.slice(1) ? "text-primary" : "text-muted-foreground",
              )}
            >
              {l.label}
              {active === l.href.slice(1) && (
                <motion.span
                  layoutId="soulignement-nav"
                  aria-hidden
                  className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-rose"
                  transition={sansAnimation ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 34 }}
                />
              )}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild size="lg">
            <Link href="/connexion">
              <LogIn />
              Se connecter
            </Link>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Ouvrir le menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle className="px-4 pt-4 font-heading text-lg">Menu</SheetTitle>
              <nav aria-label="Navigation mobile" className="flex flex-col px-2">
                {LIENS.map((l) => (
                  <SheetClose asChild key={l.href}>
                    <a
                      href={l.href}
                      aria-current={active === l.href.slice(1) ? "location" : undefined}
                      className={cn(
                        "rounded-md px-3 py-3 text-base font-medium hover:bg-secondary",
                        active === l.href.slice(1) && "bg-rose-pale text-rose-fonce",
                      )}
                    >
                      {l.label}
                    </a>
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
