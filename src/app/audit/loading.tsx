export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-48 animate-pulse rounded bg-muted/60" />
      </div>
      <div className="rounded-lg border border-border">
        <div className="h-10 border-b border-border bg-muted/50" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse border-b border-border bg-muted/20"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
