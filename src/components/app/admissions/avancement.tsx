import type { EcranAdmissions } from "@/server/lectures/admissions";

export function Avancement({ avancement }: { avancement: EcranAdmissions["avancement"] }) {
  const part = avancement.total > 0 ? Math.round((avancement.validees / avancement.total) * 100) : 0;

  return (
    <div role="status" className="min-w-56 max-md:w-full">
      <p className="text-sm font-semibold text-primary tabular-nums">{avancement.libelle}</p>
      <div aria-hidden className="mt-1.5 h-2 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-paye transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${part}%` }} />
      </div>
    </div>
  );
}
