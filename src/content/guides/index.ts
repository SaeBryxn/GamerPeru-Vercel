import { MOUSE_GUIDE } from "./mouses";
import { MOUSEPAD_GUIDE } from "./mousepads";
import { KEYBOARD_GUIDE } from "./teclados";
import type { BuyingGuide } from "./types";

export type { BuyingGuide, GuideCriterion, GuideOption, GuideProfile } from "./types";

export const BUYING_GUIDES: BuyingGuide[] = [MOUSE_GUIDE, KEYBOARD_GUIDE, MOUSEPAD_GUIDE];

export function getBuyingGuide(slug: string): BuyingGuide | undefined {
  return BUYING_GUIDES.find((guide) => guide.slug === slug);
}
