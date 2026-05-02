import { requireInternal } from "@/lib/auth/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

/**
 * (admin) route group: wraps every page that's only for Malabisy ops staff.
 * Middleware redirects vendors away from these paths, but we also call
 * requireInternal() server-side for defence-in-depth.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireInternal();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userEmail={session.email} displayName={session.display_name} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="mx-auto max-w-[1600px] px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
