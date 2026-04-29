import Link from "next/link";
import { Package, ScrollText, Store, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

const STAT_CARDS = [
  {
    title: "Orders",
    description: "Manage active orders across all pipeline stages.",
    icon: Package,
    href: "/orders",
    cta: "Open orders",
  },
  {
    title: "Audit Log",
    description: "Every action taken on the platform, fully traceable.",
    icon: ScrollText,
    href: "/audit",
    cta: "View log",
  },
  {
    title: "Vendors",
    description: "Vendor accounts, courier rules, and pickup locations.",
    icon: Store,
    href: "/vendors",
    cta: "Manage vendors",
  },
  {
    title: "Analytics",
    description: "Performance, ad spend, COGS — everything in one place.",
    icon: BarChart3,
    href: "/analytics",
    cta: "Open analytics",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-muted-foreground">
          Operations control center for Malabisy. Pick a workflow to get started.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map(({ title, description, icon: Icon, href, cta }) => (
          <div
            key={href}
            className="group rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
          >
            <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-5" />
            </div>
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            <Button asChild variant="ghost" size="sm" className="-ml-3 mt-4">
              <Link href={href}>{cta} →</Link>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
