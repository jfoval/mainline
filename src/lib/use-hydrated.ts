"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Returns false during SSR and the hydration render, then true on the client. Use to gate
 * client-only capability checks (e.g. SpeechRecognition) so server and first client render
 * agree — avoids hydration mismatches without setState-in-effect.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
