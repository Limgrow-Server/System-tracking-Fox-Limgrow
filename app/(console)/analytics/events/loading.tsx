export default function EventAnalyticsLoading() {
  return (
    <div
      className="mx-auto w-full max-w-[1440px] space-y-6"
      aria-busy="true"
      aria-label="Đang tải Event analytics"
    >
      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-9 w-72 max-w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-[34rem] max-w-full animate-pulse rounded bg-muted/70" />
      </div>
      <div className="h-28 animate-pulse rounded-xl border bg-muted/30" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-xl border bg-muted/30"
          />
        ))}
      </div>
      <div className="h-[27rem] animate-pulse rounded-xl border bg-muted/30" />
    </div>
  );
}
