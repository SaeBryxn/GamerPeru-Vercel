"use client";

import { useEffect, useState } from "react";
import type { AttentionSnapshot } from "@/lib/admin/dashboard-overview-types";

const MAX_AGE_MS = 60_000;
let cached: { data: AttentionSnapshot; at: number } | null = null;
let inflight: Promise<AttentionSnapshot | null> | null = null;

function load(): Promise<AttentionSnapshot | null> {
  inflight ??= fetch("/api/admin/attention", { credentials: "same-origin" })
    .then((response) => (response.ok ? (response.json() as Promise<AttentionSnapshot>) : null))
    .then((data) => {
      if (data) cached = { data, at: Date.now() };
      return data;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Pending counts for the sidebar badges and the bell. Read once when the panel opens and again
 * when the tab comes back after a minute, never on each navigation: every request costs Worker
 * CPU. Shared by every caller in the page through a module-level cache.
 */
export function useAdminAttention(): AttentionSnapshot | null {
  const [data, setData] = useState<AttentionSnapshot | null>(cached?.data ?? null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (cached && Date.now() - cached.at < MAX_AGE_MS) {
        setData(cached.data);
        return;
      }
      void load().then((next) => {
        if (active && next) setData(next);
      });
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return data;
}
