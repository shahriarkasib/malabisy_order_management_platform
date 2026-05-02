import { requireVendor } from "@/lib/auth/server";
import { VendorSidebar } from "@/components/layout/vendor-sidebar";

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const session = await requireVendor();

  return (
    <div className="flex h-screen overflow-hidden">
      <VendorSidebar
        displayName={session.display_name || session.email}
        vendors={session.vendors}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center gap-4 border-b border-border bg-card px-6">
          <h2 className="text-base font-semibold">
            {session.vendors.length === 1 ? session.vendors[0] : `${session.vendors.length} vendors`}
          </h2>
        </header>
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="mx-auto max-w-[1400px] px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
