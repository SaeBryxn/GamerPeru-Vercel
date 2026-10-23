"use client";

/**
 * Adaptado de Spotlight Card de React Bits. Copyright (c) 2026 David Haz.
 * https://reactbits.dev/components/spotlight-card
 * Licencia: docs/licenses/react-bits.txt.
 * Versión para navegación: una luz local sin bucle, inclinación ni seguimiento global.
 */
import React, { useRef, type ComponentProps, type PointerEvent } from "react";
import Link from "next/link";
import styles from "./spotlight-link.module.css";

export function SpotlightLink({
  children,
  className,
  ...props
}: Omit<ComponentProps<typeof Link>, "onPointerMove" | "onPointerLeave" | "ref">) {
  const lightRef = useRef<HTMLSpanElement>(null);

  function positionLight(event: PointerEvent<HTMLAnchorElement>) {
    if (
      event.pointerType !== "mouse" ||
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const light = lightRef.current;
    if (!light) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // La luz es una capa decorativa; no mueve el contenido ni cambia el layout.
    light.style.transform = `translate(${event.clientX - rect.left - 120}px, ${event.clientY - rect.top - 120}px)`;
    light.style.opacity = "1";
  }

  function hideLight() {
    if (lightRef.current) lightRef.current.style.opacity = "0";
  }

  return (
    <Link
      {...props}
      className={[styles.card, className].filter(Boolean).join(" ")}
      onPointerMove={positionLight}
      onPointerLeave={hideLight}
      onBlur={hideLight}
    >
      <span className={styles.lightClip} aria-hidden="true">
        <span ref={lightRef} className={styles.light} />
      </span>
      {children}
    </Link>
  );
}
