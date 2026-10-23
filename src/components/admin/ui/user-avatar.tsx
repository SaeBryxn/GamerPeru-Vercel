"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./user-avatar.module.css";

/** "Bryan Espejo" → "BE"; an email → its first letter. */
export function initialsOf(name: string): string {
  const words = name.includes("@") ? [name] : name.trim().split(/\s+/);
  return (
    words
      .slice(0, 2)
      .map((word) => word[0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}

interface UserAvatarProps {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
}

/**
 * The operator's picture (Gravatar) or, when there is none, their initials. Decorative:
 * the name is always written next to it, so it stays out of the accessibility tree.
 */
export function UserAvatar({ name, src, size = "sm" }: UserAvatarProps) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  // A 404 that lands before hydration never reaches onError; catch it once mounted.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setFailed(true);
  }, [src]);
  return (
    <span className={styles.avatar} data-size={size} aria-hidden="true">
      {src && !failed ? (
        // A tiny remote avatar; next/image would need the host whitelisted for no gain.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imageRef}
          src={src}
          alt=""
          className={styles.image}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
