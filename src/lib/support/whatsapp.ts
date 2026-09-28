import { publicEnv } from "@/config/public-env";

/**
 * wa.me link to the store with a prefilled message, or null while no number is configured:
 * a link that opens WhatsApp without a recipient helps nobody.
 */
export function buildWhatsAppHref(message: string): string | null {
  const number = publicEnv.NEXT_PUBLIC_WHATSAPP_NUMBER;
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
