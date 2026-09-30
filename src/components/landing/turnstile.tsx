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
export function Turnstile({ siteKey, reinitialiser }: { siteKey: string; reinitialiser?: unknown }) {
  const conteneur = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [scriptPret, setScriptPret] = useState(false);

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
      />
      <div ref={conteneur} className="min-h-[65px]" />
    </>
  );
}
