"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** À placer dans un `DialogContent` : le mot de passe n'est lisible qu'ici, le serveur ne le redonne plus. */
export function ResultatMotDePasse({
  titre,
  description,
  motDePasse,
}: {
  titre: string;
  description: string;
  motDePasse: string;
}) {
  // « echec » garde le texte visible et sélectionnable : la copie peut être refusée (page non sécurisée, autorisation).
  const [copie, setCopie] = useState<"non" | "oui" | "echec">("non");

  async function copier() {
    try {
      await navigator.clipboard.writeText(motDePasse);
      setCopie("oui");
    } catch {
      setCopie("echec");
    }
  }

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="text-lg">{titre}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="rounded-lg bg-rose-pale px-4 py-4 text-center">
        <p className="text-xs font-medium text-rose-fonce">Mot de passe provisoire</p>
        <p className="mt-1 font-mono text-2xl font-semibold tracking-wider break-all text-primary select-all">
          {motDePasse}
        </p>
      </div>

      <p className="rounded-lg bg-attention-pale px-3 py-2 text-sm text-attention">
        Ce mot de passe ne s&apos;affichera plus. Notez-le ou copiez-le maintenant, puis remettez-le à la personne. En cas
        de perte, générez-en un autre avec « Réinitialiser le mot de passe ».
      </p>

      <p aria-live="polite" className="min-h-5 text-sm">
        {copie === "oui" && <span className="font-medium text-paye">Mot de passe copié.</span>}
        {copie === "echec" && (
          <span className="text-destructive">Copie impossible : sélectionnez le mot de passe et copiez-le à la main.</span>
        )}
      </p>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => void copier()} className="max-md:h-11">
          {copie === "oui" ? <Check aria-hidden /> : <Copy aria-hidden />}
          Copier le mot de passe
        </Button>
        <DialogClose asChild>
          <Button type="button" className="max-md:h-11">
            Terminé
          </Button>
        </DialogClose>
      </DialogFooter>
    </div>
  );
}
