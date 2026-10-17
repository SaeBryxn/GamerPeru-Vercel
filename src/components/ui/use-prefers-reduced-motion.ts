"use client";

import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const supportsMediaQueries = () => typeof window.matchMedia === "function";

function subscribe(onChange: () => void) {
  if (!supportsMediaQueries()) return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * The visitor's reduced-motion preference, or `null` while it is unknown: on the server and
 * during hydration. Framer's useReducedMotion reads the media query in the first client render,
 * so anything that adds or removes elements with it (a video embed, a drag gesture) renders a
 * different tree than the server and React throws the hydrated page away. Branch on
 * `=== false` to start motion only once it is known to be welcome, and `=== true` to opt out.
 */
export function usePrefersReducedMotion(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => supportsMediaQueries() && window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => null
  );
}
