import type { ValidatedBaseAddressData } from "@/lib/account/address-validation";
import type { CustomerAddressDTO } from "@/lib/account/types";
import type { CustomerOrderProgressDTO } from "@/lib/account/order-timeline";

export type CheckoutDeliveryAddressInput =
  | { mode: "INLINE"; address: ValidatedBaseAddressData }
  | { mode: "SAVED_ADDRESS"; addressId: string };

export interface CheckoutSubmitInput {
  checkoutAttemptId: string;
  customerEmail: string;
  deliveryAddress: CheckoutDeliveryAddressInput;
  shippingMethodCode: string;
  paymentMethodCode: string;
  reviewedSubtotalCents: number;
  reviewedShippingCents: number;
  reviewedTotalCents: number;
}

export interface CheckoutSuccessDTO {
  success: true;
  orderNumber: string;
  totalCents: number;
  currency: "PEN";
  paymentStatus: "UNPAID";
  replayed: boolean;
}

export type CheckoutErrorCode =
  | "INVALID_INPUT"
  | "PROFILE_REQUIRED"
  | "CART_REQUIRED"
  | "CART_EMPTY"
  | "CART_EXPIRED"
  | "CART_ALREADY_CONVERTED"
  | "ADDRESS_UNAVAILABLE"
  | "SHIPPING_METHOD_UNAVAILABLE"
  | "PAYMENT_METHOD_UNAVAILABLE"
  | "CHECKOUT_CONFIGURATION_UNAVAILABLE"
  | "PRODUCT_UNAVAILABLE"
  | "CHECKOUT_REVIEW_CHANGED"
  | "INSUFFICIENT_STOCK"
  | "IDEMPOTENCY_CONFLICT"
  | "IDEMPOTENCY_EXPIRED"
  | "UNAUTHORIZED"
  | "SYSTEM_ERROR";

export interface CheckoutReviewChangedDetails {
  authoritativeSubtotalCents: number;
  authoritativeShippingCents: number;
  authoritativeTotalCents: number;
}

export interface CheckoutErrorResult {
  success: false;
  code: CheckoutErrorCode;
  error: string;
  details?: CheckoutReviewChangedDetails;
}

export type CheckoutSubmitResult = CheckoutSuccessDTO | CheckoutErrorResult;

export interface CheckoutCartItemDTO {
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  sku: string;
  priceCents: number;
  quantity: number;
  lineTotalCents: number;
  attributes: unknown;
  primaryMedia: {
    objectKey: string;
    altText: string | null;
    width: number | null;
    height: number | null;
  } | null;
}

export interface CheckoutCartDTO {
  items: CheckoutCartItemDTO[];
  subtotalCents: number;
  itemCount: number;
  currency: "PEN";
}

export interface CheckoutShippingMethodOption {
  code: string;
  name: string;
  basePriceCents: number;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
}

export interface CheckoutPaymentMethodOption {
  code: string;
  name: string;
}

export interface CheckoutContextDTO {
  cart: CheckoutCartDTO | null;
  auth:
    | { status: "AUTHENTICATED"; email: string; addresses: CustomerAddressDTO[] }
    | { status: "GUEST"; email?: string; addresses: [] }
    | { status: "NEEDS_PROFILE"; email: string };
  shippingMethods: CheckoutShippingMethodOption[];
  paymentMethods: CheckoutPaymentMethodOption[];
}

export interface CheckoutIdempotencyPayload {
  orderNumber: string;
  totalCents: number;
  currency: "PEN";
  paymentStatus: "UNPAID";
}

export interface CheckoutConfirmationItemDTO {
  variantId: string;
  productName: string;
  sku: string;
  variantTitle: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  imageObjectKey?: string | null;
}

export interface CheckoutConfirmationAddressDTO {
  recipientName: string;
  phone: string;
  streetAddress: string;
  apartmentSuite: string | null;
  department: string;
  province: string;
  district: string;
  postalCode: string | null;
  referenceNotes: string | null;
}

export interface CheckoutConfirmationDTO {
  isGuestOrder?: boolean;
  orderNumber: string;
  status:
    "PENDING" | "CONFIRMED" | "PROCESSING" | "FULFILLED" | "CANCELLED" | "EXPIRED" | "REFUNDED";
  paymentStatus: "UNPAID" | "PENDING_VERIFICATION" | "PAID" | "REJECTED";
  currency: "PEN";
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  customerEmail: string;
  customerPhone: string;
  shippingMethodName: string;
  paymentMethodName: string;
  deliveryAddress: CheckoutConfirmationAddressDTO;
  items: CheckoutConfirmationItemDTO[];
  createdAt: string;
  progress: CustomerOrderProgressDTO;
  reservationExpiresAt?: string | null;
  serverNow?: string;
}

export type CheckoutConfirmationResult =
  | { success: true; confirmation: CheckoutConfirmationDTO }
  | { success: false; code: "NOT_AVAILABLE"; error: string };
