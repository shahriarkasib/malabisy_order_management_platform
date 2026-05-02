"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, AlertTriangle, AlertCircle, X } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";

interface NotificationItem {
  id: string;
  source: "ops" | "vendor";
  occurred_at: string;
  actor_email: string | null;
  title: string;
  detail: string;
  severity: "error" | "warning";
}

const POLL_INTERVAL_MS = 60_000;
const LAST_SEEN_KEY = "mob.notifications.last_seen_at";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [lastSeen, setLastSeen] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem(LAST_SEEN_KEY) || 0);
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Poll the API for recent failures.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/admin/notifications", { cache: "no-store" });
        if (!r.ok) return;
        const body = await r.json();
        if (!cancelled) setItems(body.items || []);
      } catch {
        /* network errors are non-fatal */
      }
    }
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Unread count = items occurring after the user's last-seen timestamp.
  const unread = items.filter((i) => Date.parse(i.occurred_at) > lastSeen).length;

  function markSeen() {
    const now = Date.now();
    setLastSeen(now);
    if (typeof window !== "undefined") localStorage.setItem(LAST_SEEN_KEY, String(now));
  }

  function toggleOpen() {
    setOpen((o) => {
      const next = !o;
      if (next && unread > 0) markSeen();
      return next;
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={toggleOpen}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute right-2 top-2 inline-flex h-2 w-2 rounded-full bg-destructive ring-2 ring-card" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[420px] origin-top-right rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div>
              <p className="text-sm font-semibold">Recent failures</p>
              <p className="text-xs text-muted-foreground">Last 7 days · {items.length}</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>

          <div className="max-h-[480px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                <AlertCircle className="mx-auto mb-2 size-5 text-emerald-500" />
                Nothing failing. All ops actions succeeded in the last 7 days.
              </div>
            ) : (
              items.map((item) => {
                const Icon = item.severity === "error" ? AlertCircle : AlertTriangle;
                return (
                  <div
                    key={`${item.source}-${item.id}`}
                    className={cn(
                      "border-b border-border px-4 py-3 last:border-b-0",
                      Date.parse(item.occurred_at) > lastSeen && "bg-accent/30",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Icon
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          item.severity === "error" ? "text-destructive" : "text-amber-500",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{item.detail}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {formatDateTime(item.occurred_at)}
                          {item.actor_email && ` · ${item.actor_email}`}
                          <span className="ml-1 rounded bg-muted px-1 py-px text-[10px] uppercase tracking-wide">
                            {item.source}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-border px-4 py-2">
            <Link
              href="/audit"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setOpen(false)}
            >
              Open full audit log →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
