import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  title: "GTD — Capture",
  description:
    "Insanely easy capture for Getting Things Done. Idea to captured in under two seconds, even offline.",
  manifest: "/manifest.webmanifest",
  applicationName: "GTD",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GTD",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
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
        <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
          <nav className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              GTD
            </Link>
            <div className="flex items-center gap-1 text-sm">
              <Link
                href="/"
                className="rounded-md px-3 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                Capture
              </Link>
              <Link
                href="/inbox"
                className="rounded-md px-3 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                Inbox
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
          {children}
        </main>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
