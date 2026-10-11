import { Skeleton } from "@/components/ui/skeleton";

export default function ChargementEncaisser() {
  return (
    <div role="status" className="mx-auto max-w-3xl space-y-6">
      <span className="sr-only">Chargement du guichet…</span>
      <div className="space-y-3">
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}
