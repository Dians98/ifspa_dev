import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONS = {
  vert: "bg-paye-pale text-paye",
  orange: "bg-attention-pale text-attention",
  bleu: "bg-secondary text-secondary-foreground",
  rose: "bg-rose-pale text-rose-fonce",
  neutre: "bg-muted text-muted-foreground",
} as const;

export type TonEtat = keyof typeof TONS;

/** Un état se lit toujours par son libellé ; la couleur et le point ne font que l'appuyer. */
export function BadgeEtat({ ton, children, point = true }: { ton: TonEtat; children: string; point?: boolean }) {
  return (
    <Badge variant="secondary" className={cn("h-6 px-2.5", TONS[ton])}>
      {point && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </Badge>
  );
}
