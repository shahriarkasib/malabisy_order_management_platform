"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VendorWithUsers } from "@/lib/bigquery/admin-queries";

export function VendorAccessTable({ vendors }: { vendors: VendorWithUsers[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null); // vendor name being added to
  const [draftEmail, setDraftEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const filtered = vendors.filter(
    (v) =>
      !search ||
      v.vendor.toLowerCase().includes(search.toLowerCase()) ||
      v.users.some((u) => u.email.toLowerCase().includes(search.toLowerCase())),
  );

  async function grant(vendor: string) {
    const email = draftEmail.trim();
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/admin/vendor-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, vendor }),
      });
      const body = await r.json();
      if (!r.ok) {
        toast.error(body.error || "Failed to grant access");
      } else if (body.status === "already_had_access") {
        toast.info(`${email} already has access to ${vendor}`);
      } else if (body.status === "user_created_and_granted") {
        toast.success(`Created ${email} and granted ${vendor}`);
      } else {
        toast.success(`Granted ${email} access to ${vendor}`);
      }
      setAdding(null);
      setDraftEmail("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(email: string, vendor: string) {
    if (!confirm(`Remove ${email}'s access to ${vendor}?`)) return;
    const r = await fetch(
      `/api/admin/vendor-access?email=${encodeURIComponent(email)}&vendor=${encodeURIComponent(vendor)}`,
      { method: "DELETE" },
    );
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      toast.error(body.error || "Failed to remove");
      return;
    }
    toast.success(`Removed ${email} from ${vendor}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by vendor or email…"
          className="pl-9"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 text-right font-medium">Active products</th>
              <th className="px-4 py-3 font-medium">Users with access</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => {
              const isAdding = adding === v.vendor;
              const inactive = v.product_count - v.active_product_count;
              const tooltip =
                inactive > 0
                  ? `${v.active_product_count.toLocaleString()} active, ${inactive.toLocaleString()} draft/archived (${v.product_count.toLocaleString()} total in Shopify)`
                  : `All ${v.product_count.toLocaleString()} products are active`;
              return (
                <tr key={v.vendor} className="border-b border-border last:border-b-0 align-top">
                  <td className="px-4 py-3 font-medium">{v.vendor}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span title={tooltip} className="cursor-help underline-offset-4 decoration-dotted hover:underline">
                      {v.active_product_count.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {v.users.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No users yet</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {v.users.map((u) => (
                          <span
                            key={u.email}
                            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs"
                            title={u.display_name || u.email}
                          >
                            {u.email}
                            <button
                              onClick={() => revoke(u.email, v.vendor)}
                              className="text-muted-foreground hover:text-destructive"
                              aria-label="Remove access"
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isAdding ? (
                      <div className="flex items-center gap-1">
                        <Input
                          autoFocus
                          type="email"
                          placeholder="email@vendor.com"
                          value={draftEmail}
                          onChange={(e) => setDraftEmail(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") grant(v.vendor);
                            if (e.key === "Escape") { setAdding(null); setDraftEmail(""); }
                          }}
                          className="h-8 w-56"
                        />
                        <Button size="sm" onClick={() => grant(v.vendor)} disabled={submitting}>
                          Add
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setAdding(null); setDraftEmail(""); }}>
                          <X />
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => { setAdding(v.vendor); setDraftEmail(""); }}>
                        <Plus /> Add user
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                  No vendors match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
