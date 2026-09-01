import type { OrderStatus, PaymentStatus } from "@/db/schema";

export type CancelUnpaidOrderInput = {
  orderNumber: string;
  cancellationAttemptId: string;
  reason?: string;
};

export type CancelUnpaidOrderResult =
  | {
      success: true;
      orderNumber: string;
      status: "CANCELLED";
      replayed: boolean;
    }
  | {
      success: false;
      code:
        | "NOT_AVAILABLE"
        | "INVALID_INPUT"
        | "INVALID_ORDER_STATE"
        | "CANCELLATION_NOT_ALLOWED"
        | "PAYMENT_REVIEW_IN_PROGRESS"
        | "FULFILLMENT_ALREADY_STARTED"
        | "ALREADY_CANCELLED"
        | "IDEMPOTENCY_CONFLICT"
        | "IDEMPOTENCY_EXPIRED"
        | "INVENTORY_INVARIANT_VIOLATION"
        | "SYSTEM_ERROR";
      error: string;
    };

export type CancelPaidOrderInput = {
  orderNumber: string;
  cancellationAttemptId: string;
  reason: string;
  externalReference?: string;
};

export type CancelPaidOrderResult =
  | {
      success: true;
      orderNumber: string;
      status: "REFUNDED";
      refundedAmountCents: number;
      replayed: boolean;
    }
  | {
      success: false;
      code:
        | "UNAUTHORIZED"
        | "NOT_AVAILABLE"
        | "INVALID_INPUT"
        | "INVALID_ORDER_STATE"
        | "CANCELLATION_NOT_ALLOWED"
        | "FULFILLMENT_ALREADY_STARTED"
        | "ALREADY_CANCELLED"
        | "IDEMPOTENCY_CONFLICT"
        | "IDEMPOTENCY_EXPIRED"
        | "INVENTORY_INVARIANT_VIOLATION"
        | "SYSTEM_ERROR";
      error: string;
    };

export type RecordRefundInput = {
  orderNumber: string;
  refundAttemptId: string;
  amountCents: number;
  reason: string;
  externalReference?: string;
};

export type RecordRefundResult =
  | {
      success: true;
      refundId: string;
      orderNumber: string;
      amountCents: number;
      totalRefundedCents: number;
      paymentStatus: PaymentStatus;
      orderStatus: OrderStatus;
      replayed: boolean;
    }
  | {
      success: false;
      code:
        | "UNAUTHORIZED"
        | "NOT_AVAILABLE"
        | "INVALID_INPUT"
        | "INVALID_ORDER_STATE"
        | "REFUND_NOT_ALLOWED"
        | "REFUND_AMOUNT_INVALID"
        | "REFUND_EXCEEDS_PAID_AMOUNT"
        | "IDEMPOTENCY_CONFLICT"
        | "IDEMPOTENCY_EXPIRED"
        | "SYSTEM_ERROR";
      error: string;
    };

export type TerminalRejectionInput = {
  orderId: string;
  paymentId: string;
  rejectionReason: string;
  actorAuthUserId?: string | null;
};

export type OrderTimelineEntry = {
  id: string;
  timestamp: string;
  type:
    | "ORDER_PLACED"
    | "PAYMENT_SUBMITTED"
    | "ORDER_CONFIRMED"
    | "ORDER_CANCELLED"
    | "REFUND_ISSUED"
    | "SHIPMENT_DISPATCHED"
    | "ORDER_DELIVERED";
  title: string;
  description?: string;
};

export type OrderTimelineResult =
  | {
      success: true;
      orderNumber: string;
      currentOrderStatus: OrderStatus;
      currentPaymentStatus: PaymentStatus;
      timeline: OrderTimelineEntry[];
    }
  | {
      success: false;
      code: "NOT_AVAILABLE" | "UNAUTHORIZED" | "SYSTEM_ERROR";
      error: string;
    };
