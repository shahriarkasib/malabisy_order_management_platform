"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";
import type { AdminAccount } from "@/lib/bigquery/settings-queries";

export function AdminsTable({ admins, currentUserEmail }: { admins: AdminAccount[]; currentUserEmail: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [draftEmail, setDraftEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function invite() {
    const email = draftEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) { toast.error("Enter a valid email"); return; }
    setSubmitting(true);
    try {
      const r = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await r.json();
      if (!r.ok) {
        toast.error(body.error || "Failed");
        return;
      }
      const msg = body.status === "already_admin" ? `${email} is already an admin`
                : body.status === "promoted" ? `${email} promoted to admin`
                : `${email} added as admin`;
      toast.success(msg);
      setAdding(false);
      setDraftEmail("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(email: string) {
    if (!confirm(`Remove admin access for ${email}? They'll lose access immediately on their next page load.`)) return;
    const r = await fetch(`/api/admin/admins?email=${encodeURIComponent(email)}`, { method: "DELETE" });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(body.error || "Failed"); return; }
    toast.success(`${email} is no longer an admin`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Active</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium">Last login</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => {
              const isSelf = a.email.toLowerCase() === currentUserEmail.toLowerCase();
              return (
                <tr key={a.email} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">
                    {a.email}
                    {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                  </td>
                  <td className="px-3 py-2">{a.display_name || "—"}</td>
                  <td className="px-3 py-2">
                    {a.active ? <Badge variant="success">active</Badge> : <Badge variant="destructive">disabled</Badge>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{formatDateTime(a.created_at)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{a.last_login_at ? formatDateTime(a.last_login_at) : "never"}</td>
                  <td className="px-3 py-2 text-right">
                    {a.active && !isSelf && (
                      <Button size="sm" variant="ghost" onClick={() => remove(a.email)}>
                        <X /> Remove
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {adding ? (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            type="email"
            placeholder="newadmin@malabisy.com"
            value={draftEmail}
            onChange={(e) => setDraftEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") invite();
              if (e.key === "Escape") { setAdding(false); setDraftEmail(""); }
            }}
            className="h-9 max-w-sm"
          />
          <Button size="sm" onClick={invite} disabled={submitting}>Add admin</Button>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setDraftEmail(""); }}>Cancel</Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus /> Add admin
        </Button>
      )}
    </div>
  );
}
