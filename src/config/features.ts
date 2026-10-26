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
 * Store WhatsApp (international format, digits only): the floating button, the account page, the
 * contact page and "Contactar por WhatsApp" on a product. NEXT_PUBLIC_WHATSAPP_NUMBER overrides it
 * for a deployment that needs another line.
 */
export const STORE_WHATSAPP = "51975231129";

/**
 * WhatsApp that answers "Consultar" on a sold-out product. Today the same line as the store; kept
 * apart so stock questions can move to whoever handles restocks.
 */
export const STOCK_INQUIRY_WHATSAPP = STORE_WHATSAPP;
