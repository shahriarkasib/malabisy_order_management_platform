"use client";

import { Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "./notifications-bell";

export function Header() {
  return (
    <header className="flex h-16 items-center gap-4 border-b border-border bg-card px-6">
      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search orders, SKUs, customers…" className="pl-9" />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <NotificationsBell />
        <Button variant="ghost" size="icon" aria-label="Account">
          <User className="size-4" />
        </Button>
      </div>
    </header>
  );
}
