"use client";

import React from "react";
import { m, type Variants } from "framer-motion";

const GROUP_VARIANTS: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

// Short and linear-out: a dashboard should settle, not perform.
const ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] } },
};

/** Reveals its StaggerItem descendants one after another, 50ms apart. */
export function Stagger({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <m.div className={className} variants={GROUP_VARIANTS} initial="hidden" animate="visible">
      {children}
    </m.div>
  );
}

export function StaggerItem({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <m.div className={className} variants={ITEM_VARIANTS}>
      {children}
    </m.div>
  );
}
