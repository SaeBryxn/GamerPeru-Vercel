"use client";

import React, { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Storefront page transition.
 *
 * A template remounts on every navigation, which is what gives each page its entrance without
 * any router plumbing. The movement is deliberately small: it runs on top of content the visitor
 * is about to read, so it should register as settling rather than as an effect.
 */
export default function StorefrontTemplate({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  const prefersReducedMotion = useReducedMotion();

  // The transform is released once the entrance lands. Left in place it would become the
  // containing block for the pinned hero and the fixed rails these pages rely on.
  const [hasLanded, setHasLanded] = useState(false);

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={() => setHasLanded(true)}
      style={hasLanded ? { transform: "none" } : undefined}
    >
      {children}
    </motion.div>
  );
}
