"use client";
import { useEffect, useRef } from "react";
/** One in-flight read, pauses in background tabs, and backs off when nothing changes. */
export function useVisiblePolling(
  key: string,
  enabled: boolean,
  poll: () => Promise<boolean>,
  initialMs = 15000,
  maxMs = 120000
) {
  const latest = useRef(poll);
  latest.current = poll;
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let running = false;
    let delay = initialMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (!stopped && document.visibilityState !== "hidden")
        timer = setTimeout(() => {
          void run();
        }, delay);
    };
    const run = async () => {
      if (stopped || running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const changed = await latest.current();
        delay = changed ? initialMs : Math.min(maxMs, delay * 2);
      } catch {
        delay = Math.min(maxMs, delay * 2);
      } finally {
        running = false;
        schedule();
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "hidden") {
        delay = initialMs;
        void run();
      }
    };
    schedule();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [key, enabled, initialMs, maxMs]);
}
