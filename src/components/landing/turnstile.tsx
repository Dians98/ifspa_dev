"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Widget anti-robot Cloudflare Turnstile. Invisible la plupart du temps,
 * il n'affiche une case à cocher qu'en cas de doute. Le jeton est transmis au
 * formulaire dans le champ caché « cf-turnstile-response ».
 * `reinitialiser` : change de valeur pour redemander un jeton (un jeton ne sert qu'une fois).
 */
export function Turnstile({
  siteKey,
  reinitialiser,
  onIndisponible,
}: {
  siteKey: string;
  reinitialiser?: unknown;
  /** Le script Cloudflare n'a pas pu se charger : le formulaire masque alors le message « Cochez la case ». */
  onIndisponible?: () => void;
}) {
  const conteneur = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [scriptPret, setScriptPret] = useState(false);
  const [echecChargement, setEchecChargement] = useState(false);

  useEffect(() => {
    if (!scriptPret || !conteneur.current || !window.turnstile || widget.current) return;
    widget.current = window.turnstile.render(conteneur.current, {
      sitekey: siteKey,
      language: "fr",
      theme: "light",
      size: "flexible",
    });
    return () => {
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [scriptPret, siteKey]);

  useEffect(() => {
    if (widget.current) window.turnstile?.reset(widget.current);
  }, [reinitialiser]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptPret(true)}
        onError={() => {
          setEchecChargement(true);
          onIndisponible?.();
        }}
      />
      <div ref={conteneur} className="min-h-[65px]" />
      {echecChargement && (
        <p role="alert" data-focus-erreur tabIndex={-1} className="text-sm text-destructive">
          La vérification anti-robot n&apos;a pas pu se charger. Vérifiez votre connexion Internet, rechargez la page,
          ou appelez directement le secrétariat.
        </p>
      )}
    </>
  );
}
