"use client";

import Image from "next/image";
import Link from "next/link";
import { LogIn, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import logo from "../../../public/brand/logo-ifspa.png";

const LIENS = [
  { href: "#institut", label: "L'institut" },
  { href: "#filieres", label: "Filières" },
  { href: "#galerie", label: "Galerie" },
  { href: "#agrements", label: "Agréments" },
  { href: "#contact", label: "Contact" },
];

export function EnTete() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 rounded-md">
          <Image src={logo} alt="Logo de l'IFSPA" className="h-11 w-auto" priority />
          <span className="leading-tight">
            <span className="block font-heading text-xl font-bold text-primary">IFSPA</span>
            <span className="hidden text-xs text-muted-foreground sm:block">
              Paramédicaux · Toamasina
            </span>
          </span>
        </Link>

        <nav aria-label="Navigation principale" className="hidden items-center gap-8 text-sm font-medium lg:flex">
          {LIENS.map((l) => (
            <a key={l.href} href={l.href} className="text-muted-foreground transition-colors hover:text-primary">
              {l.label}
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
                    <a href={l.href} className="rounded-md px-3 py-3 text-base font-medium hover:bg-secondary">
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
