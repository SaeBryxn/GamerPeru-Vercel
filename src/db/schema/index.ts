/**
 * Gamer Perú — Canonical Drizzle Schema Registry
 *
 * This file serves as the aggregate export entrypoint for modular Drizzle schemas
 * under src/db/schema/*.
 */

export * from "./enums";
export * from "./catalog/media-assets";
export * from "./catalog/brands";
export * from "./catalog/categories";
export * from "./catalog/products";
export * from "./catalog/product-variants";
export * from "./catalog/category-specification-schemas";
export * from "./catalog/product-specifications";
export * from "./catalog/product-media";
export * from "./catalog/product-stories";
export * from "./identity/enums";
export * from "./identity/customer-profiles";
export * from "./identity/customer-addresses";
export * from "./identity/roles";
export * from "./identity/permissions";
export * from "./identity/role-permissions";
export * from "./identity/user-roles";
export * from "./cart";
export * from "./wishlist";
export * from "./reviews";
export * from "./orders/enums";
export * from "./orders/orders";
export * from "./orders/order-items";
export * from "./orders/order-address-snapshots";
export * from "./orders/order-pricing-snapshots";
export * from "./orders/order-notes";
export * from "./shipping/enums";
export * from "./shipping/shipping-methods";
export * from "./shipping/shipments";
export * from "./payments/enums";
export * from "./payments/payment-methods";
export * from "./payments/payment-instructions";
export * from "./payments/payments";
export * from "./payments/guest-payment-sessions";
export * from "./payments/guest-payment-access-grants";
export * from "./payments/payment-proof-upload-intents";
export * from "./payments/payment-submissions";
export * from "./payments/refunds";
export * from "./payments/payment-verifications";
export * from "./idempotency";
export * from "./inventory/enums";
export * from "./inventory/inventory-locations";
export * from "./inventory/inventory-items";
export * from "./inventory/inventory-reservations";
export * from "./inventory/inventory-ledger";
export * from "./outbox";
export * from "./notifications/notification-deliveries";
export * from "./audit/enums";
export * from "./audit/audit-events";
export * from "./navigation/menu-entries";
export * from "./content/home-sections";
export * from "./ai";
export * from "./catalog/media-uploads";

export * from "./navigation/storefront-content";
