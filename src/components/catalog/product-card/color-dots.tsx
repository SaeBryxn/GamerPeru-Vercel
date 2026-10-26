import React from "react";
import Link from "@/components/app-link";
import type { ProductCardColor } from "@/lib/catalog/types";
import styles from "./color-dots.module.css";

/** Dots beyond this collapse into "+N", so a long palette never wraps the card. */
const MAX_DOTS = 5;

const COLOR_HEX: Record<string, string> = {
  negro: "#151515",
  black: "#151515",
  blanco: "#f4f4f4",
  white: "#f4f4f4",
  gris: "#9ca3af",
  gray: "#9ca3af",
  grey: "#9ca3af",
  plata: "#c7c9cc",
  silver: "#c7c9cc",
  dorado: "#c9a227",
  gold: "#c9a227",
  rojo: "#d32f2f",
  red: "#d32f2f",
  naranja: "#f57c00",
  orange: "#f57c00",
  amarillo: "#fbc02d",
  yellow: "#fbc02d",
  verde: "#8bc34a",
  green: "#8bc34a",
  azul: "#1e6fd9",
  blue: "#1e6fd9",
  celeste: "#7cc4f2",
  morado: "#7e57c2",
  violeta: "#7e57c2",
  purple: "#7e57c2",
  rosado: "#f48fb1",
  rosa: "#f48fb1",
  pink: "#f48fb1",
};

const UNKNOWN_HEX = "#c4c4c4";

function hexOf(part: string): string {
  const key = part
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .find((word) => COLOR_HEX[word]);
  return key ? COLOR_HEX[key]! : UNKNOWN_HEX;
}

/** "Negro / Dorado" paints half and half; a single colour fills the dot. */
function swatchBackground(name: string): string {
  const parts = name.split(/\s*[/+&]\s*/).filter(Boolean);
  if (parts.length < 2) return hexOf(name);
  return `linear-gradient(135deg, ${hexOf(parts[0]!)} 50%, ${hexOf(parts[1]!)} 50%)`;
}

export interface ColorDotsProps {
  colors: ProductCardColor[];
  /** Product page; each dot opens it with that colour selected. Without it the dots only show. */
  href?: string;
}

export function ColorDots({ colors, href }: ColorDotsProps): React.JSX.Element | null {
  if (colors.length < 2) return null;
  const shown = colors.slice(0, MAX_DOTS);
  const hidden = colors.length - shown.length;

  return (
    <ul className={styles.dots} aria-label={`${colors.length} colores disponibles`}>
      {shown.map((color) => {
        const dot = (
          <span
            className={styles.dot}
            style={{ background: swatchBackground(color.name) }}
            aria-hidden="true"
          />
        );
        return (
          <li key={color.name} className={styles.item} title={color.name}>
            {href ? (
              <Link
                href={`${href}?color=${encodeURIComponent(color.variantSlug)}`}
                className={styles.link}
                aria-label={`Ver en ${color.name}`}
              >
                {dot}
              </Link>
            ) : (
              <>
                {dot}
                <span className={styles.srOnly}>{color.name}</span>
              </>
            )}
          </li>
        );
      })}
      {hidden > 0 && (
        <li className={styles.more} aria-label={`y ${hidden} más`}>
          +{hidden}
        </li>
      )}
    </ul>
  );
}
