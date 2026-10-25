"use client";

import React, { useState, useId } from "react";
import { AnimatePresence, m } from "framer-motion";
import {
  Briefcase,
  Cable,
  CircleDot,
  Ear,
  Grip,
  Grid3x3,
  Keyboard,
  Plus,
  Tag,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { Icon } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "./pdp-accessories.module.css";

export type AccessoryGlyph =
  "grip" | "skates" | "dots" | "keycaps" | "cable" | "tool" | "tips" | "case";

export interface PdpAccessory {
  id: string;
  name: string;
  priceCents: number;
  glyph?: AccessoryGlyph;
  imageUrl?: string | null;
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
  selected?: ReadonlySet<string>;
  onToggle?: (id: string) => void;
  disabled?: boolean;
}

/** Selection is owned by the purchase panel and submitted with the main variant. */
export function PdpAccessories({ accessories, selected, onToggle, disabled }: PdpAccessoriesProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [localSelected, setLocalSelected] = useState<ReadonlySet<string>>(() => new Set());
  const id = useId();
  const activeSelected = selected ?? localSelected;
  const toggle = (itemId: string) => {
    if (onToggle) {
      onToggle(itemId);
      return;
    }
    setLocalSelected((previous) => {
      const next = new Set(previous);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  return (
    <section className={styles.box} aria-labelledby={`${id}-title`}>
      <button
        type="button"
        className={styles.header}
        aria-expanded={isOpen}
        aria-controls={`${id}-list`}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className={styles.headerLabel}>
          <Icon icon={Tag} size="sm" aria-hidden="true" />
          <span id={`${id}-title`}>Más Accesorios</span>
        </span>
        <m.span
          className={styles.headerToggle}
          initial={false}
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
        >
          <Icon icon={Plus} size="sm" aria-hidden="true" />
        </m.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <m.ul
            id={`${id}-list`}
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
                    checked={activeSelected.has(accessory.id)}
                    disabled={disabled}
                    onChange={() => toggle(accessory.id)}
                  />
                  <span className={styles.thumb} aria-hidden="true">
                    {accessory.imageUrl ? (
                      <Image
                        src={accessory.imageUrl}
                        alt=""
                        width={40}
                        height={40}
                        className={styles.image}
                      />
                    ) : (
                      <Icon icon={GLYPHS[accessory.glyph ?? "case"]} size="md" />
                    )}
                  </span>
                  <span className={styles.name}>{accessory.name}</span>
                  <span className={styles.price}>{formatCurrency(accessory.priceCents)}</span>
                </label>
              </li>
            ))}
          </m.ul>
        )}
      </AnimatePresence>
    </section>
  );
}
