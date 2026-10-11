"use client";

import { Printer } from "lucide-react";
import { imprimerTicket, useOptionsTicket, ZoneImpressionTicket } from "@/components/recu/imprimer-ticket";
import { OptionsTicket } from "@/components/recu/options-ticket";
import { Ticket } from "@/components/recu/ticket";
import { Button } from "@/components/ui/button";
import type { DonneesRecu } from "@/lib/encaissement";

/** Aperçu à l'échelle réelle du ticket, avec le papier du poste ; « Imprimer » ouvre l'impression directe. */
export function ApercuRecu({ donnees }: { donnees: DonneesRecu }) {
  const { largeur } = useOptionsTicket();

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
        <OptionsTicket />
        <Button type="button" className="max-md:h-11" onClick={() => void imprimerTicket()}>
          <Printer aria-hidden />
          Imprimer le ticket
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl bg-muted px-4 py-8">
        <div className="mx-auto w-fit shadow-lg ring-1 ring-foreground/10">
          <Ticket donnees={donnees} largeur={largeur} />
        </div>
      </div>
      <ZoneImpressionTicket donnees={donnees} />
    </div>
  );
}
