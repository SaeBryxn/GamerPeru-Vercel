/**
 * Product AI assistant switch.
 *
 * Off while the research worker is unreliable on Workers Free: jobs failed to dispatch and the
 * editor kept polling for them. Turning it off hides the assistant in the admin, stops the editor
 * banner and its polling, and refuses new or retried jobs. Saved jobs, proposals and the provider
 * settings are kept, so setting this back to true restores everything as it was.
 */
export const AI_ASSISTANT_ENABLED = false;

/**
 * WhatsApp that answers "Consultar" on a sold-out product (international format, digits only).
 * Separate from NEXT_PUBLIC_WHATSAPP_NUMBER so stock questions reach whoever handles restocks.
 */
export const STOCK_INQUIRY_WHATSAPP = "51975231129";
