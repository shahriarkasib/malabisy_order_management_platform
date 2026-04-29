export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted/60" />
      </div>

      {/* tabs skeleton */}
      <div className="flex gap-1 border-b border-border pb-px">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-9 w-32 animate-pulse rounded-t-md bg-muted" />
        ))}
      </div>

      {/* action bar skeleton */}
      <div className="h-12 animate-pulse rounded-lg bg-muted/40" />

      {/* table skeleton */}
      <div className="rounded-lg border border-border">
        <div className="h-10 border-b border-border bg-muted/50" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse border-b border-border bg-muted/20" style={{ animationDelay: `${i * 50}ms` }} />
        ))}
      </div>
    </div>
  );
}
