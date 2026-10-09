"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CircleAlert, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-client";

const schema = z.object({
  email: z.string().trim().min(1, "Saisissez votre adresse e-mail.").email("Saisissez une adresse e-mail valide."),
  password: z.string().min(1, "Saisissez votre mot de passe."),
});

type Valeurs = z.infer<typeof schema>;

const MESSAGE_IDENTIFIANTS = "Adresse e-mail ou mot de passe incorrect.";
const MESSAGE_DESACTIVE = "Ce compte est désactivé. Contactez l'administrateur.";
const MESSAGE_RESEAU = "Connexion au serveur impossible. Vérifiez votre connexion Internet.";

function messageDepuisErreur(erreur: { code?: string; status?: number } | null | undefined): string {
  if (!erreur) return MESSAGE_IDENTIFIANTS;
  if (erreur.code === "BANNED_USER") return MESSAGE_DESACTIVE;
  // 0 : requête sans réponse ; 5xx : serveur injoignable ou en panne (proxy, base indisponible).
  if (!erreur.status || erreur.status >= 500) return MESSAGE_RESEAU;
  return MESSAGE_IDENTIFIANTS;
}

export function FormulaireConnexion({ destination }: { destination: string }) {
  const router = useRouter();
  const [montrer, setMontrer] = useState(false);
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);
  // Reste vrai jusqu'à la navigation : évite un second clic pendant le changement de page.
  const [redirection, setRedirection] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<Valeurs>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(valeurs: Valeurs) {
    setErreurServeur(null);
    try {
      const { error } = await signIn.email({ email: valeurs.email, password: valeurs.password });
      if (error) {
        setErreurServeur(messageDepuisErreur(error));
        return;
      }
    } catch {
      setErreurServeur(MESSAGE_RESEAU);
      return;
    }
    setRedirection(true);
    router.replace(destination);
    router.refresh();
  }

  const enCours = isSubmitting || redirection;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup className="gap-4">
        <Controller
          name="email"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="gap-1.5">
              <FieldLabel htmlFor="email">Adresse e-mail</FieldLabel>
              <Input
                {...field}
                id="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="nom@ifspa.mg"
                aria-invalid={fieldState.invalid}
                aria-describedby={fieldState.invalid ? "email-erreur" : undefined}
                className="h-11"
              />
              {fieldState.invalid && <FieldError id="email-erreur" errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="password"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="gap-1.5">
              <FieldLabel htmlFor="mot-de-passe">Mot de passe</FieldLabel>
              <div className="relative">
                <Input
                  {...field}
                  id="mot-de-passe"
                  type={montrer ? "text" : "password"}
                  autoComplete="current-password"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={fieldState.invalid ? "mot-de-passe-erreur" : undefined}
                  className="h-11 pr-11"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setMontrer((v) => !v)}
                  aria-label={montrer ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  aria-pressed={montrer}
                  className="absolute inset-y-0 right-0 size-11 rounded-l-none text-muted-foreground hover:text-primary"
                >
                  {montrer ? <EyeOff className="size-4.5" aria-hidden /> : <Eye className="size-4.5" aria-hidden />}
                </Button>
              </div>
              {fieldState.invalid && <FieldError id="mot-de-passe-erreur" errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {/* Zone d'annonce toujours présente : les lecteurs d'écran annoncent le message à son apparition. */}
        <div role="alert" className={erreurServeur ? undefined : "hidden"}>
          {erreurServeur && (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2.5 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {erreurServeur}
            </p>
          )}
        </div>

        <Button type="submit" size="lg" disabled={enCours} className="h-11 w-full text-base">
          {enCours && <Loader2 className="animate-spin" aria-hidden />}
          {enCours ? "Connexion en cours…" : "Se connecter"}
        </Button>
      </FieldGroup>
    </form>
  );
}
