"use client";

import React, { useState } from "react";
import Image from "next/image";

export interface MegaMenuImageProps {
  src: string;
  sizes: string;
  className?: string;
}

/**
 * Decorative fill image for mega-menu cards. A missing upload collapses to the
 * card surface instead of showing a broken-image icon.
 */
export function MegaMenuImage({ src, sizes, className }: MegaMenuImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (failedSrc === src) return null;

  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
}
