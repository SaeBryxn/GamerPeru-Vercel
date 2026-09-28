import type { Variants } from "framer-motion";

export const AUTH_CARD_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

/**
 * Forms run their own stagger instead of inheriting the card's: they mount after hydration
 * (useSearchParams under Suspense), when the card has already finished animating.
 */
export const AUTH_LIST_VARIANTS: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.08 } },
};

export const AUTH_ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};
