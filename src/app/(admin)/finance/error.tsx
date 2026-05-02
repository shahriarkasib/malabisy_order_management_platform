"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Per-route error boundary. The /finance page hits 4 BigQuery queries — when
 * one fails the default Next.js error page hides the message in production
 * (digest only). Admins benefit from seeing the actual error so we can debug.
 */
export default function FinanceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[finance/error]", error);
  }, [error]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Finance — error</h1>
        <p className="text-sm text-muted-foreground">A query failed while building this page.</p>
      </div>

      <pre className="overflow-x-auto rounded-md border border-destructive/50 bg-destructive/10 p-4 text-xs">
        {error.message || "(no message — check Vercel runtime logs)"}
        {error.digest && `\n\ndigest: ${error.digest}`}
      </pre>

      <Button onClick={() => reset()}>Try again</Button>
    </div>
  );
}
