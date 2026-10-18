"use client";

import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Explique pourquoi une action n'est pas proposée (lisible au toucher comme au clavier, contrairement à une infobulle). */
export function MotifsRefus({ motifs }: { motifs: string[] }) {
  const uniques = [...new Set(motifs)];
  if (uniques.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Pourquoi certaines actions ne sont pas proposées" className="text-muted-foreground max-md:size-11">
          <Info aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} className="w-80 max-w-[calc(100vw-2rem)]">
        {uniques.map((m) => (
          <p key={m}>{m}</p>
        ))}
      </PopoverContent>
    </Popover>
  );
}
