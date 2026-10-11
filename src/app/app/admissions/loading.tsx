import { Skeleton } from "@/components/ui/skeleton";

export default function ChargementAdmissions() {
  return (
    <div role="status" className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <span className="sr-only">Chargement en cours…</span>
      <Skeleton className="h-72 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
