type Props = {
  aVerifier: boolean;
  annule: boolean;
  noteVerification: string | null;
  verification: { date: string; par: string } | null;
};

/** Pourquoi un paiement est « à vérifier », ou qui l'a vérifié. Rien pour un paiement ordinaire ou annulé. */
export function InfoVerification({ aVerifier, annule, noteVerification, verification }: Props) {
  if (annule) return null;
  if (aVerifier && noteVerification) {
    return <p className="mt-1 max-w-64 text-xs text-foreground">{noteVerification}</p>;
  }
  if (verification) {
    return (
      <div className="mt-1 max-w-64 text-xs text-muted-foreground">
        <p className="font-medium">
          Vérifié le {verification.date} par {verification.par}
        </p>
        {noteVerification && <p className="mt-0.5">{noteVerification}</p>}
      </div>
    );
  }
  return null;
}
