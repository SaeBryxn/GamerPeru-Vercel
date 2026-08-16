# Commerce Specification
Core entities include Product, ProductVariant, Brand, Category, Collection, Media, Specification, Inventory/Movement, Cart/Item, Order/Item, Payment/Submission, Shipment, Address, Promotion/Coupon, WishlistItem and Review.

Rules: order snapshots preserve purchase-time facts; SKU/variant is selling/inventory unit; checkout validates stock/price server-side; state transitions explicit; operational mutations auditable; idempotency considered.

Candidate order states: `pending_payment`, `payment_submitted`, `payment_verification`, `paid`, `processing`, `ready_to_ship`, `shipped`, `delivered`, `cancelled`, `refunded`. Finalize in GP-004/020.
