"use client";

import React, { useState } from "react";
import Image from "next/image";

export interface HomeImageProps {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
}

/**
 * Editorial image for the homepage. Art files live under public/images/home;
 * until one is uploaded the slot collapses to its container surface instead of
 * a broken-image icon.
 */
export function HomeImage({ src, alt, sizes, className, priority }: HomeImageProps) {
  const [hasFailed, setHasFailed] = useState(false);
  if (hasFailed) return null;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={className}
      draggable={false}
      onError={() => setHasFailed(true)}
    />
  );
}
