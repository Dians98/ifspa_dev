import { Skeleton } from "@/components/ui/skeleton";

export default function ChargementEtudiants() {
  return (
    <div role="status">
      <span className="sr-only">Chargement en cours…</span>
      <Skeleton className="mb-6 h-9 w-56" />
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="space-y-3 border-b p-4 sm:p-5">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="space-y-4 p-5">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </div>
  );
}
