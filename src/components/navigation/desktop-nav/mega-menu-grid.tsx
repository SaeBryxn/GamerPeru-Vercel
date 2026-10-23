"use client";

import React from "react";
import Link from "@/components/app-link";
import { motion } from "framer-motion";
import { Cpu, Keyboard, Mouse, Usb, type LucideIcon } from "lucide-react";
import type { MegaMenuCategory, MegaMenuTileIcon } from "../types";
import { MegaMenuArrow, MegaMenuArrowLink } from "./mega-menu-arrow-link";
import { MegaMenuImage } from "./mega-menu-image";
import {
  RISE_FROM_BELOW,
  SLIDE_FROM_RIGHT,
  staggerVariants,
  useOpenCount,
} from "./mega-menu-motion";
import styles from "./mega-menu-grid.module.css";

const MotionLink = motion.create(Link);

const TILE_ICONS: Record<MegaMenuTileIcon, LucideIcon> = {
  mouse: Mouse,
  keyboard: Keyboard,
  usb: Usb,
  cpu: Cpu,
};

const LAYOUT_VARIANTS = staggerVariants(0.1, 0.12);

export interface MegaMenuGridProps {
  category: MegaMenuCategory;
  isOpen: boolean;
  onNavigate: () => void;
}

/** One row of square tiles. Used by "Mousepads" and "Software". */
export function MegaMenuGrid({ category, isOpen, onNavigate }: MegaMenuGridProps) {
  const openCount = useOpenCount(isOpen);
  const tiles = category.tiles ?? [];

  return (
    <motion.div key={openCount} variants={LAYOUT_VARIANTS} initial="hidden" animate="visible">
      <motion.div className={styles.gridHeader} variants={SLIDE_FROM_RIGHT}>
        <h2 className={styles.gridEyebrow}>{category.label}</h2>
        <MegaMenuArrowLink href={category.href} className={styles.viewAll} onClick={onNavigate}>
          Ver todo
        </MegaMenuArrowLink>
      </motion.div>

      <div className={styles.tileRow}>
        {tiles.map((tile) => (
          <motion.div key={tile.href} variants={RISE_FROM_BELOW}>
            <MotionLink
              href={tile.href}
              className={[styles.tile, tile.tone === "feature" ? styles.tileFeature : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={onNavigate}
              initial="rest"
              animate="rest"
              whileHover="hover"
              whileFocus="hover"
            >
              <span className={styles.tileMedia}>
                {tile.image ? (
                  <MegaMenuImage
                    src={tile.image}
                    sizes="(min-width: 1536px) 20vw, 25vw"
                    className={styles.tileImage}
                  />
                ) : tile.icon ? (
                  <TileIcon icon={tile.icon} />
                ) : null}
              </span>
              <span className={styles.tileFooter}>
                <span className={styles.tileTitle}>{tile.title}</span>
                <MegaMenuArrow size="md" />
              </span>
            </MotionLink>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function TileIcon({ icon }: { icon: MegaMenuTileIcon }) {
  const Glyph = TILE_ICONS[icon];
  return (
    <span className={styles.tileIcon} aria-hidden="true">
      <Glyph size={56} strokeWidth={1.5} />
    </span>
  );
}
