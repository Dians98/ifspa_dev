"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Même plafond que le serveur, appliqué au total des fichiers. */
const TAILLE_MAX_OCTETS = 1024 * 1024;

const extension = (f: File) => f.name.toLowerCase().split(".").pop() ?? "";

// En Ko arrondis au-dessus : « 1 Mo » arrondi à côté de « 1 Mo au plus » se contredirait.
function taille(octets: number): string {
  return `${Math.max(1, Math.ceil(octets / 1024)).toLocaleString("fr-FR")} Ko`;
}

/** Message à afficher avant tout envoi, ou null si le dépôt peut être analysé. */
export function verifierDepot(fichiers: File[]): string | null {
  if (fichiers.length === 0) return null;
  const xls = fichiers.find((f) => extension(f) === "xls");
  if (xls) return `« ${xls.name} » est un ancien format Excel (.xls) : ouvrez-le dans Excel et enregistrez-le au format .xlsx.`;
  const autre = fichiers.find((f) => !["xlsx", "csv"].includes(extension(f)));
  if (autre) return `« ${autre.name} » n'est pas un fichier du modèle : déposez le .xlsx, ou les CSV Étudiants et Paiements.`;
  const total = fichiers.reduce((s, f) => s + f.size, 0);
  if (total > TAILLE_MAX_OCTETS) {
    return `Fichier trop volumineux (${taille(total)}) : 1 Mo au plus. Retirez les feuilles ou colonnes inutiles, ou importez en plusieurs fois.`;
  }
  const classeurs = fichiers.filter((f) => extension(f) === "xlsx").length;
  const csv = fichiers.length - classeurs;
  if (classeurs > 1 || (classeurs === 1 && csv > 0) || csv > 2) {
    return "Déposez un seul fichier .xlsx, ou deux CSV (Étudiants et Paiements), pas un mélange.";
  }
  return null;
}

/** Deux CSV choisis l'un après l'autre se complètent ; tout autre choix remplace le précédent. */
function fusionner(actuels: File[], nouveaux: File[]): File[] {
  const tousCsv = [...actuels, ...nouveaux].every((f) => extension(f) === "csv");
  if (!tousCsv) return nouveaux;
  const parNom = new Map([...actuels, ...nouveaux].map((f) => [f.name, f]));
  return [...parNom.values()];
}

type Props = {
  fichiers: File[];
  onChange: (fichiers: File[]) => void;
  /** Id du texte d'aide et de l'erreur éventuelle, reliés au bouton de choix. */
  descriptionId: string;
  disabled?: boolean;
};

export function ZoneDepot({ fichiers, onChange, descriptionId, disabled }: Props) {
  const entree = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);

  function recevoir(liste: FileList | null) {
    if (!liste || liste.length === 0) return;
    onChange(fusionner(fichiers, Array.from(liste)));
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          if (!disabled) recevoir(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors motion-reduce:transition-none",
          survol ? "border-rose bg-rose-pale" : "border-input bg-muted/40",
        )}
      >
        <Upload aria-hidden className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Glissez le fichier rempli ici, ou</p>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-describedby={descriptionId}
          className="max-md:h-11 max-md:w-full"
          onClick={() => entree.current?.click()}
        >
          Choisir le fichier
        </Button>
        <input
          ref={entree}
          type="file"
          accept=".xlsx,.csv"
          multiple
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          onChange={(e) => {
            recevoir(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {fichiers.length > 0 && (
        <ul aria-label="Fichiers choisis" className="mt-3 divide-y rounded-lg border">
          {fichiers.map((f) => (
            <li key={f.name} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileSpreadsheet aria-hidden className="size-4 shrink-0 text-bleu" />
              <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{taille(f.size)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                aria-label={`Retirer ${f.name}`}
                className="max-md:size-11"
                onClick={() => onChange(fichiers.filter((x) => x !== f))}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
