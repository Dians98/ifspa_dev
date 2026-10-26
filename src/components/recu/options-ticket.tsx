"use client";

import { useId } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useOptionsTicket } from "./imprimer-ticket";

/** Papier du poste (80 ou 58 mm), mémorisé sur ce poste. Le double pour l'institut s'imprime toujours. */
export function OptionsTicket({ className }: { className?: string }) {
  const id = useId();
  const { largeur, changerLargeur } = useOptionsTicket();

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <RadioGroup
          value={String(largeur)}
          onValueChange={(v) => changerLargeur(v === "58" ? 58 : 80)}
          aria-label="Largeur du rouleau"
          className="flex w-auto items-center gap-4"
        >
          {[80, 58].map((l) => (
            <div key={l} className="flex items-center gap-2">
              <RadioGroupItem value={String(l)} id={`${id}-${l}`} />
              <Label htmlFor={`${id}-${l}`} className="min-h-6 cursor-pointer">
                Rouleau {l} mm
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}
