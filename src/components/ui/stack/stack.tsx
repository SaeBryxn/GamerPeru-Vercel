import React from "react";
import styles from "./stack.module.css";

export type StackDirection = "horizontal" | "vertical";
export type StackGap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;
export type StackAlign = "start" | "center" | "end" | "stretch" | "baseline";
export type StackJustify = "start" | "center" | "end" | "between" | "around";
export type StackWrap = "nowrap" | "wrap" | "wrap-reverse";

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: StackDirection;
  gap?: StackGap;
  align?: StackAlign;
  justify?: StackJustify;
  wrap?: StackWrap;
  as?: React.ElementType;
  children: React.ReactNode;
}

export function Stack({
  direction = "horizontal",
  gap = 0,
  align,
  justify,
  wrap = "nowrap",
  as: Component = "div",
  className,
  children,
  ...rest
}: StackProps) {
  const directionClass = direction === "vertical" ? styles.vertical : styles.horizontal;

  const gapClass =
    gap === 1
      ? styles.gap1
      : gap === 2
        ? styles.gap2
        : gap === 3
          ? styles.gap3
          : gap === 4
            ? styles.gap4
            : gap === 5
              ? styles.gap5
              : gap === 6
                ? styles.gap6
                : gap === 8
                  ? styles.gap8
                  : gap === 10
                    ? styles.gap10
                    : gap === 12
                      ? styles.gap12
                      : styles.gap0;

  const alignClass =
    align === "start"
      ? styles.alignStart
      : align === "center"
        ? styles.alignCenter
        : align === "end"
          ? styles.alignEnd
          : align === "stretch"
            ? styles.alignStretch
            : align === "baseline"
              ? styles.alignBaseline
              : "";

  const justifyClass =
    justify === "start"
      ? styles.justifyStart
      : justify === "center"
        ? styles.justifyCenter
        : justify === "end"
          ? styles.justifyEnd
          : justify === "between"
            ? styles.justifyBetween
            : justify === "around"
              ? styles.justifyAround
              : "";

  const wrapClass =
    wrap === "wrap" ? styles.wrap : wrap === "wrap-reverse" ? styles.wrapReverse : styles.nowrap;

  const classNames = [
    styles.stack,
    directionClass,
    gapClass,
    alignClass,
    justifyClass,
    wrapClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Component className={classNames} {...rest}>
      {children}
    </Component>
  );
}
