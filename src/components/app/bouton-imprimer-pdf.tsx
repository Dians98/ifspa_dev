"use client";

import { useState, type ComponentProps } from "react";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const DELAI_NETTOYAGE_MS = 120_000;

type Props = Omit<ComponentProps<typeof Button>, "onClick" | "asChild"> & {
  /** Adresse du PDF, servi en `inline` : il est chargé puis envoyé à l'imprimante sans quitter la page. */
  url: string;
  /** Message affiché si le document n'a pas pu être chargé. */
  messageErreur?: string;
};

/** Imprime un PDF dans un iframe caché ; si le navigateur refuse, ouvre le document dans un nouvel onglet. */
export function BoutonImprimerPdf({
  url,
  messageErreur = "Le document n'a pas pu être chargé. Vérifiez votre connexion, puis réessayez.",
  children,
  disabled,
  ...props
}: Props) {
  const [enCours, setEnCours] = useState(false);

  async function imprimer() {
    setEnCours(true);
    let adresse: string | null = null;
    try {
      const reponse = await fetch(url, { credentials: "same-origin" });
      // 401, 404 : la route renvoie un message en texte, affichable tel quel.
      if (!reponse.ok && reponse.headers.get("content-type")?.startsWith("text/plain")) {
        toast.error(await reponse.text());
        setEnCours(false);
        return;
      }
      if (!reponse.ok || !reponse.headers.get("content-type")?.includes("pdf")) throw new Error("Réponse inattendue");
      // Blob local : même origine, donc `print()` reste autorisé sur l'iframe.
      adresse = URL.createObjectURL(await reponse.blob());
    } catch {
      toast.error(messageErreur);
      setEnCours(false);
      return;
    }

    const lien = adresse;
    const cadre = document.createElement("iframe");
    cadre.setAttribute("aria-hidden", "true");
    cadre.tabIndex = -1;
    cadre.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
    const nettoyer = () => {
      cadre.remove();
      URL.revokeObjectURL(lien);
    };
    const repli = () => {
      // L'adresse du serveur plutôt que le blob : le lecteur PDF enregistre sous le nom de la route (releve-IF-2025-0001.pdf), pas sous un identifiant.
      window.open(url, "_blank", "noopener");
      setEnCours(false);
      nettoyer();
    };

    cadre.onload = () => {
      try {
        const fenetre = cadre.contentWindow;
        if (!fenetre) throw new Error("Pas de fenêtre");
        fenetre.addEventListener("afterprint", nettoyer, { once: true });
        fenetre.focus();
        fenetre.print();
        setEnCours(false);
        setTimeout(nettoyer, DELAI_NETTOYAGE_MS);
      } catch {
        repli();
      }
    };
    cadre.onerror = repli;
    cadre.src = lien;
    document.body.appendChild(cadre);
  }

  return (
    <Button type="button" onClick={imprimer} disabled={disabled || enCours} aria-busy={enCours} {...props}>
      {enCours ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Printer aria-hidden />}
      {children}
    </Button>
  );
}
