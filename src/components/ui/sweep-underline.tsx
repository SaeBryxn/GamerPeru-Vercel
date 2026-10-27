import type { ReactNode } from "react";
import styles from "./sweep-underline.module.css";

/** One inline treatment for links and card titles, including names that wrap onto several lines. */
export function SweepUnderline({
  children,
  trigger = "self",
  className,
}: {
  children: ReactNode;
  /** Cards react to their title only; standalone links can use their full hit area. */
  trigger?: "self" | "link";
  className?: string;
}) {
  return (
    <span
      className={[styles.text, className].filter(Boolean).join(" ")}
      data-sweep-underline
      data-sweep-trigger={trigger}
    >
      {children}
    </span>
  );
}
