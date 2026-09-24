/**
 * Public profiles shown in the floating social rail, plus the promo pill at
 * its base.
 *
 * Fill in each `href` with the real Gamer Perú profile URL. Entries left empty
 * still render their icon, but as a non-interactive placeholder, so the rail
 * never links visitors to an account that is not ours. The promo pill is
 * hidden until `PROMO_PILL.href` points somewhere real.
 */

export type SocialNetworkId = "x" | "instagram" | "youtube" | "tiktok" | "discord";

export interface SocialLink {
  id: SocialNetworkId;
  label: string;
  href: string;
}

export const SOCIAL_LINKS: SocialLink[] = [
  { id: "x", label: "X", href: "" },
  { id: "instagram", label: "Instagram", href: "" },
  { id: "youtube", label: "YouTube", href: "" },
  { id: "tiktok", label: "TikTok", href: "" },
  { id: "discord", label: "Discord", href: "" },
];

export const PROMO_PILL = {
  label: "GET 5% OFF",
  /** Landing page or form that actually grants the discount. */
  href: "",
};
