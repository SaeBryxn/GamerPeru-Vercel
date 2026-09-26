"use client";

import { useSyncExternalStore } from "react";

const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

// Environments without media queries (jsdom, some embedded webviews) are treated like the server.
const supportsMediaQueries = () => typeof window.matchMedia === "function";

function subscribe(onChange: () => void) {
  if (!supportsMediaQueries()) return () => {};
  const query = window.matchMedia(HOVER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Whether the primary input can hover. Hover-revealed controls must stay visible where it cannot,
 * or touch users would never see them. The server assumes a mouse, matching most desktop traffic.
 */
export function useCanHover(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !supportsMediaQueries() || window.matchMedia(HOVER_QUERY).matches,
    () => true
  );
}
