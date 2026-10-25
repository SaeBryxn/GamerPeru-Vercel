"use client";

import React, { useEffect, useState } from "react";
import { m, useReducedMotion } from "framer-motion";

// Client-only: flips after the first page hydrates, so every later template mount is a navigation.
let hasHydrated = false;

/**
 * Storefront page transition.
 *
 * A template remounts on every navigation, which is what gives each page its entrance without
 * any router plumbing. The movement is deliberately small: it runs on top of content the visitor
 * is about to read, so it should register as settling rather than as an effect.
 *
 * The first page load is not animated. Its HTML comes from the server, and rendering it hidden
 * would keep the page blank until JavaScript hydrates, which delays the largest paint.
 */
export default function StorefrontTemplate({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  const prefersReducedMotion = useReducedMotion();
  const [isNavigation] = useState(() => hasHydrated);

  // The transform is released once the entrance lands. Left in place it would become the
  // containing block for the pinned hero and the fixed rails these pages rely on.
  const [hasLanded, setHasLanded] = useState(!isNavigation);

  useEffect(() => {
    hasHydrated = true;
  }, []);

  return (
    <m.div
      initial={
        isNavigation ? (prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }) : false
      }
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={() => setHasLanded(true)}
      style={hasLanded ? { transform: "none" } : undefined}
    >
      {children}
    </m.div>
  );
}
