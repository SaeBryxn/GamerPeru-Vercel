"use client";

import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Briefcase,
  Cable,
  CircleDot,
  Ear,
  Grip,
  Grid3x3,
  Keyboard,
  Plus,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "./pdp-accessories.module.css";

export type AccessoryGlyph =
  "grip" | "skates" | "dots" | "keycaps" | "cable" | "tool" | "tips" | "case";

export interface PdpAccessory {
  id: string;
  name: string;
  priceCents: number;
  glyph: AccessoryGlyph;
}

const GLYPHS: Record<AccessoryGlyph, LucideIcon> = {
  grip: Grip,
  skates: CircleDot,
  dots: Grid3x3,
  keycaps: Keyboard,
  cable: Cable,
  tool: Wrench,
  tips: Ear,
  case: Briefcase,
};

export interface PdpAccessoriesProps {
  accessories: PdpAccessory[];
}

/**
 * "Añadir accesorios" box: collapsible list of add-on checkboxes. Selection is
 * local UI state for now; it is not sent to the cart.
 */
export function PdpAccessories({ accessories }: PdpAccessoriesProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className={styles.box} aria-labelledby="pdp-accessories-title">
      <button
        type="button"
        className={styles.header}
        aria-expanded={isOpen}
        aria-controls="pdp-accessories-list"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className={styles.headerLabel}>
          <Icon icon={Plus} size="sm" aria-hidden="true" />
          <span id="pdp-accessories-title">Añadir accesorios</span>
        </span>
        <motion.span
          className={styles.headerToggle}
          initial={false}
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
        >
          <Icon icon={Plus} size="sm" aria-hidden="true" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.ul
            id="pdp-accessories-list"
            className={styles.list}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {accessories.map((accessory) => (
              <li key={accessory.id}>
                <label className={styles.row}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={selected.has(accessory.id)}
                    onChange={() => toggle(accessory.id)}
                  />
                  <span className={styles.thumb} aria-hidden="true">
                    <Icon icon={GLYPHS[accessory.glyph]} size="md" />
                  </span>
                  <span className={styles.name}>{accessory.name}</span>
                  <span className={styles.price}>{formatCurrency(accessory.priceCents)}</span>
                </label>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}
