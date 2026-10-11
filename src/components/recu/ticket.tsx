import Image from "next/image";
import type { DonneesRecu } from "@/lib/encaissement";
import { ETABLISSEMENT, MENTION_AGREMENT_TICKET } from "@/lib/etablissement-constantes";
import { formaterAriary } from "@/lib/montant";

// Ticket thermique monochrome : noir sur blanc, sans couleur, sans QR code. Pur : tout vient de `DonneesRecu`.

export type LargeurTicket = 58 | 80;

function Ligne({ gauche, droite, fort }: { gauche: React.ReactNode; droite: React.ReactNode; fort?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-[2mm]">
      <span className={fort ? "font-bold" : undefined}>{gauche}</span>
      <span className={`text-right whitespace-nowrap ${fort ? "font-bold" : "font-semibold"}`}>{droite}</span>
    </div>
  );
}

function Separateur({ plein }: { plein?: boolean }) {
  return (
    <hr
      className={`my-[2.4mm] border-0 border-black ${plein ? "border-t-[0.45mm] border-solid" : "border-t-[0.3mm] border-dashed"}`}
    />
  );
}

export function Ticket({
  donnees,
  largeur,
  double = false,
}: {
  donnees: DonneesRecu;
  largeur: LargeurTicket;
  /** Exemplaire de l'institut : mention « DOUBLE » en tête. */
  double?: boolean;
}) {
  const k = largeur === 58 ? 0.84 : 1;
  const marge = largeur === 58 ? 3 : 4;
  const { etudiant: e, annulation } = donnees;
  const mobileMoney = donnees.mode === "MOBILE_MONEY";

  return (
    <article
      aria-label={`Reçu ${donnees.numero}${double ? ", double pour l'institut" : ""}${annulation ? ", annulé" : ""}`}
      className="mx-auto bg-white font-sans leading-[1.32] text-black tabular-nums"
      style={{ width: `${largeur}mm`, padding: `5mm ${marge}mm 6mm`, fontSize: `${9 * k}pt`, boxSizing: "border-box" }}
    >
      {annulation && (
        <div className="bg-black text-center text-white" style={{ margin: `-5mm -${marge}mm 3mm`, padding: `2mm ${marge}mm` }}>
          <b className="block text-[1.45em] font-extrabold tracking-[0.12em]">*** ANNULÉ ***</b>
          <span className="mt-[0.6mm] block text-[0.9em] font-semibold">Sans valeur de paiement</span>
        </div>
      )}

      <header className="text-center">
        <Image
          src="/brand/logo-ifspa.png"
          alt=""
          width={699}
          height={472}
          unoptimized
          loading="eager"
          className="mx-auto mb-[1.6mm] h-auto grayscale contrast-125"
          style={{ width: `${22 * k}mm` }}
        />
        <div className="text-[1.55em] leading-[1.1] font-extrabold tracking-[0.08em]">{ETABLISSEMENT.sigle}</div>
        <div className="mt-[0.5mm] text-[0.9em] leading-tight font-medium text-balance">{ETABLISSEMENT.nom}</div>
        <div className="text-[0.9em] font-medium">{ETABLISSEMENT.ville}</div>
      </header>

      <Separateur />

      <div className="text-center">
        {double && (
          <div className="mb-[1.6mm] inline-block border-[0.35mm] border-black px-[2mm] py-[0.3mm] text-[0.9em] font-extrabold tracking-[0.14em]">
            DOUBLE
          </div>
        )}
        <div className="text-[1.2em] font-extrabold tracking-[0.06em]">REÇU DE PAIEMENT</div>
        <div className="mt-[0.6mm] text-[1.12em] font-bold">N° {donnees.numero}</div>
        <div>
          Le {donnees.date} à {donnees.heure}
        </div>
      </div>

      {annulation && (
        <>
          <Separateur />
          <div className="font-medium">
            <b className="font-bold">Annulé le</b> {annulation.date}
            <br />
            <b className="font-bold">Par</b> {annulation.par}
            <br />
            <b className="font-bold">Motif :</b> {annulation.motif}
          </div>
        </>
      )}

      <Separateur />

      <div>
        <b className="block text-[1.08em] leading-tight font-bold">
          {e.nom} {e.prenoms}
        </b>
        <span className="block">Matricule {e.matricule}</span>
        <span className="block">
          {e.filiere} · {e.niveau}
          {e.anneeScolaire ? ` · ${e.anneeScolaire}` : ""}
        </span>
      </div>

      <Separateur />

      <div className={`grid gap-[1.1mm] ${annulation ? "line-through decoration-[0.3mm]" : ""}`}>
        {donnees.lignes.map((l, i) => (
          <div key={`${l.libelle}-${i}`} className="flex items-baseline justify-between gap-[2mm]">
            <span>
              {l.libelle}
              {l.acompte && (
                <small className="block text-[0.86em] font-medium">Acompte · reste dû {formaterAriary(l.resteEcheance)}</small>
              )}
            </span>
            <span className="text-right font-semibold whitespace-nowrap">{formaterAriary(l.montant)}</span>
          </div>
        ))}
      </div>

      <div
        className={`mt-[2.2mm] border-t-[0.45mm] border-black pt-[2mm] text-[1.45em] font-extrabold tracking-[0.02em] ${annulation ? "line-through decoration-[0.3mm]" : ""}`}
      >
        <Ligne gauche="TOTAL" droite={formaterAriary(donnees.total)} fort />
      </div>
      <p className="mt-[1.8mm] text-[0.95em]">
        Arrêté à : <b className="font-bold">{donnees.totalEnLettres}</b>
      </p>

      <Separateur />

      <div className="grid gap-[0.8mm]">
        <Ligne gauche="Mode" droite={mobileMoney ? `Mobile Money · ${donnees.operateurLibelle ?? ""}` : donnees.modeLibelle} />
        {mobileMoney && <Ligne gauche="Réf." droite={donnees.reference ?? "non saisie"} />}
        <Ligne gauche="Caissier" droite={donnees.caissier} />
      </div>

      <Separateur />

      <div className="grid gap-[0.8mm]">
        <Ligne gauche="Reste en retard" droite={donnees.retardApres > 0 ? formaterAriary(donnees.retardApres) : "Néant, à jour"} fort />
        <Ligne gauche="Reste à payer" droite={formaterAriary(donnees.resteApres)} fort />
      </div>

      <Separateur plein />

      <footer className="text-center">
        <div className="text-[1.05em] font-bold">Merci. Conservez ce reçu.</div>
        <div className="mt-[1mm] text-[0.8em] leading-[1.3] font-medium">{MENTION_AGREMENT_TICKET}</div>
      </footer>
    </article>
  );
}
