"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customerAddresses, customerProfiles } from "@/db/schema";
import { getVerifiedIdentity } from "@/lib/auth/claims";
import { logger } from "@/lib/logger";
import {
  validateCreateAddressInput,
  validateUpdateAddressInput,
  validateAddressIdOnly,
} from "./address-validation";
import type { CreateAddressInput, UpdateAddressInput, AddressActionResult } from "./types";

/**
 * Parses raw input from FormData or direct Object into a plain JS object.
 */
function parseAddressFormData(formData: FormData): Record<string, unknown> {
  return {
    recipientName: formData.get("recipientName"),
    phone: formData.get("phone"),
    streetAddress: formData.get("streetAddress"),
    apartmentSuite: formData.get("apartmentSuite"),
    department: formData.get("department"),
    province: formData.get("province"),
    district: formData.get("district"),
    postalCode: formData.get("postalCode"),
    referenceNotes: formData.get("referenceNotes"),
    setAsDefault: formData.get("setAsDefault"),
    addressId: formData.get("addressId"),
  };
}

/**
 * Server Action to create a new customer delivery address.
 *
 * Invariants:
 * 1. Authority: customer_id is derived strictly from verified claims.sub -> customer_profiles.id.
 * 2. IDOR Prevention: No caller customerId/profileId is accepted or trusted.
 * 3. Default Transaction: If setAsDefault=true, insert and default pointer update occur in one atomic transaction.
 * 4. PII Protection: Zero exception-derived strings logged on failure.
 */
export async function createCustomerAddressAction(
  _prevState: unknown,
  formData: FormData | CreateAddressInput
): Promise<AddressActionResult> {
  const verified = await getVerifiedIdentity();
  if (!verified.success) {
    return {
      success: false,
      errors: { form: "No has iniciado sesión o tu sesión ha expirado." },
    };
  }

  const rawInput = formData instanceof FormData ? parseAddressFormData(formData) : formData;
  const validation = validateCreateAddressInput(rawInput);
  if (!validation.success) {
    return {
      success: false,
      errors: validation.errors,
    };
  }

  try {
    const [profile] = await db
      .select({ id: customerProfiles.id })
      .from(customerProfiles)
      .where(eq(customerProfiles.authUserId, verified.identity.authUserId))
      .limit(1);

    if (!profile) {
      return {
        success: false,
        errors: { form: "Perfil no encontrado o no autorizado." },
      };
    }

    let createdAddressId: string;

    if (validation.data.setAsDefault) {
      createdAddressId = await db.transaction(async (tx) => {
        const [newAddress] = await tx
          .insert(customerAddresses)
          .values({
            customerId: profile.id,
            recipientName: validation.data.recipientName,
            phone: validation.data.phone,
            streetAddress: validation.data.streetAddress,
            apartmentSuite: validation.data.apartmentSuite,
            department: validation.data.department,
            province: validation.data.province,
            district: validation.data.district,
            postalCode: validation.data.postalCode,
            referenceNotes: validation.data.referenceNotes,
          })
          .returning({ id: customerAddresses.id });

        if (!newAddress) {
          throw new Error("FAILED_TO_INSERT_ADDRESS");
        }

        await tx
          .update(customerProfiles)
          .set({
            defaultShippingAddressId: newAddress.id,
            updatedAt: new Date(),
          })
          .where(eq(customerProfiles.id, profile.id));

        return newAddress.id;
      });
    } else {
      const [newAddress] = await db
        .insert(customerAddresses)
        .values({
          customerId: profile.id,
          recipientName: validation.data.recipientName,
          phone: validation.data.phone,
          streetAddress: validation.data.streetAddress,
          apartmentSuite: validation.data.apartmentSuite,
          department: validation.data.department,
          province: validation.data.province,
          district: validation.data.district,
          postalCode: validation.data.postalCode,
          referenceNotes: validation.data.referenceNotes,
        })
        .returning({ id: customerAddresses.id });

      if (!newAddress) {
        throw new Error("FAILED_TO_INSERT_ADDRESS");
      }

      createdAddressId = newAddress.id;
    }

    revalidatePath("/cuenta");
    revalidatePath("/cuenta/direcciones");

    return {
      success: true,
      message: "Dirección agregada correctamente.",
      addressId: createdAddressId,
    };
  } catch {
    logger.error({ event: "account_address_create_failed" });
    return {
      success: false,
      errors: { form: "Ocurrió un error inesperado al guardar la dirección. Intenta nuevamente." },
    };
  }
}

/**
 * Server Action to update an existing customer delivery address.
 *
 * Invariants:
 * 1. Authority: Mutation predicate enforces (id = addressId AND customer_id = verified profile.id).
 * 2. IDOR Prevention: Cross-owner address updates return generic failure without state change.
 * 3. Default Preservation: Updates to address fields preserve existing default pointer.
 * 4. PII Protection: Zero exception-derived strings logged on failure.
 */
export async function updateCustomerAddressAction(
  _prevState: unknown,
  formData: FormData | UpdateAddressInput
): Promise<AddressActionResult> {
  const verified = await getVerifiedIdentity();
  if (!verified.success) {
    return {
      success: false,
      errors: { form: "No has iniciado sesión o tu sesión ha expirado." },
    };
  }

  const rawInput = formData instanceof FormData ? parseAddressFormData(formData) : formData;
  const validation = validateUpdateAddressInput(rawInput);
  if (!validation.success) {
    return {
      success: false,
      errors: validation.errors,
    };
  }

  try {
    const [profile] = await db
      .select({ id: customerProfiles.id })
      .from(customerProfiles)
      .where(eq(customerProfiles.authUserId, verified.identity.authUserId))
      .limit(1);

    if (!profile) {
      return {
        success: false,
        errors: { form: "Perfil no encontrado o no autorizado." },
      };
    }

    const [updated] = await db
      .update(customerAddresses)
      .set({
        recipientName: validation.data.recipientName,
        phone: validation.data.phone,
        streetAddress: validation.data.streetAddress,
        apartmentSuite: validation.data.apartmentSuite,
        department: validation.data.department,
        province: validation.data.province,
        district: validation.data.district,
        postalCode: validation.data.postalCode,
        referenceNotes: validation.data.referenceNotes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(customerAddresses.id, validation.data.addressId),
          eq(customerAddresses.customerId, profile.id)
        )
      )
      .returning({ id: customerAddresses.id });

    if (!updated) {
      return {
        success: false,
        errors: { form: "Dirección no encontrada o no autorizada." },
      };
    }

    revalidatePath("/cuenta");
    revalidatePath("/cuenta/direcciones");

    return {
      success: true,
      message: "Dirección actualizada correctamente.",
    };
  } catch {
    logger.error({ event: "account_address_update_failed" });
    return {
      success: false,
      errors: {
        form: "Ocurrió un error inesperado al actualizar la dirección. Intenta nuevamente.",
      },
    };
  }
}

/**
 * Server Action to set an owned address as the customer's default shipping address.
 *
 * Invariants:
 * 1. Authority: Verifies that addressId belongs to current customer before setting default.
 * 2. IDOR Prevention: Cross-owner address IDs fail closed with generic not-found message.
 * 3. PII Protection: Zero exception-derived strings logged on failure.
 */
export async function setDefaultCustomerAddressAction(
  _prevState: unknown,
  formData: FormData | { addressId: string }
): Promise<AddressActionResult> {
  const verified = await getVerifiedIdentity();
  if (!verified.success) {
    return {
      success: false,
      errors: { form: "No has iniciado sesión o tu sesión ha expirado." },
    };
  }

  const rawInput =
    formData instanceof FormData ? { addressId: formData.get("addressId") } : formData;

  const validation = validateAddressIdOnly(rawInput);
  if (!validation.success) {
    return {
      success: false,
      errors: validation.errors,
    };
  }

  try {
    const [profile] = await db
      .select({ id: customerProfiles.id })
      .from(customerProfiles)
      .where(eq(customerProfiles.authUserId, verified.identity.authUserId))
      .limit(1);

    if (!profile) {
      return {
        success: false,
        errors: { form: "Perfil no encontrado o no autorizado." },
      };
    }

    const [ownedAddress] = await db
      .select({ id: customerAddresses.id })
      .from(customerAddresses)
      .where(
        and(
          eq(customerAddresses.id, validation.data.addressId),
          eq(customerAddresses.customerId, profile.id)
        )
      )
      .limit(1);

    if (!ownedAddress) {
      return {
        success: false,
        errors: { form: "Dirección no encontrada o no disponible." },
      };
    }

    await db
      .update(customerProfiles)
      .set({
        defaultShippingAddressId: ownedAddress.id,
        updatedAt: new Date(),
      })
      .where(eq(customerProfiles.id, profile.id));

    revalidatePath("/cuenta");
    revalidatePath("/cuenta/direcciones");

    return {
      success: true,
      message: "Dirección predeterminada actualizada correctamente.",
    };
  } catch {
    logger.error({ event: "account_address_set_default_failed" });
    return {
      success: false,
      errors: { form: "Ocurrió un error inesperado al establecer la dirección predeterminada." },
    };
  }
}

/**
 * Server Action to delete a customer delivery address.
 *
 * Invariants:
 * 1. Authority: Enforces customer_addresses.customer_id = verified profile.id.
 * 2. Default Deletion Transaction: If deleting the current default, atomically clears
 *    customer_profiles.default_shipping_address_id and deletes the address row.
 * 3. No Auto-Promotion: After default deletion, defaultShippingAddressId remains null.
 * 4. PII Protection: Zero exception-derived strings logged on failure.
 */
export async function deleteCustomerAddressAction(
  _prevState: unknown,
  formData: FormData | { addressId: string }
): Promise<AddressActionResult> {
  const verified = await getVerifiedIdentity();
  if (!verified.success) {
    return {
      success: false,
      errors: { form: "No has iniciado sesión o tu sesión ha expirado." },
    };
  }

  const rawInput =
    formData instanceof FormData ? { addressId: formData.get("addressId") } : formData;

  const validation = validateAddressIdOnly(rawInput);
  if (!validation.success) {
    return {
      success: false,
      errors: validation.errors,
    };
  }

  try {
    const [profile] = await db
      .select({
        id: customerProfiles.id,
        defaultShippingAddressId: customerProfiles.defaultShippingAddressId,
      })
      .from(customerProfiles)
      .where(eq(customerProfiles.authUserId, verified.identity.authUserId))
      .limit(1);

    if (!profile) {
      return {
        success: false,
        errors: { form: "Perfil no encontrado o no autorizado." },
      };
    }

    const isCurrentDefault = profile.defaultShippingAddressId === validation.data.addressId;

    if (isCurrentDefault) {
      await db.transaction(async (tx) => {
        // Clear default pointer first to avoid composite FK conflict
        await tx
          .update(customerProfiles)
          .set({
            defaultShippingAddressId: null,
            updatedAt: new Date(),
          })
          .where(eq(customerProfiles.id, profile.id));

        const [deleted] = await tx
          .delete(customerAddresses)
          .where(
            and(
              eq(customerAddresses.id, validation.data.addressId),
              eq(customerAddresses.customerId, profile.id)
            )
          )
          .returning({ id: customerAddresses.id });

        if (!deleted) {
          throw new Error("ADDRESS_NOT_FOUND_OR_UNAUTHORIZED");
        }
      });
    } else {
      const [deleted] = await db
        .delete(customerAddresses)
        .where(
          and(
            eq(customerAddresses.id, validation.data.addressId),
            eq(customerAddresses.customerId, profile.id)
          )
        )
        .returning({ id: customerAddresses.id });

      if (!deleted) {
        return {
          success: false,
          errors: { form: "Dirección no encontrada o no autorizada." },
        };
      }
    }

    revalidatePath("/cuenta");
    revalidatePath("/cuenta/direcciones");

    return {
      success: true,
      message: "Dirección eliminada correctamente.",
    };
  } catch {
    logger.error({ event: "account_address_delete_failed" });
    return {
      success: false,
      errors: { form: "Ocurrió un error inesperado al eliminar la dirección. Intenta nuevamente." },
    };
  }
}
