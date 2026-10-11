import { Skeleton } from "@/components/ui/skeleton";

export default function ChargementParametres() {
  return (
    <div role="status" className="overflow-hidden rounded-xl border bg-card">
      <span className="sr-only">Chargement en cours…</span>
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="space-y-4 p-5">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}
