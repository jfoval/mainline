import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";
import { MainNav } from "@/components/MainNav";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

// basePath-aware asset prefix ("" locally, "/mainline" on GitHub Pages). The manifest link is
// injected automatically from app/manifest.ts (already basePath-aware), so it's omitted here.
const bp = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "Mainline",
  description:
    "Mainline — insanely easy capture for getting things done. Idea to captured in under two seconds, even offline.",
  applicationName: "Mainline",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mainline",
  },
  icons: {
    icon: `${bp}/icon-192.png`,
    apple: `${bp}/apple-touch-icon.png`,
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
          <nav className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3">
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
            <MainNav />
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
