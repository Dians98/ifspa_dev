"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { flushSync } from "react-dom";
import { Banknote, Check, CircleCheck, Loader2, Printer, Smartphone, TriangleAlert } from "lucide-react";
import { ChampFormulaire, attributsChamp } from "@/components/app/parametres/champ-formulaire";
import { imprimerTicket, ZoneImpressionTicket } from "@/components/recu/imprimer-ticket";
import { OptionsTicket } from "@/components/recu/options-ticket";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useEtatHorsLigne } from "@/hooks/use-etat-hors-ligne";
import type { ModePaiement, OperateurMobile } from "@/generated/prisma/enums";
import { montantPourCases, repartirPaiement, type Repartition } from "@/lib/ecolage";
import { LIBELLE_OPERATEUR, type DonneesRecu } from "@/lib/encaissement";
import { formaterAriary, formaterNombre, lireMontant } from "@/lib/montant";
import { cn } from "@/lib/utils";
import { encaisserHorsLigne, situationLocale } from "@/lib/hors-ligne/guichet-local";
import { nouvelIdentifiant } from "@/lib/hors-ligne/identifiant";
import { chargerSituationGuichet, encaisser } from "@/server/actions/paiements";
import type { EcheanceGuichet, ResultatGuichet, SituationGuichet } from "@/lib/encaissement-hors-ligne";
import { BadgesSituation } from "./badge-situation";
import { BandeauConnexion } from "./bandeau-connexion";
import { ListeEcheances, type ImputationCase } from "./liste-echeances";
import { RechercheEtudiant } from "./recherche-etudiant";

const MESSAGE_CHARGEMENT = "La situation de l'étudiant n'a pas pu être chargée. Vérifiez la connexion Internet, puis réessayez.";
const MESSAGE_RESEAU_ENCAISSEMENT =
  "La connexion a échoué : le paiement n'est pas confirmé. Appuyez de nouveau sur « Encaisser » : un même paiement n'est jamais enregistré deux fois.";

const OPERATEURS = Object.keys(LIBELLE_OPERATEUR) as OperateurMobile[];

type Bandeau = { paiementId: string | null; titre: string; detail: string };

const MESSAGE_RESEAU_COUPE =
  "La connexion est coupée : ce paiement n'est peut-être pas arrivé au serveur. L'écran passe en mode hors ligne : appuyez de nouveau sur « Encaisser » sans changer la saisie, il ne sera compté qu'une fois.";

export type Utilisateur = { id: string; nom: string };

type Props = {
  utilisateur: Utilisateur;
  derniersServis: ResultatGuichet[];
  situationInitiale: SituationGuichet | null;
  etudiantIntrouvable: boolean;
};

export function Guichet({ utilisateur, derniersServis, situationInitiale, etudiantIntrouvable }: Props) {
  // Un seul appel : chaque appel lancerait sa propre synchronisation.
  const hl = useEtatHorsLigne(utilisateur.id);
  const horsLigne = hl.etat === "hors-ligne";
  const [situation, setSituation] = useState<SituationGuichet | null>(situationInitiale);
  const [versionForm, setVersionForm] = useState(0);
  const [chargement, setChargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(
    etudiantIntrouvable ? "Cet étudiant n'existe plus. Recherchez-le par son nom ou son matricule." : null,
  );
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [recu, setRecu] = useState<DonneesRecu | null>(null);
  const [bandeau, setBandeau] = useState<Bandeau | null>(null);

  async function ouvrir(id: string, message: string | null = null) {
    setChargement(id);
    setErreur(null);
    try {
      const s = horsLigne ? await situationLocale(id) : await chargerSituationGuichet(id);
      if (!s) {
        setErreur(
          horsLigne
            ? "Cet étudiant n'est pas dans la liste de ce poste. Recherchez-le de nouveau."
            : "Cet étudiant n'existe plus. Recherchez-le de nouveau.",
        );
        setSituation(null);
        return;
      }
      setSituation(s);
      setVersionForm((v) => v + 1);
      setAvertissement(message);
      if (!message) setBandeau(null);
    } catch {
      setErreur(horsLigne ? "La liste de ce poste n'a pas pu être lue. Rechargez la page." : MESSAGE_CHARGEMENT);
    } finally {
      setChargement(null);
    }
  }

  function apresSucces(donnees: DonneesRecu, message: string) {
    // Le ticket doit être dans la page avant l'impression : on force le rendu, puis on imprime.
    flushSync(() => {
      setRecu(donnees);
      setSituation(null);
      setAvertissement(null);
      setBandeau({
        paiementId: donnees.paiementId,
        titre: message,
        detail: `${formaterAriary(donnees.total)} · ${donnees.modeLibelle} · ${donnees.etudiant.nom} ${donnees.etudiant.prenoms}. Reste à payer : ${formaterAriary(donnees.resteApres)}.`,
      });
    });
    void imprimerTicket();
    // Encaissé en ligne : la copie du poste doit le connaître avant une éventuelle coupure.
    if (donnees.paiementId) void hl.synchroniserMaintenant();
  }

  return (
    <div className="grid gap-4">
      <BandeauConnexion hl={hl} />
      <div role="status">
        {bandeau && (
          <div className="rounded-xl border border-paye/30 bg-paye-pale p-4">
            <div className="flex items-start gap-3">
              <CircleCheck className="mt-0.5 size-6 shrink-0 text-paye" aria-hidden />
              <div className="min-w-0">
                <p className="font-bold text-paye">{bandeau.titre}</p>
                <p className="mt-0.5 text-sm text-foreground">{bandeau.detail}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 sm:pl-9">
              <Button type="button" variant="outline" className="bg-card max-md:h-11" onClick={() => void imprimerTicket()}>
                <Printer aria-hidden />
                Réimprimer le ticket
              </Button>
              {bandeau.paiementId && (
                <Button asChild variant="ghost" className="max-md:h-11">
                  <Link href={`/app/paiements/${bandeau.paiementId}/recu`}>Voir le reçu</Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {erreur && (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden />
          <AlertTitle>{erreur}</AlertTitle>
        </Alert>
      )}

      <div className="rounded-xl border bg-card">
        <section aria-labelledby="etape-etudiant" className="p-4 sm:p-5">
          <EtapeTitre id="etape-etudiant" numero={1} fait={!!situation} titre="Quel étudiant ?" />
          {situation ? (
            <ResumeEtudiant situation={situation} onChanger={() => setSituation(null)} />
          ) : (
            <div className="mt-4">
              <RechercheEtudiant derniers={derniersServis} horsLigne={horsLigne} onChoisir={(e) => void ouvrir(e.id)} desactive={chargement !== null} />
              {chargement && (
                <div role="status" className="mt-4 grid gap-2">
                  <span className="sr-only">Chargement de la situation de l&apos;étudiant…</span>
                  <Skeleton className="h-6 w-2/3" />
                  <Skeleton className="h-20 w-full" />
                </div>
              )}
            </div>
          )}
        </section>

        {situation && avertissement && (
          <div className="px-4 pb-4 sm:px-5">
            <Alert className="border-attention/40 bg-attention-pale text-foreground">
              <TriangleAlert className="text-attention" aria-hidden />
              <AlertTitle>{avertissement}</AlertTitle>
              <AlertDescription className="text-foreground">La liste ci-dessous vient d&apos;être mise à jour.</AlertDescription>
            </Alert>
          </div>
        )}

        {situation?.refus && (
          <div className="border-t p-4 sm:p-5">
            <p className="flex items-start gap-2 rounded-lg bg-paye-pale px-3 py-3 font-medium text-paye">
              <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
              {situation.refus}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" className="max-md:h-11" onClick={() => setSituation(null)}>
                Encaisser pour un autre étudiant
              </Button>
              <Button asChild variant="ghost" className="max-md:h-11">
                <Link href={`/app/etudiants/${situation.etudiant.id}`}>Voir la fiche</Link>
              </Button>
            </div>
          </div>
        )}

        {situation && !situation.refus && (
          <FormulaireEncaissement
            key={`${situation.etudiant.id}-${versionForm}`}
            situation={situation}
            horsLigne={horsLigne}
            utilisateur={utilisateur}
            onSucces={apresSucces}
            onSituationChangee={(message) => void ouvrir(situation.etudiant.id, message)}
          />
        )}
      </div>

      <OptionsTicket className="px-1" />
      <ZoneImpressionTicket donnees={recu} />
    </div>
  );
}

function EtapeTitre({ id, numero, titre, fait }: { id: string; numero: number; titre: string; fait?: boolean }) {
  return (
    <div className="flex min-h-7 items-center gap-3">
      <span
        aria-hidden
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-primary",
          fait && "bg-primary text-primary-foreground",
        )}
      >
        {fait ? <Check className="size-4" strokeWidth={3} /> : numero}
      </span>
      <h2 id={id} className="font-sans text-base font-semibold">
        {titre}
      </h2>
    </div>
  );
}

function ResumeEtudiant({ situation, onChanger }: { situation: SituationGuichet; onChanger: () => void }) {
  const e = situation.etudiant;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <p className="text-lg leading-tight font-bold">
          {e.nom} {e.prenoms}
        </p>
        <p className="text-sm text-muted-foreground">
          {e.matricule} · {e.filiereNom}
          {e.niveau ? ` · ${e.niveau}` : ""}
        </p>
        <div className="mt-2">
          <BadgesSituation etudiant={e} />
        </div>
        {situation.resteDuTotal > 0 && (
          <p className="mt-2 text-sm">
            Reste à payer : <b className="tabular-nums">{formaterAriary(situation.resteDuTotal)}</b>
            {situation.resteEnRetard > 0 && (
              <>
                , dont <b className="text-retard tabular-nums">{formaterAriary(situation.resteEnRetard)}</b> en retard
              </>
            )}
          </p>
        )}
        {situation.anneeEnCours && situation.anneeEnCours.du > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            Déjà payé sur {situation.anneeEnCours.libelle} :{" "}
            <b className="text-foreground tabular-nums">{formaterAriary(situation.anneeEnCours.paye)}</b> sur{" "}
            <span className="tabular-nums">{formaterAriary(situation.anneeEnCours.du)}</span>
          </p>
        )}
      </div>
      <Button type="button" variant="outline" className="max-md:h-11" onClick={onChanger}>
        Changer
        <span className="sr-only"> d&apos;étudiant</span>
      </Button>
    </div>
  );
}

function minuscule(texte: string): string {
  return texte.charAt(0).toLowerCase() + texte.slice(1);
}

/** « avril » ; « avril 2027 » quand plusieurs années sont à payer ; « les droits d'inscription » ; le libellé d'un frais tel quel. */
function nomPourPhrase(e: EcheanceGuichet, plusieursAnnees: boolean): string {
  if (e.type === "DROITS") return `les ${minuscule(e.libelle)}`;
  if (e.type === "FRAIS") return `« ${e.libelle} »${plusieursAnnees ? ` ${e.mois.slice(0, 4)}` : ""}`;
  const [mois, annee] = e.libelle.split(" ");
  return plusieursAnnees ? `${minuscule(mois)} ${annee}` : minuscule(mois);
}

function FormulaireEncaissement({
  situation,
  horsLigne,
  utilisateur,
  onSucces,
  onSituationChangee,
}: {
  situation: SituationGuichet;
  horsLigne: boolean;
  utilisateur: Utilisateur;
  onSucces: (donnees: DonneesRecu, message: string) => void;
  onSituationChangee: (message: string) => void;
}) {
  const { echeances, annees } = situation;
  // Identifiant du paiement : gardé tant que la saisie est la même, pour qu'un renvoi ne l'enregistre pas deux fois ;
  // une saisie modifiée est un autre paiement, avec un nouvel identifiant.
  const essai = useRef<{ saisie: string; idClient: string } | null>(null);
  function idClientPour(saisie: string): string {
    if (essai.current?.saisie !== saisie) essai.current = { saisie, idClient: nouvelIdentifiant() };
    return essai.current.idClient;
  }
  // Rien de coché à l'ouverture (demande de Diano du 26/10/2026) : la secrétaire coche les mois ou tape le montant reçu.
  const [montantTexte, setMontantTexte] = useState("");
  const [mode, setMode] = useState<ModePaiement>("ESPECES");
  const [operateur, setOperateur] = useState<OperateurMobile | null>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [messageErreur, setMessageErreur] = useState<string | null>(null);
  const montantRef = useRef<HTMLInputElement>(null);
  const referenceRef = useRef<HTMLInputElement>(null);
  const operateurRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    montantRef.current?.focus();
    montantRef.current?.select();
  }, []);

  const indexParId = useMemo(() => new Map(echeances.map((e, i) => [e.id, i])), [echeances]);
  const plusieursAnnees = annees.length > 1;

  const lecture = montantTexte.trim() === "" ? null : lireMontant(montantTexte);
  const repartition: Repartition | null = lecture?.ok ? repartirPaiement(echeances, lecture.valeur) : null;
  const erreurMontant = lecture && !lecture.ok ? lecture.erreur : repartition && !repartition.ok ? repartition.erreur : null;
  const montantValide = lecture?.ok && repartition?.ok ? lecture.valeur : null;

  // Cases affichées : un montant trop grand reste lisible (tout coché), l'erreur l'explique à côté.
  const apercu: Repartition | null =
    lecture?.ok && lecture.valeur > 0 ? repartirPaiement(echeances, Math.min(lecture.valeur, situation.resteDuTotal)) : null;
  const imputations = useMemo(() => {
    const m = new Map<string, ImputationCase>();
    if (apercu?.ok) for (const l of apercu.lignes) m.set(l.echeanceId, { montant: l.montant, resteApres: l.resteEcheance });
    return m;
  }, [apercu]);

  function basculer(index: number) {
    const entieres = apercu?.ok ? apercu.lignes.filter((l) => l.resteEcheance === 0).length : 0;
    const k = index < entieres ? index : index + 1;
    setMontantTexte(k > 0 ? formaterNombre(montantPourCases(echeances, k)) : "");
    setErreurs({});
    setMessageErreur(null);
  }

  const mobileMoney = mode === "MOBILE_MONEY";
  let raison: string | null = null;
  if (montantTexte.trim() === "") raison = "Cochez une échéance ou saisissez le montant reçu.";
  else if (erreurMontant) raison = "Corrigez le montant reçu pour encaisser.";
  else if (mobileMoney && !operateur) raison = "Choisissez l'opérateur Mobile Money.";
  else if (mobileMoney && !reference.trim()) raison = "Saisissez la référence de la transaction Mobile Money.";

  const phraseAcompte = (() => {
    if (!repartition?.ok || !repartition.acompte) return null;
    const a = repartition.acompte;
    const e = echeances[indexParId.get(a.echeanceId) ?? 0];
    return `${formaterAriary(a.montant)} d'acompte sur ${nomPourPhrase(e, plusieursAnnees)}, il restera ${formaterAriary(a.resteEcheance)}.`;
  })();

  const recap = (() => {
    if (!repartition?.ok) return "";
    const lignes = repartition.lignes;
    const premier = echeances[indexParId.get(lignes[0].echeanceId) ?? 0];
    const dernier = echeances[indexParId.get(lignes[lignes.length - 1].echeanceId) ?? 0];
    const soldees = lignes.filter((l) => l.resteEcheance === 0).length;
    const morceaux = [premier.libelle === dernier.libelle ? premier.libelle : `${premier.libelle} → ${dernier.libelle}`];
    if (soldees > 0) morceaux.push(`${soldees} échéance${soldees > 1 ? "s" : ""} soldée${soldees > 1 ? "s" : ""}`);
    if (repartition.acompte) morceaux.push("1 acompte");
    morceaux.push(mobileMoney ? `Mobile Money${operateur ? ` ${LIBELLE_OPERATEUR[operateur]}` : ""}` : "Espèces");
    return morceaux.join(" · ");
  })();

  async function soumettre(ev: React.FormEvent) {
    ev.preventDefault();
    if (raison || montantValide === null || enCours) return;
    setEnCours(true);
    setErreurs({});
    setMessageErreur(null);
    const op = mobileMoney ? operateur : null;
    const ref = mobileMoney ? reference.trim() : null;
    const idClient = idClientPour(JSON.stringify([montantValide, mode, op, ref]));
    try {
      if (horsLigne) {
        const r = await encaisserHorsLigne({
          etudiantId: situation.etudiant.id,
          montant: montantValide,
          mode,
          operateur: mobileMoney ? operateur : null,
          reference: mobileMoney ? reference.trim() : null,
          observation: note?.trim() ? note.trim() : null,
          // Même identifiant que l'essai en ligne : s'il avait abouti avant la coupure, le serveur ne le compte qu'une fois.
          idClient,
          utilisateur,
        });
        if (r.ok) {
          onSucces(
            r.recu,
            `Ticket ${r.numeroRecu} remis. Paiement gardé sur ce poste, il sera envoyé à la prochaine synchronisation.`,
          );
        } else setMessageErreur(r.erreur);
        return;
      }
      const etat = await encaisser({
        etudiantId: situation.etudiant.id,
        montant: montantValide,
        mode,
        operateur: mobileMoney ? operateur : null,
        reference: mobileMoney ? reference.trim() : null,
        observation: note?.trim() ? note.trim() : null,
        idClient,
        resteDuAffiche: situation.resteDuTotal,
        jourAffiche: situation.jour,
      });
      if (etat.statut === "succes") {
        onSucces(etat.donnees, etat.message);
        return;
      }
      if (etat.code === "SITUATION_CHANGEE") {
        onSituationChangee(etat.message);
        return;
      }
      setErreurs(etat.erreurs ?? {});
      setMessageErreur(etat.message);
      requestAnimationFrame(() => {
        if (etat.erreurs?.montant) montantRef.current?.focus();
        else if (etat.erreurs?.operateur) operateurRef.current?.focus();
        else if (etat.erreurs?.reference) referenceRef.current?.focus();
      });
    } catch {
      setMessageErreur(!navigator.onLine ? MESSAGE_RESEAU_COUPE : MESSAGE_RESEAU_ENCAISSEMENT);
    } finally {
      setEnCours(false);
    }
  }

  const erreurAffichee = erreurs.montant ?? erreurMontant ?? undefined;

  return (
    <form onSubmit={soumettre} noValidate className="[&_button]:scroll-mb-44 [&_input]:scroll-mb-44">
      <section aria-labelledby="etape-echeances" className="border-t p-4 sm:p-5">
        <EtapeTitre id="etape-echeances" numero={2} titre="Que paie-t-il ?" />
        <div className="mt-4 grid gap-5">
          <ListeEcheances annees={annees} imputations={imputations} surBascule={basculer} indexParId={indexParId} />

          <div className="border-t border-dashed pt-4">
            <ChampFormulaire
              id="montant-recu"
              libelle="Montant reçu"
              aide="Prérempli avec les échéances cochées. Si le payeur apporte plus ou moins, corrigez : le surplus part en acompte sur l'échéance suivante."
              erreur={erreurAffichee}
            >
              <div className="relative max-w-sm">
                <Input
                  {...attributsChamp("montant-recu", { erreur: erreurAffichee, aide: true })}
                  ref={montantRef}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  value={montantTexte}
                  onChange={(ev) => {
                    setMontantTexte(ev.target.value);
                    setErreurs({});
                    setMessageErreur(null);
                  }}
                  onBlur={() => {
                    const l = lireMontant(montantTexte);
                    if (l.ok) setMontantTexte(formaterNombre(l.valeur));
                  }}
                  onFocus={(ev) => ev.currentTarget.select()}
                  className="h-16 pr-14 text-3xl font-bold tabular-nums md:text-3xl"
                />
                <span aria-hidden className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 font-semibold text-muted-foreground">
                  Ar
                </span>
              </div>
            </ChampFormulaire>

            <div aria-live="polite">
              {phraseAcompte && !erreurAffichee && (
                <p className="mt-3 rounded-lg border border-attention/30 bg-attention-pale px-3 py-2.5 text-sm font-semibold text-foreground">
                  {phraseAcompte}
                </p>
              )}
            </div>
            {repartition?.ok && repartition.resteDuApres > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                Après ce paiement, il restera <b className="text-foreground tabular-nums">{formaterAriary(repartition.resteDuApres)}</b> à payer.
              </p>
            )}
            {repartition?.ok && repartition.resteDuApres === 0 && (
              <p className="mt-3 text-sm font-medium text-paye">Ce paiement solde tout ce que l&apos;étudiant doit.</p>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="etape-mode" className="border-t p-4 sm:p-5">
        <EtapeTitre id="etape-mode" numero={3} titre="Comment ?" />
        <div className="mt-4 grid gap-4">
          <fieldset>
            <legend className="sr-only">Mode de paiement</legend>
            <div className="grid grid-cols-2 gap-3">
              <ChoixCarte
                nom="mode"
                valeur="ESPECES"
                coche={mode === "ESPECES"}
                onChoisir={() => setMode("ESPECES")}
                icone={<Banknote className="size-5" aria-hidden />}
                libelle="Espèces"
                grand
              />
              <ChoixCarte
                nom="mode"
                valeur="MOBILE_MONEY"
                coche={mobileMoney}
                onChoisir={() => setMode("MOBILE_MONEY")}
                icone={<Smartphone className="size-5" aria-hidden />}
                libelle="Mobile Money"
                grand
              />
            </div>
          </fieldset>

          {mobileMoney && (
            <FieldGroup className="gap-4">
              <fieldset aria-describedby={erreurs.operateur ? "operateur-erreur" : undefined}>
                <legend className="mb-1.5 text-sm font-medium">Opérateur</legend>
                <div className="grid grid-cols-3 gap-2">
                  {OPERATEURS.map((o, i) => (
                    <ChoixCarte
                      key={o}
                      nom="operateur"
                      valeur={o}
                      coche={operateur === o}
                      inputRef={i === 0 ? operateurRef : undefined}
                      onChoisir={() => {
                        setOperateur(o);
                        setErreurs((x) => ({ ...x, operateur: "" }));
                        referenceRef.current?.focus();
                      }}
                      libelle={LIBELLE_OPERATEUR[o]}
                    />
                  ))}
                </div>
                {erreurs.operateur && (
                  <p id="operateur-erreur" role="alert" className="mt-1.5 text-sm text-destructive">
                    {erreurs.operateur}
                  </p>
                )}
              </fieldset>
              <ChampFormulaire
                id="reference-mm"
                libelle="Référence de la transaction"
                aide="Recopiez la référence du SMS de confirmation reçu par le payeur."
                erreur={erreurs.reference || undefined}
              >
                <Input
                  {...attributsChamp("reference-mm", { erreur: erreurs.reference || undefined, aide: true })}
                  ref={referenceRef}
                  value={reference}
                  onChange={(ev) => setReference(ev.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={60}
                  className="h-11"
                />
              </ChampFormulaire>
            </FieldGroup>
          )}

          {note === null ? (
            <div>
              <Button type="button" variant="link" className="h-auto min-h-6 px-0" onClick={() => setNote("")}>
                Ajouter une note
              </Button>
            </div>
          ) : (
            <ChampFormulaire id="note-paiement" libelle="Note (facultatif)" erreur={erreurs.observation || undefined}>
              <Input
                {...attributsChamp("note-paiement", { erreur: erreurs.observation || undefined })}
                value={note}
                onChange={(ev) => setNote(ev.target.value)}
                maxLength={200}
                placeholder="Ex. payé par la tante"
                autoComplete="off"
                className="h-11"
              />
            </ChampFormulaire>
          )}
        </div>
      </section>

      <section aria-label="Valider l'encaissement" className="sticky bottom-0 z-10 rounded-b-xl border-t bg-card p-4 sm:p-5">
        {messageErreur && (
          <p role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-retard-pale px-3 py-2 text-sm text-destructive">
            {messageErreur}
          </p>
        )}
        {recap && <p className="mb-2 text-sm font-semibold">{recap}</p>}
        {horsLigne && (
          <p className="mb-2 text-sm text-attention">
            Hors ligne : le ticket porte son numéro définitif, le paiement part au serveur au retour d&apos;Internet.
          </p>
        )}
        <Button
          type="submit"
          disabled={!!raison || enCours}
          aria-describedby="raison-encaisser"
          className="h-auto min-h-14 w-full bg-rose-fonce px-5 py-3 text-base leading-snug font-semibold whitespace-normal text-white hover:bg-rose-fonce/90"
        >
          {enCours ? (
            <>
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
              Enregistrement…
            </>
          ) : montantValide !== null ? (
            `Encaisser ${formaterAriary(montantValide)} et imprimer le reçu`
          ) : (
            "Encaisser et imprimer le reçu"
          )}
        </Button>
        <p id="raison-encaisser" className="mt-2 min-h-5 text-center text-sm text-muted-foreground">
          {raison && !enCours ? raison : ""}
        </p>
      </section>
    </form>
  );
}

/** Carte à choisir (mode, opérateur) : la vraie case d'option couvre la carte, donc clavier et lecteur d'écran restent natifs. */
function ChoixCarte({
  nom,
  valeur,
  coche,
  onChoisir,
  libelle,
  icone,
  grand,
  inputRef,
}: {
  nom: string;
  valeur: string;
  coche: boolean;
  onChoisir: () => void;
  libelle: string;
  icone?: React.ReactNode;
  grand?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <label className="relative block">
      <input
        ref={inputRef}
        type="radio"
        name={nom}
        value={valeur}
        checked={coche}
        onChange={onChoisir}
        className="peer absolute inset-0 size-full cursor-pointer opacity-0"
      />
      <span
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg border border-input bg-card px-3 text-center font-semibold transition-colors peer-checked:border-primary peer-checked:bg-secondary peer-checked:text-primary peer-checked:ring-1 peer-checked:ring-primary peer-hover:border-bleu peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 motion-reduce:transition-none",
          grand ? "min-h-16 text-base" : "min-h-12 text-sm",
        )}
      >
        {icone}
        {libelle}
      </span>
    </label>
  );
}
