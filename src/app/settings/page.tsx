import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="text-muted-foreground">Workspace and access controls.</p>
      <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
        Settings coming with auth phase.
      </div>
    </div>
  );
}
