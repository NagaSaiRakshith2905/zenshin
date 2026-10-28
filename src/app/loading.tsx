import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main role="status" aria-busy="true" className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <span className="sr-only">Loading Zenshin</span>
      <Skeleton aria-hidden="true" className="size-12" />
      <Skeleton aria-hidden="true" className="h-5 w-32" />
      <Skeleton aria-hidden="true" className="h-4 w-64 max-w-full" />
    </main>
  );
}
