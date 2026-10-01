/**
 * Legal documents listed in the footer.
 *
 * Set each `href` once its page is published. Entries left empty still show their label, but as
 * plain text, so the footer never links visitors to a page that does not exist.
 */

export interface LegalLink {
  label: string;
  href: string;
}

export const LEGAL_LINKS: LegalLink[] = [
  { label: "Política de reembolsos", href: "" },
  { label: "Política de privacidad", href: "" },
  { label: "Términos de servicio", href: "" },
  { label: "Política de envíos", href: "" },
];

/** Legal entity that operates the store, shown in the copyright line. */
export const LEGAL_ENTITY_NAME = "Experiencia Creativa SAC";
