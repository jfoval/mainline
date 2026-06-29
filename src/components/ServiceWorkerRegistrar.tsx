"use client";

import { useEffect } from "react";

/**
 * Registers the app-shell service worker — production only, so it never interferes
 * with Next.js dev HMR. Capture durability does not depend on this; the SW only makes
 * the shell load offline. (Test with `pnpm build && pnpm start`.)
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failure must never break the app — capture still works.
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
