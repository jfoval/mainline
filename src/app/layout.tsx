import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";
import { AuthGate } from "@/components/AuthGate";
import { AuthStatus } from "@/components/AuthStatus";
import { BottomNav } from "@/components/BottomNav";
import { MainNav } from "@/components/MainNav";
import { NavGate } from "@/components/NavGate";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { UndoToast } from "@/components/UndoToast";

// basePath-aware asset prefix ("" locally, "/mainline" on GitHub Pages). The manifest link is
// injected automatically from app/manifest.ts (already basePath-aware), so it's omitted here.
const bp = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** Where the site actually lives — makes every relative metadata URL below absolute, which is
 *  what unfurlers (search, iMessage, Slack) require. Overridable for a preview deploy. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mainline.support";

const DESCRIPTION =
  "Mainline is a calm place to put everything on your mind: capture in a tap (even offline), " +
  "decide what each thing is once, and see only what you can do right now.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Sub-pages set their own title; this frames it so a search result reads "Set up Mainline — Mainline".
  title: {
    default: "Mainline: get everything out of your head",
    template: "%s · Mainline",
  },
  description: DESCRIPTION,
  applicationName: "Mainline",
  keywords: [
    "getting things done",
    "GTD app",
    "task capture",
    "next actions",
    "weekly review",
    "offline to-do app",
  ],
  alternates: { canonical: "/" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mainline",
  },
  icons: {
    icon: `${bp}/icon-192.png`,
    apple: `${bp}/apple-touch-icon.png`,
  },
  openGraph: {
    type: "website",
    siteName: "Mainline",
    title: "Mainline: get everything out of your head",
    description: DESCRIPTION,
    url: "/",
    images: [{ url: `${bp}/og.png`, width: 1200, height: 630, alt: "Mainline" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mainline: get everything out of your head",
    description: DESCRIPTION,
    images: [`${bp}/og.png`],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  // Let content extend under notches; we pad via env(safe-area-inset-*) in globals.
  viewportFit: "cover",
  // Capture screen is a focused tool — discourage accidental zoom on the textarea.
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-background">
          {/* Wider than the max-w-2xl content column: the signed-in nav row (6 sections + Help
              + Sign out) needs the room — narrower viewports use the bottom tab bar instead. */}
          <nav className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src={`${bp}/logo-mark.png`}
                alt=""
                width={28}
                height={28}
                className="h-7 w-7"
                priority
              />
              <span className="text-lg font-semibold tracking-tight">Mainline</span>
            </Link>
            <div className="flex items-center gap-1">
              <NavGate>
                {/* Top nav needs lg+ to fit all items comfortably; below that the bottom tab bar
                    navigates (tablets included — thumb-friendly there anyway). */}
                <div className="hidden lg:block">
                  <MainNav />
                </div>
                {/* Support/feature tickets need the backend — hidden in offline builds. */}
                {process.env.NEXT_PUBLIC_SUPABASE_URL &&
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? (
                  <Link
                    href="/help"
                    className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    Help
                  </Link>
                ) : null}
              </NavGate>
              <AuthStatus />
            </div>
          </nav>
        </header>
        {/* pb-24 reserves space for the fixed bottom tab bar (shown below lg). */}
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-6 pb-24 lg:pb-6">
          <AuthGate>{children}</AuthGate>
        </main>
        <NavGate>
          <BottomNav />
        </NavGate>
        <UndoToast />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
