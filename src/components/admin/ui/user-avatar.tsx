"use client";

import React, { useEffect, useRef, useState } from "react";
import { Blobatar } from "@blobatar/react";
import styles from "./user-avatar.module.css";

interface UserAvatarProps {
  name: string;
  /** Stable key for the generated avatar; the email, so it never changes with the name. */
  seed?: string | null;
  src?: string | null;
  size?: "sm" | "md" | "lg";
}

const PIXELS = { sm: 28, md: 36, lg: 44 } as const;

/**
 * The operator's Gravatar photo or, when there is none, their blobatar: a little blob
 * generated from the email, the same on every screen and with no network request.
 * Decorative: the name is always written next to it, so it stays out of the a11y tree.
 */
export function UserAvatar({ name, seed, src, size = "sm" }: UserAvatarProps) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  // A 404 that lands before hydration never reaches onError; catch it once mounted.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setFailed(true);
  }, [src]);
  return (
    <span
      className={styles.avatar}
      data-size={size}
      data-kind={src && !failed ? "photo" : "blob"}
      aria-hidden="true"
    >
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
        <Blobatar name={seed ?? name} size={PIXELS[size]} alt="" className={styles.image} />
      )}
    </span>
  );
}
