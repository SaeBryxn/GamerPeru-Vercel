"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { SocialRail } from "./social-rail";

/**
 * The social rail belongs to the home page only. Everywhere else, from the catalog to the order
 * confirmation, it would compete with the page's own task.
 */
export function HomeSocialRail(): React.JSX.Element | null {
  const pathname = usePathname();
  return pathname === "/" ? <SocialRail /> : null;
}
