"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { DonneesRecu } from "@/lib/encaissement";
import { Ticket, type LargeurTicket } from "./ticket";

// Impression directe dans la page : le ticket est monté sous <body> (portail), masqué à l'écran ;
// la feuille de style d'impression (globals.css) cache tout le reste.

const CLE_LARGEUR = "ifspa-ticket-largeur";
const EVENEMENT = "ifspa-options-ticket";
const ID_ZONE = "zone-impression-ticket";
const ID_STYLE = "style-page-ticket";

// Repli quand le stockage du navigateur est refusé : le choix tient au moins jusqu'au rechargement.
const memoire: Record<string, string> = {};

function lire(cle: string): string | null {
  try {
    return localStorage.getItem(cle) ?? memoire[cle] ?? null;
  } catch {
    return memoire[cle] ?? null;
  }
}

function ecrire(cle: string, valeur: string) {
  memoire[cle] = valeur;
  try {
    localStorage.setItem(cle, valeur);
  } catch {
    // Stockage indisponible : la mémoire suffit.
  }
  window.dispatchEvent(new Event(EVENEMENT));
}

function abonner(rappel: () => void) {
  window.addEventListener("storage", rappel);
  window.addEventListener(EVENEMENT, rappel);
  return () => {
    window.removeEventListener("storage", rappel);
    window.removeEventListener(EVENEMENT, rappel);
  };
}

export function lireLargeur(): LargeurTicket {
  return lire(CLE_LARGEUR) === "58" ? 58 : 80;
}

/** Largeur du rouleau, mémorisée par poste. */
export function useOptionsTicket() {
  const largeur = useSyncExternalStore(abonner, lireLargeur, () => 80 as LargeurTicket);
  return {
    largeur,
    changerLargeur: (l: LargeurTicket) => ecrire(CLE_LARGEUR, String(l)),
  };
}

const sansAbonnement = () => () => {};

/** Portail du ticket à imprimer et de son double pour l'institut, toujours imprimé. N'existe qu'une fois la page hydratée. */
export function ZoneImpressionTicket({ donnees }: { donnees: DonneesRecu | null }) {
  const monte = useSyncExternalStore(sansAbonnement, () => true, () => false);
  const { largeur } = useOptionsTicket();
  if (!monte || !donnees) return null;
  return createPortal(
    <div id={ID_ZONE} className="zone-impression">
      <Ticket donnees={donnees} largeur={largeur} />
      <Ticket donnees={donnees} largeur={largeur} double />
    </div>,
    document.body,
  );
}

/** Hauteur du ticket en mm : @page ne sait pas « auto » partout, on la lui donne mesurée. */
function mesurerTicketMm(zone: HTMLElement): number {
  const avant = zone.getAttribute("style");
  zone.style.cssText = "display:block;position:fixed;left:-10000px;top:0;visibility:hidden";
  const px = zone.firstElementChild?.getBoundingClientRect().height ?? 0;
  if (avant === null) zone.removeAttribute("style");
  else zone.setAttribute("style", avant);
  return Math.ceil((px * 25.4) / 96) + 2;
}

/** Imprime le ticket monté par `ZoneImpressionTicket`. Sans effet si aucun ticket n'est monté. */
export async function imprimerTicket(): Promise<void> {
  const zone = document.getElementById(ID_ZONE);
  if (!zone) return;
  const images = Array.from(zone.querySelectorAll("img"));
  await Promise.all(images.map((i) => i.decode().catch(() => undefined)));
  if (document.fonts) await document.fonts.ready;

  let style = document.getElementById(ID_STYLE);
  if (!style) {
    style = document.createElement("style");
    style.id = ID_STYLE;
    document.head.appendChild(style);
  }
  style.textContent = `@page { size: ${lireLargeur()}mm ${mesurerTicketMm(zone)}mm; margin: 0; }`;
  window.print();
}
