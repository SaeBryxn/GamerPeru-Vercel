import React from "react";
import Link from "next/link";
import styles from "./announcement-bar.module.css";

export interface AnnouncementBarProps {
  message?: string;
  href?: string;
}

export function AnnouncementBar({ message, href }: AnnouncementBarProps) {
  if (!message) {
    return null;
  }

  return (
    <aside aria-label="Anuncio" className={styles.announcementBar}>
      <div className={styles.content}>
        {href ? (
          <Link href={href} className={styles.link}>
            <span>{message}</span>
          </Link>
        ) : (
          <span>{message}</span>
        )}
      </div>
    </aside>
  );
}
