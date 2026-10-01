"use client";

import React from "react";
import Link from "next/link";
import { motion, type HTMLMotionProps, type Transition, type Variants } from "framer-motion";
import styles from "./dome-button.module.css";

/**
 * Shared timing for every dome fill in the storefront, so buttons, close
 * controls and card actions all rise and settle in sync. The curve is
 * --motion-easing-snappy: most of the travel happens in the first frames, so
 * the fill answers the pointer immediately. A longer duration only adds a tail
 * the eye reads as lag.
 */
export const DOME_TRANSITION: Transition = { duration: 0.4, ease: [0.16, 1, 0.3, 1] };

export type DomeTone = "light" | "dark";

const TONE_COLORS: Record<DomeTone, { rest: string; hover: string }> = {
  light: { rest: "var(--color-text-primary)", hover: "var(--color-surface-card)" },
  dark: { rest: "var(--color-surface-card)", hover: "var(--color-surface-card)" },
};

export interface DomeButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  /** `light`: white base, black dome. `dark`: black base, brand-red dome with a white label. */
  tone?: DomeTone;
  /**
   * How far the dome rises on hover, as a fraction of its own diameter (the
   * dome is twice the button width). Wide buttons need less than square ones
   * for the curved edge to clear the top corners.
   */
  domeRise?: string;
  /** Overrides the hovered label color (defaults to the tone's own). */
  hoverColor?: string;
  children: React.ReactNode;
}

/**
 * Button whose hover fills it with an oversized circle rising from below, so
 * the leading edge reads as a liquid dome. The label color crossfades in the
 * same timing. Size, radius and border come from the consumer through
 * --dome-* custom properties.
 */
const MotionLink = motion.create(Link);

function domeVariantsFor(domeRise: string): Variants {
  return {
    rest: { y: "0%", transition: DOME_TRANSITION },
    hover: { y: domeRise, transition: DOME_TRANSITION },
  };
}

/**
 * Dark buttons fill with the same red the social icons use on hover, so primary actions and the
 * social rail answer the pointer in one color. The label stays white on it (5:1 contrast).
 */
const DARK_ROOT_VARIANTS: Variants = {
  rest: { borderColor: "var(--color-surface-dark-canvas)", transition: DOME_TRANSITION },
  hover: { borderColor: "var(--color-accent-red-soft)", transition: DOME_TRANSITION },
};

const ACCENT_RING_VARIANTS: Variants = {
  rest: { opacity: 0, transition: DOME_TRANSITION },
  hover: { opacity: 1, transition: DOME_TRANSITION },
};

function contentVariantsFor(tone: DomeTone, hoverColor?: string): Variants {
  const colors = TONE_COLORS[tone];
  return {
    rest: { color: colors.rest, transition: DOME_TRANSITION },
    hover: { color: hoverColor ?? colors.hover, transition: DOME_TRANSITION },
  };
}

/** The rising dome plus the label layer, shared by the button and link variants. */
function DomeLayers({
  tone,
  domeRise,
  hoverColor,
  children,
}: {
  tone: DomeTone;
  domeRise: string;
  hoverColor?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {tone === "dark" && (
        <motion.span
          className={styles.accentRing}
          variants={ACCENT_RING_VARIANTS}
          aria-hidden="true"
        />
      )}
      <motion.span
        className={styles.dome}
        variants={domeVariantsFor(domeRise)}
        aria-hidden="true"
      />
      <motion.span className={styles.content} variants={contentVariantsFor(tone, hoverColor)}>
        {children}
      </motion.span>
    </>
  );
}

export function DomeButton({
  tone = "light",
  domeRise = "-30%",
  hoverColor,
  className,
  children,
  type = "button",
  ...rest
}: DomeButtonProps) {
  return (
    <motion.button
      type={type}
      className={[styles.domeButton, styles[tone], className].filter(Boolean).join(" ")}
      variants={tone === "dark" ? DARK_ROOT_VARIANTS : undefined}
      initial="rest"
      animate="rest"
      whileHover="hover"
      {...rest}
    >
      <DomeLayers tone={tone} domeRise={domeRise} hoverColor={hoverColor}>
        {children}
      </DomeLayers>
    </motion.button>
  );
}

export interface DomeLinkProps extends Omit<HTMLMotionProps<"a">, "children" | "href"> {
  href: string;
  tone?: DomeTone;
  domeRise?: string;
  hoverColor?: string;
  children: React.ReactNode;
}

/** Same dome interaction for actions that navigate. */
export function DomeLink({
  href,
  tone = "light",
  domeRise = "-30%",
  hoverColor,
  className,
  children,
  ...rest
}: DomeLinkProps) {
  return (
    <MotionLink
      href={href}
      className={[styles.domeButton, styles[tone], className].filter(Boolean).join(" ")}
      variants={tone === "dark" ? DARK_ROOT_VARIANTS : undefined}
      initial="rest"
      animate="rest"
      whileHover="hover"
      {...rest}
    >
      <DomeLayers tone={tone} domeRise={domeRise} hoverColor={hoverColor}>
        {children}
      </DomeLayers>
    </MotionLink>
  );
}
