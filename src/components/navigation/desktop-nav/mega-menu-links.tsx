"use client";

import React from "react";
import Link from "@/components/app-link";
import { m } from "framer-motion";
import { SweepUnderline } from "@/components/ui/sweep-underline";
import type { MegaMenuCategory } from "../types";
import { SLIDE_FROM_RIGHT, staggerVariants, useOpenCount } from "./mega-menu-motion";
import styles from "./mega-menu-links.module.css";

const ROW_VARIANTS = staggerVariants(0.1, 0.12);

export interface MegaMenuLinksProps {
  category: MegaMenuCategory;
  isOpen: boolean;
  onNavigate: () => void;
}

/** One evenly spaced row of large text links. Used by "Soporte". */
export function MegaMenuLinks({ category, isOpen, onNavigate }: MegaMenuLinksProps) {
  const openCount = useOpenCount(isOpen);
  const links = category.sections.flatMap((section) => section.items);

  return (
    <m.ul
      key={openCount}
      className={styles.linkRow}
      variants={ROW_VARIANTS}
      initial="hidden"
      animate="visible"
    >
      {links.map((link) => (
        <m.li key={link.href} variants={SLIDE_FROM_RIGHT}>
          <Link href={link.href} className={styles.link} onClick={onNavigate}>
            <SweepUnderline trigger="link">{link.label}</SweepUnderline>
          </Link>
        </m.li>
      ))}
    </m.ul>
  );
}
