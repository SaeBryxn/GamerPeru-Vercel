"use client";

import React from "react";
import { m, type Variants } from "framer-motion";
import { X } from "lucide-react";
import { Icon } from "../icon";
import { DOME_TRANSITION, DomeButton, type DomeButtonProps } from "./dome-button";
import styles from "./dome-button.module.css";

// Driven by the parent DomeButton's rest/hover state, in the same timing as the fill.
const ICON_VARIANTS: Variants = {
  rest: { rotate: 0, transition: DOME_TRANSITION },
  hover: { rotate: 90, transition: DOME_TRANSITION },
};

export type CloseButtonProps = Omit<DomeButtonProps, "children" | "domeRise">;

/** Circular close control: the dome fills it and the X turns a quarter turn. */
export function CloseButton({ className, ...rest }: CloseButtonProps) {
  return (
    <DomeButton
      domeRise="-75%"
      className={[styles.closeButton, className].filter(Boolean).join(" ")}
      {...rest}
    >
      <m.span className={styles.closeIcon} variants={ICON_VARIANTS}>
        <Icon icon={X} size="md" aria-hidden="true" />
      </m.span>
    </DomeButton>
  );
}
