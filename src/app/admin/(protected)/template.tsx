"use client";

import React from "react";
import { m } from "framer-motion";

/**
 * Next.js remounts a template on every navigation inside this segment, within the router's own
 * tree, so each admin screen can fade in without the shell re-keying (and losing) route state.
 * Enter only: an exit animation would hold the previous screen while the next one is ready.
 */
export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </m.div>
  );
}
