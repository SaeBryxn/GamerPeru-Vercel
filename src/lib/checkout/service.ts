import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cartItems,
  carts,
  customerAddresses,
  idempotencyKeys,
  inventoryItems,
  inventoryLedgerEntries,
  inventoryLocations,
  inventoryReservations,
  orderAddressSnapshots,
  orderItems,
  orderPricingSnapshots,
  orders,
  outboxEvents,
  paymentInstructionVersions,
  paymentMethodConfigurations,
  payments,
  productVariants,
  products,
  shipments,
  shippingMethods,
} from "@/db/schema";
import { generateUuidV7 } from "@/db/utils/uuid";
import { getCurrentCustomerAddresses } from "@/lib/account/addresses";
import type { ValidatedBaseAddressData } from "@/lib/account/address-validation";
import { getVerifiedIdentity } from "@/lib/auth/claims";
import {
  lockAnonymousSessionTokenForMutation,
  mergeGuestCartIntoAuthenticated,
  queryCartHydrationLines,
  retireCartById,
} from "@/lib/cart/persistence";
import { clearAnonymousCartCookie } from "@/lib/cart/session";
import { logger } from "@/lib/logger";
import { resolveCheckoutAuthority } from "./authority";
import { getCheckoutConfig } from "./config";
import {
  computeAuthorityBindingDigest,
  computeRequestFingerprint,
  generateOrderNumber,
} from "./crypto";
import type {
  CheckoutContextDTO,
  CheckoutIdempotencyPayload,
  CheckoutPaymentMethodOption,
  CheckoutShippingMethodOption,
  CheckoutSubmitResult,
} from "./types";
import { validateCheckoutSubmitInput } from "./validation";

/**
 * Loads current Checkout context for customer-facing display.
 *
 * Invariants:
 * 1. Read-Only / Zero Order Mutation: Does not manufacture carts or orders.
 * 2. Authenticated Guest Merge: Executes lazy merge if authenticated customer carries a guest cart.
 * 3. Privacy: Exposes zero payment instruction text, account identifiers, or QR images.
 * 4. Authoritative Pricing: Returns current database base prices for shipping methods.
 */
export async function loadCheckoutContext(): Promise<CheckoutContextDTO> {
  const verified = await getVerifiedIdentity();
  const auth = await resolveCheckoutAuthority();

  let customerSavedAddresses: Awaited<ReturnType<typeof getCurrentCustomerAddresses>> = {
    status: "UNAUTHENTICATED",
  };

  if (auth.status === "AUTHENTICATED") {
    if (auth.guestToken) {
      await db.transaction(async (tx) => {
        const mergeResult = await mergeGuestCartIntoAuthenticated(
          auth.customerProfileId,
          auth.guestToken!,
          tx
        );
        if (mergeResult.shouldClearCookie) {
          await clearAnonymousCartCookie();
        }
      });
    }
    customerSavedAddresses = await getCurrentCustomerAddresses();
  }

  // 1. Resolve Active Cart
  let activeCartId: string | null = null;
  if (auth.status === "AUTHENTICATED") {
    const [cart] = await db
      .select({ id: carts.id })
      .from(carts)
      .where(sql`${carts.customerId} = ${auth.customerProfileId} AND ${carts.status} = 'ACTIVE'`)
      .limit(1);
    if (cart) activeCartId = cart.id;
  } else if (auth.status === "GUEST") {
    const [cart] = await db
      .select({ id: carts.id })
      .from(carts)
      .where(sql`${carts.sessionToken} = ${auth.guestToken} AND ${carts.status} = 'ACTIVE'`)
      .limit(1);
    if (cart) activeCartId = cart.id;
  }

  let publicCart: CheckoutContextDTO["cart"] = null;
  if (activeCartId) {
    const lines = await queryCartHydrationLines(activeCartId, db);
    const validLines = lines.filter(
      (l) => l.productStatus === "PUBLISHED" && l.variantStatus === "ACTIVE"
    );
    const subtotalCents = validLines.reduce((acc, l) => acc + l.priceCents * l.quantity, 0);
    const itemCount = validLines.reduce((acc, l) => acc + l.quantity, 0);

    publicCart = {
      items: validLines.map((l) => ({
        variantId: l.variantId,
        productId: l.productId,
        productSlug: l.productSlug,
        productName: l.productName,
        sku: l.sku,
        priceCents: l.priceCents,
        quantity: l.quantity,
        lineTotalCents: l.priceCents * l.quantity,
        attributes: l.attributes,
        primaryMedia: l.mediaObjectKey
          ? {
              objectKey: l.mediaObjectKey,
              altText: l.mediaAltText ?? l.productName,
              width: l.mediaWidth,
              height: l.mediaHeight,
            }
          : null,
      })),
      subtotalCents,
      itemCount,
      currency: "PEN",
    };
  }

  // 2. Query Active Shipping Methods
  const shippingRows = await db
    .select({
      code: shippingMethods.code,
      name: shippingMethods.name,
      basePriceCents: shippingMethods.basePriceCents,
      estimatedDaysMin: shippingMethods.estimatedDaysMin,
      estimatedDaysMax: shippingMethods.estimatedDaysMax,
    })
    .from(shippingMethods)
    .where(eq(shippingMethods.isActive, true))
    .orderBy(asc(shippingMethods.basePriceCents), asc(shippingMethods.code));

  const shippingOptions: CheckoutShippingMethodOption[] = shippingRows.map((r) => ({
    code: r.code,
    name: r.name,
    basePriceCents: r.basePriceCents,
    estimatedDaysMin: r.estimatedDaysMin,
    estimatedDaysMax: r.estimatedDaysMax,
  }));

  // 3. Query Active Manual Payment Methods (Safe presentation only)
  const paymentRows = await db
    .select({
      code: paymentMethodConfigurations.code,
      name: paymentMethodConfigurations.name,
    })
    .from(paymentMethodConfigurations)
    .where(
      sql`${paymentMethodConfigurations.isActive} = true AND ${paymentMethodConfigurations.methodType} = 'MANUAL' AND ${paymentMethodConfigurations.currentInstructionVersionId} IS NOT NULL`
    )
    .orderBy(asc(paymentMethodConfigurations.displayOrder), asc(paymentMethodConfigurations.code));

  const paymentOptions: CheckoutPaymentMethodOption[] = paymentRows.map((r) => ({
    code: r.code,
    name: r.name,
  }));

  // 4. Resolve Auth Presentation
  let authDto: CheckoutContextDTO["auth"];
  if (auth.status === "AUTHENTICATED") {
    authDto = {
      status: "AUTHENTICATED",
      email: verified.success && verified.identity.email ? verified.identity.email : "",
      addresses: customerSavedAddresses.status === "READY" ? customerSavedAddresses.addresses : [],
    };
  } else if (auth.status === "PROFILE_REQUIRED") {
    authDto = {
      status: "NEEDS_PROFILE",
      email: verified.success && verified.identity.email ? verified.identity.email : "",
    };
  } else {
    authDto = {
      status: "GUEST",
      addresses: [],
    };
  }

  return {
    cart: publicCart,
    auth: authDto,
    shippingMethods: shippingOptions,
    paymentMethods: paymentOptions,
  };
}

/**
 * Server-authoritative atomic checkout submission.
 *
 * Invariants:
 * 1. Single PostgreSQL ACID transaction: All Order, Item, Snapshot, Shipment, Reservation, Ledger, Payment, Outbox, and Idempotency mutations commit together.
 * 2. Deterministic Row Locking: InventoryItems locked in sorted variant_id order to eliminate deadlock risk.
 * 3. Available-to-Sell: available_to_sell = quantity_on_hand - quantity_reserved - quantity_allocated >= requested qty.
 * 4. Idempotent Replay: Exact duplicate attempts return committed cached response with replayed=true.
 * 5. Review-Change Protection: Advisory reviewed money comparison prevents silent total changes.
 * 6. Privacy: Zero PII or credentials persisted in idempotency keys, outbox payloads, or error logs.
 */
export async function submitCheckout(rawInput: unknown): Promise<CheckoutSubmitResult> {
  // 1. Input Validation
  const inputValidation = validateCheckoutSubmitInput(rawInput);
  if (!inputValidation.success) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: inputValidation.error,
    };
  }
  const input = inputValidation.data;

  // 2. Server Runtime Configuration
  const configResult = getCheckoutConfig();
  if (!configResult.valid || !configResult.config) {
    return {
      success: false,
      code: "CHECKOUT_CONFIGURATION_UNAVAILABLE",
      error: "El servicio de compras no se encuentra disponible temporalmente.",
    };
  }
  const config = configResult.config;

  // 3. Authority Resolution
  const auth = await resolveCheckoutAuthority();
  if (auth.status === "PROFILE_REQUIRED") {
    return {
      success: false,
      code: "PROFILE_REQUIRED",
      error: "Debe completar su perfil antes de realizar una compra.",
    };
  }
  if (auth.status === "NO_CART_SESSION") {
    return {
      success: false,
      code: "CART_REQUIRED",
      error: "No se encontró un carrito activo.",
    };
  }

  const authorityBindingDigest = computeAuthorityBindingDigest(auth.digestInput, config.hmacSecret);

  let mergedGuestTokenToClear: string | null = null;

  try {
    const result = await db.transaction(async (tx) => {
      const now = new Date();

      // Step A: Pre-Cart Idempotency Lookup (Fast Replay Path)
      const [existingIdempotency] = await tx
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.idempotencyKey, input.checkoutAttemptId))
        .for("update")
        .limit(1);

      if (existingIdempotency) {
        // 1. Authority Binding Check
        if (existingIdempotency.authorityBindingDigest !== authorityBindingDigest) {
          return {
            success: false as const,
            code: "UNAUTHORIZED" as const,
            error: "No autorizado para consultar o reintentar esta orden.",
          };
        }

        // 2. Expiration Check
        if (existingIdempotency.expiresAt < now) {
          return {
            success: false as const,
            code: "IDEMPOTENCY_EXPIRED" as const,
            error: "El intento de compra ha expirado. Por favor inicie una nueva compra.",
          };
        }

        // 3. Request Fingerprint Check
        const computedFingerprint = computeRequestFingerprint(
          {
            sourceCartId: existingIdempotency.sourceCartId,
            shippingMethodCode: input.shippingMethodCode,
            paymentMethodCode: input.paymentMethodCode,
            customerEmail: input.customerEmail,
            deliveryAddress: input.deliveryAddress,
          },
          config.hmacSecret
        );

        if (existingIdempotency.requestFingerprint !== computedFingerprint) {
          return {
            success: false as const,
            code: "IDEMPOTENCY_CONFLICT" as const,
            error:
              "Conflicto de idempotencia: los datos de la solicitud difieren del intento original.",
          };
        }

        // 4. Committed Replay
        const payload = existingIdempotency.responsePayload as CheckoutIdempotencyPayload | null;
        if (payload && payload.orderNumber) {
          return {
            success: true as const,
            orderNumber: payload.orderNumber,
            totalCents: payload.totalCents,
            currency: payload.currency,
            paymentStatus: "UNPAID" as const,
            replayed: true,
          };
        }
      }

      // Step B: Cart Authority & Locking
      let activeCart: typeof carts.$inferSelect | undefined;

      if (auth.status === "AUTHENTICATED") {
        if (auth.guestToken) {
          const mergeResult = await mergeGuestCartIntoAuthenticated(
            auth.customerProfileId,
            auth.guestToken,
            tx
          );
          if (mergeResult.shouldClearCookie) {
            mergedGuestTokenToClear = auth.guestToken;
          }
        }

        const [authCart] = await tx
          .select()
          .from(carts)
          .where(
            sql`${carts.customerId} = ${auth.customerProfileId} AND ${carts.status} = 'ACTIVE'`
          )
          .for("update")
          .limit(1);

        activeCart = authCart;
      } else {
        await lockAnonymousSessionTokenForMutation(auth.guestToken, tx);
        const [guestCart] = await tx
          .select()
          .from(carts)
          .where(sql`${carts.sessionToken} = ${auth.guestToken} AND ${carts.status} = 'ACTIVE'`)
          .for("update")
          .limit(1);

        activeCart = guestCart;
      }

      if (!activeCart) {
        return {
          success: false as const,
          code: "CART_REQUIRED" as const,
          error: "No se encontró un carrito activo.",
        };
      }

      if (activeCart.expiresAt < now) {
        await retireCartById(activeCart.id, tx);
        return {
          success: false as const,
          code: "CART_EXPIRED" as const,
          error: "El carrito ha expirado. Por favor agregue sus productos nuevamente.",
        };
      }

      // Step C: Cart Lines & Catalog Revalidation
      const lines = await tx
        .select({
          cartItemId: cartItems.id,
          variantId: cartItems.variantId,
          quantity: cartItems.quantity,
          sku: productVariants.sku,
          priceCents: productVariants.priceCents,
          variantStatus: productVariants.status,
          variantAttributes: productVariants.attributes,
          productId: products.id,
          productName: products.name,
          productStatus: products.status,
        })
        .from(cartItems)
        .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(eq(cartItems.cartId, activeCart.id))
        .for("update");

      if (lines.length === 0) {
        return {
          success: false as const,
          code: "CART_EMPTY" as const,
          error: "El carrito está vacío.",
        };
      }

      for (const line of lines) {
        if (line.productStatus !== "PUBLISHED" || line.variantStatus !== "ACTIVE") {
          return {
            success: false as const,
            code: "PRODUCT_UNAVAILABLE" as const,
            error: "Uno o más productos en el carrito ya no están disponibles.",
          };
        }
      }

      // Step D: Delivery Address Resolution
      let resolvedAddress: ValidatedBaseAddressData;
      if (input.deliveryAddress.mode === "SAVED_ADDRESS") {
        if (auth.status !== "AUTHENTICATED") {
          return {
            success: false as const,
            code: "ADDRESS_UNAVAILABLE" as const,
            error: "Dirección de entrega no disponible.",
          };
        }

        const [saved] = await tx
          .select()
          .from(customerAddresses)
          .where(
            sql`${customerAddresses.id} = ${input.deliveryAddress.addressId} AND ${customerAddresses.customerId} = ${auth.customerProfileId}`
          )
          .limit(1);

        if (!saved) {
          return {
            success: false as const,
            code: "ADDRESS_UNAVAILABLE" as const,
            error: "Dirección de entrega no disponible.",
          };
        }

        resolvedAddress = {
          recipientName: saved.recipientName,
          phone: saved.phone,
          streetAddress: saved.streetAddress,
          apartmentSuite: saved.apartmentSuite ?? null,
          department: saved.department,
          province: saved.province,
          district: saved.district,
          postalCode: saved.postalCode ?? null,
          referenceNotes: saved.referenceNotes ?? null,
        };
      } else {
        resolvedAddress = input.deliveryAddress.address;
      }

      // Step E: Shipping Method Validation
      const [shippingMethod] = await tx
        .select()
        .from(shippingMethods)
        .where(
          sql`${shippingMethods.code} = ${input.shippingMethodCode} AND ${shippingMethods.isActive} = true`
        )
        .limit(1);

      if (!shippingMethod) {
        return {
          success: false as const,
          code: "SHIPPING_METHOD_UNAVAILABLE" as const,
          error: "El método de envío seleccionado no está disponible.",
        };
      }
      const authoritativeShippingCents = shippingMethod.basePriceCents;

      // Step F: Payment Method Configuration & Instruction Version Validation
      const [paymentConfig] = await tx
        .select()
        .from(paymentMethodConfigurations)
        .where(
          sql`${paymentMethodConfigurations.code} = ${input.paymentMethodCode} AND ${paymentMethodConfigurations.isActive} = true AND ${paymentMethodConfigurations.methodType} = 'MANUAL'`
        )
        .limit(1);

      if (!paymentConfig || !paymentConfig.currentInstructionVersionId) {
        return {
          success: false as const,
          code: "PAYMENT_METHOD_UNAVAILABLE" as const,
          error: "El método de pago seleccionado no está disponible.",
        };
      }

      const [instructionVersion] = await tx
        .select()
        .from(paymentInstructionVersions)
        .where(
          sql`${paymentInstructionVersions.id} = ${paymentConfig.currentInstructionVersionId} AND ${paymentInstructionVersions.paymentMethodCode} = ${input.paymentMethodCode} AND ${paymentInstructionVersions.isActive} = true`
        )
        .limit(1);

      if (!instructionVersion) {
        return {
          success: false as const,
          code: "PAYMENT_METHOD_UNAVAILABLE" as const,
          error: "El método de pago seleccionado no está disponible.",
        };
      }
      const instructionVersionId = instructionVersion.id;

      // Step G: Pricing Calculation & Review-Change Protection
      const authoritativeSubtotalCents = lines.reduce(
        (acc, l) => acc + l.priceCents * l.quantity,
        0
      );
      const authoritativeDiscountCents = 0;
      const authoritativeTotalCents = authoritativeSubtotalCents + authoritativeShippingCents;

      if (
        input.reviewedSubtotalCents !== authoritativeSubtotalCents ||
        input.reviewedShippingCents !== authoritativeShippingCents ||
        input.reviewedTotalCents !== authoritativeTotalCents
      ) {
        return {
          success: false as const,
          code: "CHECKOUT_REVIEW_CHANGED" as const,
          error: "El monto de la compra ha cambiado. Por favor revise el resumen actualizado.",
          details: {
            authoritativeSubtotalCents,
            authoritativeShippingCents,
            authoritativeTotalCents,
          },
        };
      }

      // Step H: Inventory Location & Deterministic Item Locking
      const [location] = await tx
        .select()
        .from(inventoryLocations)
        .where(
          sql`${inventoryLocations.code} = ${config.primaryLocationCode} AND ${inventoryLocations.isActive} = true`
        )
        .limit(1);

      if (!location) {
        return {
          success: false as const,
          code: "CHECKOUT_CONFIGURATION_UNAVAILABLE" as const,
          error: "La ubicación de inventario no está disponible.",
        };
      }

      // Deterministic sorted locking by variantId
      const uniqueVariantIds = Array.from(new Set(lines.map((l) => l.variantId))).sort();
      const lockedInventoryRows = await tx
        .select()
        .from(inventoryItems)
        .where(
          sql`${inventoryItems.locationId} = ${location.id} AND ${inArray(inventoryItems.variantId, uniqueVariantIds)}`
        )
        .orderBy(asc(inventoryItems.variantId))
        .for("update");

      const inventoryItemMap = new Map<string, typeof inventoryItems.$inferSelect>();
      for (const item of lockedInventoryRows) {
        inventoryItemMap.set(item.variantId, item);
      }

      // Aggregate requested quantities per variant
      const requestedVariantQuantities = new Map<string, number>();
      for (const line of lines) {
        const current = requestedVariantQuantities.get(line.variantId) ?? 0;
        requestedVariantQuantities.set(line.variantId, current + line.quantity);
      }

      // Available to Sell validation
      for (const [variantId, requestedQty] of requestedVariantQuantities.entries()) {
        const item = inventoryItemMap.get(variantId);
        if (!item) {
          return {
            success: false as const,
            code: "INSUFFICIENT_STOCK" as const,
            error: "Stock insuficiente para uno o más productos.",
          };
        }
        const availableToSell =
          item.quantityOnHand - item.quantityReserved - item.quantityAllocated;
        if (availableToSell < requestedQty) {
          return {
            success: false as const,
            code: "INSUFFICIENT_STOCK" as const,
            error: "Stock insuficiente para uno o más productos.",
          };
        }
      }

      // Step I: Insert Idempotency Key
      const computedFingerprint = computeRequestFingerprint(
        {
          sourceCartId: activeCart.id,
          shippingMethodCode: input.shippingMethodCode,
          paymentMethodCode: input.paymentMethodCode,
          customerEmail: input.customerEmail,
          deliveryAddress: input.deliveryAddress,
        },
        config.hmacSecret
      );

      const idempotencyExpiresAt = new Date(
        now.getTime() + config.idempotencyTtlMinutes * 60 * 1000
      );

      let idempotencyRowId: string;
      if (existingIdempotency) {
        idempotencyRowId = existingIdempotency.id;
      } else {
        const [insertedIdempotency] = await tx
          .insert(idempotencyKeys)
          .values({
            id: generateUuidV7(),
            idempotencyKey: input.checkoutAttemptId,
            operationType: "ORDER_CREATION",
            authorityBindingDigest,
            sourceCartId: activeCart.id,
            requestFingerprint: computedFingerprint,
            expiresAt: idempotencyExpiresAt,
          })
          .returning({ id: idempotencyKeys.id });
        idempotencyRowId = insertedIdempotency!.id;
      }

      // Step J: Order Creation with Collision Safety
      let orderNumber = generateOrderNumber();
      const orderId = generateUuidV7();

      let orderInserted = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await tx.insert(orders).values({
            id: orderId,
            orderNumber,
            customerId: auth.status === "AUTHENTICATED" ? auth.customerProfileId : null,
            customerEmail: input.customerEmail.trim().toLowerCase(),
            customerPhone: resolvedAddress.phone.trim(),
            status: "PENDING",
            subtotalCents: authoritativeSubtotalCents,
            discountCents: authoritativeDiscountCents,
            shippingCents: authoritativeShippingCents,
            totalCents: authoritativeTotalCents,
            currency: "PEN",
          });
          orderInserted = true;
          break;
        } catch (err: unknown) {
          const pgErr = err as { code?: string };
          if (pgErr?.code === "23505") {
            orderNumber = generateOrderNumber();
          } else {
            throw err;
          }
        }
      }

      if (!orderInserted) {
        throw new Error("ORDER_NUMBER_COLLISION_EXHAUSTED");
      }

      // Step K: Order Items Snapshot Creation
      const createdOrderItems: Array<{ orderItemId: string; variantId: string; quantity: number }> =
        [];
      for (const line of lines) {
        const orderItemId = generateUuidV7();
        const lineTotal = line.quantity * line.priceCents;
        const variantTitle = line.variantAttributes
          ? Object.values(line.variantAttributes).join(" / ")
          : "Estándar";

        await tx.insert(orderItems).values({
          id: orderItemId,
          orderId,
          variantId: line.variantId,
          skuSnapshot: line.sku,
          productNameSnapshot: line.productName,
          variantTitleSnapshot: variantTitle || "Estándar",
          unitPriceCentsSnapshot: line.priceCents,
          quantity: line.quantity,
          lineTotalCents: lineTotal,
        });

        createdOrderItems.push({
          orderItemId,
          variantId: line.variantId,
          quantity: line.quantity,
        });
      }

      // Step L: Order Address Snapshot Creation
      await tx.insert(orderAddressSnapshots).values({
        id: generateUuidV7(),
        orderId,
        recipientName: resolvedAddress.recipientName.trim(),
        phone: resolvedAddress.phone.trim(),
        streetAddress: resolvedAddress.streetAddress.trim(),
        apartmentSuite: resolvedAddress.apartmentSuite?.trim() ?? null,
        department: resolvedAddress.department.trim(),
        province: resolvedAddress.province.trim(),
        district: resolvedAddress.district.trim(),
        postalCode: resolvedAddress.postalCode?.trim() ?? null,
        referenceNotes: resolvedAddress.referenceNotes?.trim() ?? null,
      });

      // Step M: Order Pricing Snapshot Creation
      await tx.insert(orderPricingSnapshots).values({
        id: generateUuidV7(),
        orderId,
        subtotalCents: authoritativeSubtotalCents,
        discountCents: authoritativeDiscountCents,
        shippingCents: authoritativeShippingCents,
        totalCents: authoritativeTotalCents,
        currency: "PEN",
      });

      // Step N: Shipment Creation
      await tx.insert(shipments).values({
        id: generateUuidV7(),
        orderId,
        shippingMethodId: shippingMethod.id,
        status: "UNFULFILLED",
      });

      // Step O: Inventory Reservations, Item quantity_reserved Updates & Ledger Entries
      const reservationExpiresAt = new Date(
        now.getTime() + config.reservationTtlMinutes * 60 * 1000
      );

      for (const itemRecord of createdOrderItems) {
        const inventoryItem = inventoryItemMap.get(itemRecord.variantId)!;

        // 1. Create Reservation
        await tx.insert(inventoryReservations).values({
          id: generateUuidV7(),
          inventoryItemId: inventoryItem.id,
          orderId,
          orderItemId: itemRecord.orderItemId,
          quantity: itemRecord.quantity,
          status: "ACTIVE",
          expiresAt: reservationExpiresAt,
        });

        // 2. Increment quantity_reserved
        const newReserved = inventoryItem.quantityReserved + itemRecord.quantity;
        await tx
          .update(inventoryItems)
          .set({
            quantityReserved: newReserved,
            updatedAt: now,
          })
          .where(eq(inventoryItems.id, inventoryItem.id));

        // Update local map to reflect mutated balance for subsequent lines of same variant
        inventoryItem.quantityReserved = newReserved;

        // 3. Create Ledger Entry
        await tx.insert(inventoryLedgerEntries).values({
          id: generateUuidV7(),
          inventoryItemId: inventoryItem.id,
          movementType: "RESERVATION_CREATED",
          onHandDelta: 0,
          reservedDelta: itemRecord.quantity,
          allocatedDelta: 0,
          quantityOnHandAfter: inventoryItem.quantityOnHand,
          quantityReservedAfter: newReserved,
          quantityAllocatedAfter: inventoryItem.quantityAllocated,
          referenceType: "ORDER",
          referenceId: orderId,
          actorId: "SYSTEM",
        });
      }

      // Step P: Payment Creation (Status: UNPAID)
      await tx.insert(payments).values({
        id: generateUuidV7(),
        orderId,
        paymentMethodCode: input.paymentMethodCode,
        instructionVersionId,
        amountCents: authoritativeTotalCents,
        refundedAmountCents: 0,
        currency: "PEN",
        status: "UNPAID",
      });

      // Step Q: Cart Status Transition (ACTIVE -> CONVERTED)
      await tx
        .update(carts)
        .set({
          status: "CONVERTED",
          updatedAt: now,
        })
        .where(eq(carts.id, activeCart.id));

      // Step R: Outbox Event Creation
      await tx.insert(outboxEvents).values({
        id: generateUuidV7(),
        eventName: "OrderPlaced",
        eventVersion: 1,
        aggregateType: "Order",
        aggregateId: orderId,
        payload: {
          orderId,
          orderNumber,
          totalCents: authoritativeTotalCents,
          currency: "PEN",
        },
        status: "PENDING",
      });

      // Step S: Persist Idempotency Success Response Payload
      const responsePayload: CheckoutIdempotencyPayload = {
        orderNumber,
        totalCents: authoritativeTotalCents,
        currency: "PEN",
        paymentStatus: "UNPAID",
      };

      await tx
        .update(idempotencyKeys)
        .set({
          targetAggregateId: orderId,
          responsePayload,
        })
        .where(eq(idempotencyKeys.id, idempotencyRowId));

      return {
        success: true as const,
        orderNumber,
        totalCents: authoritativeTotalCents,
        currency: "PEN" as const,
        paymentStatus: "UNPAID" as const,
        replayed: false,
      };
    });

    if (result.success && mergedGuestTokenToClear) {
      await clearAnonymousCartCookie();
    }

    return result;
  } catch (_err: unknown) {
    logger.error({ event: "checkout_submit_failed" });
    return {
      success: false,
      code: "SYSTEM_ERROR",
      error: "Ocurrió un error inesperado al procesar su compra. Por favor intente nuevamente.",
    };
  }
}
