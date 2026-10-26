/**
 * Public profiles shown in the footer and the home page's floating social rail, plus the promo
 * pill at the rail's base.
 *
 * Only profiles with an `href` are shown: an icon that leads nowhere reads as broken. Add the URL
 * of X or YouTube here once the account exists and it appears everywhere.
 */

export type SocialNetworkId = "x" | "instagram" | "youtube" | "tiktok" | "discord" | "whatsapp";

export interface SocialLink {
  id: SocialNetworkId;
  label: string;
  href: string;
}

export const SOCIAL_LINKS: SocialLink[] = [
  { id: "x", label: "X", href: "" },
  { id: "instagram", label: "Instagram", href: "https://www.instagram.com/gamerperuoficial/" },
  { id: "youtube", label: "YouTube", href: "https://www.youtube.com/@GamerPeru-PE" },
  { id: "tiktok", label: "TikTok", href: "https://www.tiktok.com/@gamer_peru" },
  { id: "discord", label: "Discord", href: "https://discord.gg/mehPGmxv7d" },
  // Community group, not the store line: questions go to the floating WhatsApp button.
  {
    id: "whatsapp",
    label: "Grupo de WhatsApp",
    href: "https://chat.whatsapp.com/CThB5kZALpSGxIdwJLzPAa",
  },
];

/** The profiles that exist, in display order. */
export const ACTIVE_SOCIAL_LINKS = SOCIAL_LINKS.filter((link) => link.href);

/**
 * Switch for the promo pill. Off while there is no discount to give: set it to true, with a real
 * `label` and `href`, when a campaign starts.
 */
export const PROMO_PILL_ENABLED = false;

export const PROMO_PILL = {
  label: "5% DE DESCUENTO",
  /** Landing page or form that actually grants the discount. */
  href: "",
};
