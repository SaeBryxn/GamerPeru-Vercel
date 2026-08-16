# Commerce Specification

Core entities include Brand, Category, Collection, Product, ProductVariant, MediaAsset, CategorySpecificationSchema, ProductSpecifications, ProductStory, CustomerProfile, CustomerAddress, WishlistItem, Review, Cart, CartItem, InventoryLocation, InventoryItem, InventoryLedgerEntry, InventoryReservation, Order, OrderItem, OrderAddressSnapshot, OrderPricingSnapshot, OrderPromotionSnapshot, Payment, PaymentSubmission, PaymentVerification, Shipment, ShippingMethod, Promotion, Coupon, ReferralCode, ReferralAttribution, Affiliate, AffiliateCode, AffiliateClick, AffiliateAttribution, Commission, AuditEvent, DomainEvent, and OutboxEvent.

Canonical domain model, business invariants, and state-machine transitions are specified authoritatively in [`docs/architecture/COMMERCE_DOMAIN_MODEL.md`](../architecture/COMMERCE_DOMAIN_MODEL.md) (GP-004).

Rules:

- Order snapshots preserve purchase-time facts (pricing, line items, address, discounts).
- `ProductVariant` / SKU is the canonical selling and inventory unit.
- Checkout validates stock availability and recomputes prices server-side in integer Soles (`PEN` cents).
- State transitions are explicit and orthogonal (Order, Payment, Fulfillment, Reservation).
- Candidate order states (`pending_payment`, `payment_submitted`, `payment_verification`, `paid`, `processing`, `ready_to_ship`, `shipped`, `delivered`, `cancelled`, `refunded`) map directly to the orthogonal domain state matrix finalized in GP-004.
- All operational and financial mutations are strictly auditable.
- GP-020 and dependent commerce GPs implement runtime order and payment workflows adhering strictly to GP-004 domain invariants.
