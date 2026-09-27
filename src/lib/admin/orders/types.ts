import type { OrderStatus, PaymentStatus, shipmentStatusEnum } from "@/db/schema";

type ShipmentStatus = (typeof shipmentStatusEnum.enumValues)[number];

export type AccountLinkState = "LINKED" | "NOT_LINKED";
export type PaymentDisplayStatus = PaymentStatus | "NOT_RECORDED";
export type ShipmentDisplayStatus = ShipmentStatus | "NOT_RECORDED" | "MULTIPLE";
export type OrderIntegrityIssue =
  | "MISSING_PAYMENT"
  | "MISSING_ADDRESS_SNAPSHOT"
  | "MISSING_PRICING_SNAPSHOT"
  | "MULTIPLE_SHIPMENTS"
  | "CURRENCY_MISMATCH"
  | "UNSUPPORTED_CURRENCY";

export interface AdminOrderListRow {
  orderNumber: string;
  createdAt: string;
  customerEmailMasked: string;
  accountLinkState: AccountLinkState;
  orderStatus: OrderStatus;
  paymentStatus: PaymentDisplayStatus;
  shipmentStatus: ShipmentDisplayStatus;
  totalCents: number;
  currency: string;
  unitCount: number;
  paymentMethod: { code: string; label: string } | null;
  latestOperationalAt: string;
  integrityIssues: OrderIntegrityIssue[];
}

export interface AdminOrderListQuery {
  search: { kind: "EMAIL" | "ORDER_PREFIX"; value: string } | null;
  orderStatus: OrderStatus | null;
  paymentStatus: PaymentStatus | "NOT_RECORDED" | null;
  shipmentStatus: ShipmentStatus | "NOT_RECORDED" | null;
  fromUtc: Date | null;
  toUtcExclusive: Date | null;
  from: string | null;
  to: string | null;
  pageSize: number;
  cursor: { createdAt: Date; id: string } | null;
}

export type AdminOrderListResult =
  | { status: "READY"; rows: AdminOrderListRow[]; nextCursor: string | null }
  | { status: "INVALID_INPUT" | "NOT_AVAILABLE" | "SYSTEM_ERROR" };

export type AdminTimelineType =
  | "ORDER_PLACED"
  | "PAYMENT_SUBMITTED"
  | "ORDER_CONFIRMED"
  | "ORDER_CANCELLED"
  | "REFUND_ISSUED"
  | "SHIPMENT_DISPATCHED"
  | "ORDER_DELIVERED"
  | "INTERNAL_NOTE";

export interface AdminTimelineEntry {
  id: string;
  timestamp: string;
  type: AdminTimelineType;
  noteBody?: string;
}

export interface AdminTimelinePage {
  entries: AdminTimelineEntry[];
  olderCursor: string | null;
}

export interface AdminNotePage {
  notes: { id: string; body: string; createdAt: string; authorAuthUserId: string | null }[];
  olderCursor: string | null;
}

export interface AdminOrderDetail {
  order: {
    orderNumber: string;
    status: OrderStatus;
    createdAt: string;
    updatedAt: string;
    cancelledAt: string | null;
    cancelReason: string | null;
    customerNote: string | null;
    currency: string;
  };
  contact: {
    customerEmail: string;
    customerPhone: string;
    accountLinkState: AccountLinkState;
  };
  items: {
    id: string;
    sku: string;
    productName: string;
    variantTitle: string;
    unitPriceCents: number;
    quantity: number;
    lineTotalCents: number;
  }[];
  address: {
    recipientName: string;
    phone: string;
    streetAddress: string;
    apartmentSuite: string | null;
    department: string;
    province: string;
    district: string;
    postalCode: string | null;
    referenceNotes: string | null;
  } | null;
  pricing: {
    subtotalCents: number;
    discountCents: number;
    shippingCents: number;
    totalCents: number;
    currency: string;
  } | null;
  payment: {
    methodCode: string;
    methodLabel: string;
    status: PaymentStatus;
    amountCents: number;
    refundedAmountCents: number;
    currency: string;
    createdAt: string;
    updatedAt: string;
  } | null;
  refunds: { id: string; amountCents: number; reason: string; createdAt: string }[];
  shipments: {
    id: string;
    status: ShipmentStatus;
    courierName: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
  }[];
  notes: AdminNotePage;
  timeline: AdminTimelinePage;
  integrityIssues: OrderIntegrityIssue[];
  moneyActionsAllowed: boolean;
}

export type AdminOrderDetailResult =
  | { status: "READY"; detail: AdminOrderDetail }
  | { status: "INVALID_INPUT" | "NOT_AVAILABLE" | "SYSTEM_ERROR" };

export type AdminNoteResult =
  | { success: true; note: { id: string; body: string; createdAt: string }; replayed: boolean }
  | {
      success: false;
      code: "INVALID_INPUT" | "NOT_AVAILABLE" | "IDEMPOTENCY_CONFLICT" | "SYSTEM_ERROR";
    };
