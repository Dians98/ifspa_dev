import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import { TitrePage } from "@/components/app/titre-page";

export const metadata: Metadata = { title: "Tableau de bord" };

export default function PageTableauDeBord() {
  return (
    <>
      <TitrePage titre="Tableau de bord" />
      <section className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-16 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-rose-pale text-rose-fonce">
          <LayoutDashboard className="size-6" aria-hidden />
        </span>
        <p className="text-muted-foreground">Les indicateurs seront bientôt disponibles ici.</p>
      </section>
    </>
  );
}
