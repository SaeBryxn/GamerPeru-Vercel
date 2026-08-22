import "server-only";
import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customerAddresses, customerProfiles } from "@/db/schema";
import { getVerifiedIdentity } from "@/lib/auth/claims";
import { logger } from "@/lib/logger";
import type { AccountAddressesState, CustomerAddressDTO } from "./types";

/**
 * Resolves the address book for the currently authenticated customer.
 *
 * Invariants:
 * 1. Authority: auth_user_id is derived strictly from verified JWT claims.sub.
 * 2. IDOR Prevention: Only queries customer_addresses matching the verified customer_profiles.id.
 * 3. Default Resolution: isDefault is derived at read-time against customer_profiles.default_shipping_address_id.
 * 4. PII & Privacy: Zero internal customer/profile IDs exposed in the client DTO.
 * 5. Logging: Zero exception-derived strings logged on failure.
 */
export const getCurrentCustomerAddresses = cache(async (): Promise<AccountAddressesState> => {
  const verified = await getVerifiedIdentity();
  if (!verified.success) {
    return { status: "UNAUTHENTICATED" };
  }

  const authUserId = verified.identity.authUserId;
  const email = verified.identity.email;

  try {
    const [profile] = await db
      .select({
        id: customerProfiles.id,
        defaultShippingAddressId: customerProfiles.defaultShippingAddressId,
      })
      .from(customerProfiles)
      .where(eq(customerProfiles.authUserId, authUserId))
      .limit(1);

    if (!profile) {
      return {
        status: "NEEDS_PROFILE_COMPLETION",
        authUserId,
        email,
      };
    }

    const rows = await db
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, profile.id))
      .orderBy(asc(customerAddresses.createdAt), asc(customerAddresses.id));

    const defaultShippingAddressId = profile.defaultShippingAddressId;

    const addresses: CustomerAddressDTO[] = rows.map((row) => ({
      id: row.id,
      recipientName: row.recipientName,
      phone: row.phone,
      streetAddress: row.streetAddress,
      apartmentSuite: row.apartmentSuite,
      department: row.department,
      province: row.province,
      district: row.district,
      postalCode: row.postalCode,
      referenceNotes: row.referenceNotes,
      isDefault: row.id === defaultShippingAddressId,
    }));

    return {
      status: "READY",
      addresses,
      defaultShippingAddressId,
    };
  } catch {
    logger.error({ event: "account_addresses_read_failed" });
    return {
      status: "ERROR",
      error: "No se pudieron cargar las direcciones de entrega.",
    };
  }
});
