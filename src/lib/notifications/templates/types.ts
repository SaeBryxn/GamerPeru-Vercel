export interface OrderEmailContext {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  recipientName: string | null;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  items: Array<{
    name: string;
    variant: string;
    sku: string;
    quantity: number;
    lineTotalCents: number;
  }>;
  payment: {
    methodName: string;
    recipientName: string;
    accountIdentifier: string;
    instructionText: string;
  } | null;
  /** Earliest reservation expiry: after it the stock may be released. */
  payBy: string | null;
  confirmationUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}
