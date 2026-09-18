import { cn } from "@/lib/utils";

export function PageLoadingState({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className={cn("space-y-5", className)}
    >
      <div className="space-y-4 animate-pulse">
        <div className="space-y-2">
          <div className="h-4 w-24 rounded-md bg-muted" />
          <div className="h-8 w-64 max-w-full rounded-md bg-muted" />
          <div className="h-4 w-full max-w-xl rounded-md bg-muted" />
        </div>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="h-24 rounded-lg border bg-background" />
          <div className="h-24 rounded-lg border bg-background" />
          <div className="h-24 rounded-lg border bg-background" />
        </section>

        <section className="overflow-hidden rounded-lg border bg-background">
          <div className="space-y-2 border-b p-4">
            <div className="h-4 w-40 rounded-md bg-muted" />
            <div className="h-3 w-72 max-w-full rounded-md bg-muted" />
          </div>
          <div className="space-y-3 p-4">
            <div className="h-10 rounded-md bg-muted/70" />
            <div className="h-10 rounded-md bg-muted/70" />
            <div className="h-10 rounded-md bg-muted/70" />
            <div className="h-10 rounded-md bg-muted/70" />
          </div>
        </section>
      </div>
    </div>
  );
}
