import React from "react";
import { BRAND_GLYPH_PATHS } from "./brand-glyphs";

export type BrandGlyphId = keyof typeof BRAND_GLYPH_PATHS;

export interface BrandGlyphProps {
  id: BrandGlyphId;
  size?: number;
}

/** Social network logo, drawn in the current text color. */
export function BrandGlyph({ id, size = 18 }: BrandGlyphProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d={BRAND_GLYPH_PATHS[id]} />
    </svg>
  );
}
