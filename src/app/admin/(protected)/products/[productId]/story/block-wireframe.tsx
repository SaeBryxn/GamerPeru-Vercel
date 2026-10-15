import React from "react";
import type { StoryBlockType } from "@/lib/admin/catalog/story-builder-model";
import {
  Wireframe,
  columns,
  rows,
  type WireframeShape as Shape,
} from "@/components/admin/wireframe/wireframe";

/** Schematic of how each block lays out on the published product page. */
const WIREFRAMES: Record<StoryBlockType, readonly Shape[]> = {
  hero_media: [
    ["img", 0, 0, 120, 80],
    ["ho", 12, 42, 62, 7],
    ["to", 12, 54, 44, 4],
    ["btn", 12, 63, 26, 8],
  ],
  full_bleed_image: [
    ["img", 0, 8, 120, 54],
    ["t", 36, 69, 48, 4],
  ],
  image_text: [
    ["img", 6, 12, 50, 56],
    ["h", 64, 16, 44, 6],
    ["t", 64, 29, 50, 4],
    ["t", 64, 37, 50, 4],
    ["t", 64, 45, 36, 4],
    ["btn", 64, 56, 22, 7],
  ],
  stat_highlight: columns([10, 48, 86], (x) => [
    ["h", x, 24, 24, 13],
    ["t", x, 44, 24, 4],
    ["t", x, 52, 16, 4],
  ]),
  spec_feature: [
    ["btn", 8, 12, 20, 6],
    ["h", 8, 25, 46, 6],
    ["t", 8, 38, 50, 4],
    ["t", 8, 46, 50, 4],
    ["t", 8, 54, 34, 4],
    ["img", 66, 10, 48, 60],
  ],
  video: [
    ["play", 6, 6, 108, 54],
    ["h", 6, 66, 50, 5],
    ["t", 6, 74, 34, 3],
  ],
  gallery: [
    ["img", 6, 10, 52, 60],
    ["img", 62, 10, 24, 28],
    ["img", 90, 10, 24, 28],
    ["img", 62, 42, 24, 28],
    ["img", 90, 42, 24, 28],
  ],
  comparison: [
    ["box", 6, 8, 108, 64],
    ["h", 44, 14, 26, 5],
    ["h", 80, 14, 26, 5],
    ...rows([28, 40, 52, 62], (y): Shape[] => [
      ["t", 12, y, 22, 4],
      ["t", 44, y, 26, 4],
      ["t", 80, y, 26, 4],
    ]),
  ],
  dimensions: [
    ["box", 6, 10, 56, 60],
    ["t", 20, 38, 28, 4],
    ...rows([16, 31, 46, 61], (y): Shape[] => [
      ["t", 70, y, 18, 4],
      ["h", 92, y - 1, 20, 6],
    ]),
  ],
  box_contents: [
    ["h", 8, 8, 40, 5],
    ...columns([8, 45, 82], (x) => [
      ["box", x, 20, 30, 34],
      ["t", x, 60, 30, 4],
      ["t", x, 68, 18, 4],
    ]),
  ],
  technical_specs: [
    ["h", 8, 8, 36, 5],
    ...rows([22, 33, 44, 55, 66], (y): Shape[] => [
      ["t", 8, y, 30, 4],
      ["t", 70, y, 42, 4],
    ]),
  ],
  faq: rows([8, 26, 44, 62], (y) => [
    ["box", 6, y, 108, 13],
    ["t", 12, y + 5, 58, 4],
    ["h", 102, y + 5, 6, 4],
  ]),
  related_products: columns([6, 35, 64, 93], (x) => [
    ["img", x, 14, 22, 30],
    ["t", x, 50, 22, 4],
    ["h", x, 58, 14, 4],
  ]),
};

export interface BlockWireframeProps {
  type: StoryBlockType;
  className?: string;
}

/** Decorative: the block's label and description carry the meaning for assistive tech. */
export function BlockWireframe({ type, className }: BlockWireframeProps): React.JSX.Element {
  return <Wireframe shapes={WIREFRAMES[type]} className={className} />;
}
