import { STORE_WHATSAPP } from "@/config/features";
import { publicEnv } from "@/config/public-env";

/** The store's WhatsApp line: the deployment's override, else the configured store number. */
export function storeWhatsAppNumber(): string | null {
  return publicEnv.NEXT_PUBLIC_WHATSAPP_NUMBER ?? (STORE_WHATSAPP || null);
}

/**
 * wa.me link to the store with a prefilled message, or null while no number is configured:
 * a link that opens WhatsApp without a recipient helps nobody.
 */
export function buildWhatsAppHref(message: string): string | null {
  const number = storeWhatsAppNumber();
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
