import React from "react";
import styles from "./wireframe.module.css";

/**
 * Shape kinds: `img` media placeholder, `play` video placeholder, `h` heading bar, `t` text
 * line, `btn` accent pill (button or badge), `box` outlined container, and `ho`/`to` heading and
 * text drawn on top of media.
 */
export type WireframeShapeKind = "img" | "play" | "h" | "t" | "btn" | "box" | "ho" | "to";
export type WireframeShape = readonly [
  kind: WireframeShapeKind,
  x: number,
  y: number,
  width: number,
  height: number,
];

const WIDTH = 120;
const HEIGHT = 80;

export const columns = (
  xs: readonly number[],
  build: (x: number) => WireframeShape[]
): WireframeShape[] => xs.flatMap(build);
export const rows = (
  ys: readonly number[],
  build: (y: number) => WireframeShape[]
): WireframeShape[] => ys.flatMap(build);

function renderShape(
  [kind, x, y, width, height]: WireframeShape,
  index: number
): React.JSX.Element {
  switch (kind) {
    case "img":
    case "play":
      return (
        <g key={index}>
          <rect x={x} y={y} width={width} height={height} rx={3} className={styles.media} />
          {kind === "img" ? (
            <path
              d={`M${x} ${y + height} L${x + width * 0.36} ${y + height * 0.5} L${x + width * 0.56} ${y + height * 0.74} L${x + width * 0.72} ${y + height * 0.58} L${x + width} ${y + height} Z`}
              className={styles.mediaDetail}
            />
          ) : (
            <path
              d={`M${x + width / 2 - 5} ${y + height / 2 - 7} L${x + width / 2 + 8} ${y + height / 2} L${x + width / 2 - 5} ${y + height / 2 + 7} Z`}
              className={styles.mediaDetail}
            />
          )}
        </g>
      );
    case "box":
      return (
        <rect
          key={index}
          x={x}
          y={y}
          width={width}
          height={height}
          rx={3}
          className={styles.outline}
        />
      );
    default:
      return (
        <rect
          key={index}
          x={x}
          y={y}
          width={width}
          height={height}
          rx={Math.min(height / 2, 3)}
          className={styles[kind]}
        />
      );
  }
}

export interface WireframeProps {
  shapes: readonly WireframeShape[];
  className?: string;
}

/**
 * Schematic of a layout on a 120 x 80 canvas. Decorative: the surrounding label and description
 * carry the meaning for assistive tech.
 */
export function Wireframe({ shapes, className }: WireframeProps): React.JSX.Element {
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={[styles.wireframe, className].filter(Boolean).join(" ")}
      aria-hidden="true"
      focusable="false"
    >
      {shapes.map(renderShape)}
    </svg>
  );
}
