"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OngletFiche } from "./onglets";

const DECLENCHEUR =
  "h-11 flex-none rounded-t-md rounded-b-none px-4 text-sm font-medium text-muted-foreground data-active:font-semibold data-active:text-primary group-data-horizontal/tabs:after:bottom-0 group-data-horizontal/tabs:after:h-[3px] after:bg-rose max-md:min-w-24";

/** Quatre onglets de la fiche ; l'onglet actif est souligné en rose. */
export function OngletsFiche({
  defaut,
  nbPaiements,
  ecolage,
  identite,
  parcours,
  paiements,
}: {
  defaut: OngletFiche;
  nbPaiements: number;
  ecolage: ReactNode;
  identite: ReactNode;
  parcours: ReactNode;
  paiements: ReactNode;
}) {
  return (
    <Tabs defaultValue={defaut} className="gap-5">
      <div className="overflow-x-auto border-b">
        <TabsList variant="line" aria-label="Sections de la fiche" className="h-11 w-max min-w-full justify-start gap-1 group-data-horizontal/tabs:h-11">
          <TabsTrigger value="ecolage" className={DECLENCHEUR}>
            Écolage
          </TabsTrigger>
          <TabsTrigger value="identite" className={DECLENCHEUR}>
            Identité
          </TabsTrigger>
          <TabsTrigger value="parcours" className={DECLENCHEUR}>
            Parcours
          </TabsTrigger>
          <TabsTrigger value="paiements" className={DECLENCHEUR}>
            Paiements ({nbPaiements})
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="ecolage" className="text-base">
        {ecolage}
      </TabsContent>
      <TabsContent value="identite" className="text-base">
        {identite}
      </TabsContent>
      <TabsContent value="parcours" className="text-base">
        {parcours}
      </TabsContent>
      <TabsContent value="paiements" className="text-base">
        {paiements}
      </TabsContent>
    </Tabs>
  );
}
