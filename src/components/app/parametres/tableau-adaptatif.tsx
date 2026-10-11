import type { ComponentProps } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Tableau sur ordinateur, une carte par ligne sur téléphone : un seul balisage, donc un seul nom accessible par champ.

export function TableauAdaptatif({ className, ...props }: ComponentProps<typeof Table>) {
  return <Table className={cn("max-md:block", className)} {...props} />;
}

export function EnTeteAdaptatif({ className, ...props }: ComponentProps<typeof TableHeader>) {
  return <TableHeader className={cn("bg-muted/50 max-md:sr-only", className)} {...props} />;
}

export function ColonneAdaptative({ className, ...props }: ComponentProps<typeof TableHead>) {
  return <TableHead className={cn("px-4 text-xs font-semibold text-muted-foreground", className)} {...props} />;
}

export function CorpsAdaptatif({ className, ...props }: ComponentProps<typeof TableBody>) {
  return <TableBody className={cn("max-md:block", className)} {...props} />;
}

export function LigneAdaptative({ className, ...props }: ComponentProps<typeof TableRow>) {
  return (
    <TableRow
      className={cn("max-md:grid max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-2.5 max-md:px-4 max-md:py-3.5", className)}
      {...props}
    />
  );
}

export function CelluleAdaptative({
  libelle,
  pleine,
  droite,
  className,
  ...props
}: ComponentProps<typeof TableCell> & {
  /** Intitulé de la colonne, repris au-dessus de la valeur sur téléphone. */
  libelle?: string;
  /** Occupe toute la largeur de la carte sur téléphone. */
  pleine?: boolean;
  droite?: boolean;
}) {
  return (
    <TableCell
      data-label={libelle}
      className={cn(
        "px-4 py-3 max-md:block max-md:p-0 max-md:whitespace-normal",
        libelle &&
          "max-md:before:mb-0.5 max-md:before:block max-md:before:text-xs max-md:before:font-medium max-md:before:text-muted-foreground max-md:before:content-[attr(data-label)]",
        pleine && "max-md:col-span-2",
        droite && "md:text-right",
        className,
      )}
      {...props}
    />
  );
}
