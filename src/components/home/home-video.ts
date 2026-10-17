"use client";

import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/components/ui/use-prefers-reduced-motion";

/** A home video as the storefront renders it: a YouTube embed or a self-hosted file. */
export type HomeVideoSource =
  | { kind: "youtube"; videoId: string }
  | { kind: "upload"; src: string | null; posterSrc: string | null };

interface NetworkInformationLike {
  saveData?: boolean;
}

/**
 * Whether a background video may start on its own. Reduced-motion visitors and connections
 * asking to save data get the still poster until they press play.
 */
export function useAutoplayAllowed(): boolean {
  const reducedMotion = usePrefersReducedMotion();
  const [saveData, setSaveData] = useState(false);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformationLike })
      .connection;
    setSaveData(Boolean(connection?.saveData));
  }, []);

  // Unknown until hydration, so the server never ships a playing file.
  return reducedMotion === false && !saveData;
}
