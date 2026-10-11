import { Skeleton } from "@/components/ui/skeleton";

export default function ChargementTableauDeBord() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Chargement en cours…</span>
      <div className="space-y-3">
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <Skeleton className="h-6 w-64 max-w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <Skeleton className="h-6 w-48 max-w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
