import React from "react";
import styles from "./skip-link.module.css";

export interface SkipLinkProps {
  targetId?: string;
  children?: React.ReactNode;
}

export function SkipLink({
  targetId = "main-content",
  children = "Saltar al contenido principal",
}: SkipLinkProps) {
  return (
    <a href={`#${targetId}`} className={styles.skipLink}>
      {children}
    </a>
  );
}
