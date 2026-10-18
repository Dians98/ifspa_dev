"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CircleCheck, CircleAlert, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OBJETS_CONTACT } from "@/lib/contact";
import { envoyerMessageContact, type EtatContact } from "@/server/actions/contact";
import { Turnstile } from "./turnstile";

const INITIAL: EtatContact = { statut: "initial" };

function Erreur({ id, texte, alerte }: { id: string; texte?: string; alerte?: boolean }) {
  if (!texte) return null;
  return (
    <p
      id={id}
      className="text-sm text-destructive"
      {...(alerte ? { role: "alert", tabIndex: -1, "data-focus-erreur": true } : {})}
    >
      {texte}
    </p>
  );
}

export function FormulaireContact({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const [etat, action, envoiEnCours] = useActionState(envoyerMessageContact, INITIAL);
  const e = etat.erreurs ?? {};
  const v = etat.valeurs ?? {};
  const formulaire = useRef<HTMLFormElement>(null);
  const [captchaIndisponible, setCaptchaIndisponible] = useState(false);

  // Après un refus, le focus va au premier champ en erreur, sinon au résumé.
  useEffect(() => {
    if (etat.statut !== "erreur") return;
    const cible =
      formulaire.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      formulaire.current?.querySelector<HTMLElement>("[data-focus-erreur]");
    cible?.focus();
  }, [etat]);

  if (etat.statut === "succes") {
    return (
      <div role="status" className="flex flex-col items-center gap-4 rounded-2xl bg-white p-10 text-center text-foreground shadow-xl">
        <span className="grid size-14 place-items-center rounded-full bg-paye-pale text-paye">
          <CircleCheck className="size-7" aria-hidden />
        </span>
        <p className="font-heading text-2xl font-semibold text-primary">Message envoyé</p>
        <p className="max-w-sm text-muted-foreground">{etat.message}</p>
      </div>
    );
  }

  return (
    <form ref={formulaire} action={action} noValidate className="rounded-2xl bg-white p-6 text-foreground shadow-xl sm:p-8">
      <h3 className="font-heading text-2xl font-semibold text-primary">Écrire au secrétariat</h3>
      <p className="mt-1 text-sm text-muted-foreground">Les champs marqués * sont obligatoires.</p>

      {etat.statut === "erreur" && etat.message && (
        <p role="alert" tabIndex={-1} data-focus-erreur className="mt-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {etat.message}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="c-nom">Nom et prénom *</Label>
          <Input id="c-nom" name="nom" autoComplete="name" defaultValue={v.nom} aria-invalid={!!e.nom} aria-describedby="c-nom-err" className="h-11" />
          <Erreur id="c-nom-err" texte={e.nom} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="c-tel">Téléphone *</Label>
          <Input id="c-tel" name="telephone" type="tel" autoComplete="tel" placeholder="034 00 000 00" defaultValue={v.telephone} aria-invalid={!!e.telephone} aria-describedby="c-tel-err" className="h-11" />
          <Erreur id="c-tel-err" texte={e.telephone} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="c-email">Courriel</Label>
          <Input id="c-email" name="email" type="email" autoComplete="email" defaultValue={v.email} aria-invalid={!!e.email} aria-describedby="c-email-err" className="h-11" />
          <Erreur id="c-email-err" texte={e.email} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="c-objet">Objet *</Label>
          <select
            id="c-objet"
            name="objet"
            // key : React ne relit pas defaultValue d'un select déjà monté, l'objet choisi serait perdu après un refus.
            key={v.objet ?? "defaut"}
            defaultValue={v.objet ?? OBJETS_CONTACT[0]}
            aria-invalid={!!e.objet}
            aria-describedby={e.objet ? "c-objet-err" : undefined}
            className="h-11 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {OBJETS_CONTACT.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <Erreur id="c-objet-err" texte={e.objet} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="c-message">Message *</Label>
          <Textarea id="c-message" name="message" rows={5} defaultValue={v.message} aria-invalid={!!e.message} aria-describedby="c-message-err" />
          <Erreur id="c-message-err" texte={e.message} />
        </div>

        {/* Anti-robot Cloudflare Turnstile : invisible ou simple case à cocher */}
        {turnstileSiteKey && (
          <div className="grid gap-1.5 sm:col-span-2">
            <Turnstile
              siteKey={turnstileSiteKey}
              reinitialiser={etat}
              onIndisponible={() => setCaptchaIndisponible(true)}
            />
            <Erreur id="c-captcha-err" texte={captchaIndisponible ? undefined : e.captcha} alerte />
          </div>
        )}

        {/* Champ piège invisible pour les robots */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="c-site">Site web</label>
          <input id="c-site" name="site_web" type="text" tabIndex={-1} autoComplete="off" />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button type="submit" size="lg" disabled={envoiEnCours} className="h-12 w-full bg-rose-fonce text-white hover:bg-rose-fonce/90 sm:w-auto sm:px-8">
          {envoiEnCours ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          {envoiEnCours ? "Envoi en cours…" : "Envoyer le message"}
        </Button>
      </div>
    </form>
  );
}
