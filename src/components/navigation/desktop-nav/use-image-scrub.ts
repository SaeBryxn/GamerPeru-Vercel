"use client";

import type React from "react";
import { useState } from "react";

/**
 * Maps the cursor's horizontal position over a media container to one of
 * `count` equal-width zones: Math.floor((offsetX / width) * count), clamped to
 * [0, count - 1] so the right edge still resolves to the last image.
 *
 * The offset is derived from the container's bounding box instead of
 * `nativeEvent.offsetX`, which is relative to whichever child element is under
 * the cursor (an <img>, the quick-view button) and would skew the zones.
 */
export function useImageScrub(count: number) {
  const [index, setIndex] = useState(0);

  function onMouseMove(event: React.MouseEvent<HTMLElement>) {
    const { left, width } = event.currentTarget.getBoundingClientRect();
    if (width === 0 || count < 2) return;

    const offsetX = event.clientX - left;
    const zone = Math.floor((offsetX / width) * count);
    setIndex(Math.min(Math.max(zone, 0), count - 1));
  }

  function onMouseLeave() {
    setIndex(0);
  }

  return { index, onMouseMove, onMouseLeave };
}
