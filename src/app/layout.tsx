import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { Suspense } from "react";
import { NavProgress } from "@/components/layout/nav-progress";
import { APP_NAME } from "@/lib/constants";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Production-grade order management for Malabisy.",
};

/**
 * Root layout — minimal. Just html, body, fonts, toaster, nav progress bar.
 * The actual app shell (sidebar / header) lives in role-specific layouts:
 *   - src/app/(admin)/layout.tsx for internal staff
 *   - src/app/vendor/layout.tsx  for vendor partners
 *   - /login renders bare (no shell)
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
