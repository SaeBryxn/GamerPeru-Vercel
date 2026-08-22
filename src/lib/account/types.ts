export type DocumentTypeEnum = "DNI" | "CE" | "RUC" | "PASSPORT";

/**
 * Server-side profile view — retains internal IDs for server composition.
 * Never passed directly to client components.
 */
export interface ServerProfileView {
  id: string;
  authUserId: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  documentType: string | null;
  documentNumber: string | null;
  defaultShippingAddressId: string | null;
  createdAt: Date;
  updatedAt: Date;
  email: string | null;
}

/**
 * Minimized DTO serialized to client components for profile editing.
 * Contains only editable/display fields; zero internal identifiers.
 */
export interface ProfileFormDTO {
  firstName: string;
  lastName: string;
  phone: string | null;
  documentType: DocumentTypeEnum | null;
  documentNumber: string | null;
  email: string | null;
}

export type AccountProfileState =
  | { status: "READY"; profile: ServerProfileView }
  | { status: "NEEDS_PROFILE_COMPLETION"; authUserId: string; email: string | null }
  | { status: "UNAUTHENTICATED" }
  | { status: "ERROR"; error: string };

/**
 * Minimized client DTO for customer addresses.
 * isDefault is derived at read-time against profile.defaultShippingAddressId.
 * Zero internal IDs (customerId, authUserId) exposed.
 */
export interface CustomerAddressDTO {
  id: string;
  recipientName: string;
  phone: string;
  streetAddress: string;
  apartmentSuite: string | null;
  department: string;
  province: string;
  district: string;
  postalCode: string | null;
  referenceNotes: string | null;
  isDefault: boolean;
}

export type AccountAddressesState =
  | {
      status: "READY";
      addresses: CustomerAddressDTO[];
      defaultShippingAddressId: string | null;
    }
  | { status: "NEEDS_PROFILE_COMPLETION"; authUserId: string; email: string | null }
  | { status: "UNAUTHENTICATED" }
  | { status: "ERROR"; error: string };

export interface CreateAddressInput {
  recipientName: string;
  phone: string;
  streetAddress: string;
  apartmentSuite?: string | null;
  department: string;
  province: string;
  district: string;
  postalCode?: string | null;
  referenceNotes?: string | null;
  setAsDefault?: boolean;
}

export interface UpdateAddressInput extends CreateAddressInput {
  addressId: string;
}

export interface AddressActionValidationErrors {
  recipientName?: string;
  phone?: string;
  streetAddress?: string;
  apartmentSuite?: string;
  department?: string;
  province?: string;
  district?: string;
  postalCode?: string;
  referenceNotes?: string;
  addressId?: string;
  form?: string;
}

export interface AddressActionSuccess {
  success: true;
  message: string;
  addressId?: string;
}

export interface AddressActionFailure {
  success: false;
  errors: AddressActionValidationErrors;
}

export type AddressActionResult = AddressActionSuccess | AddressActionFailure;

export interface UpdateProfileInput {
  firstName: string;
  lastName: string;
  phone?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
}

export interface UpdateProfileValidationErrors {
  firstName?: string;
  lastName?: string;
  phone?: string;
  documentType?: string;
  documentNumber?: string;
  form?: string;
}

export interface UpdateProfileSuccess {
  success: true;
  message: string;
  fields: {
    firstName: string;
    lastName: string;
    phone: string | null;
    documentType: string | null;
    documentNumber: string | null;
  };
}

export interface UpdateProfileFailure {
  success: false;
  errors: UpdateProfileValidationErrors;
}

export type UpdateProfileResult = UpdateProfileSuccess | UpdateProfileFailure;

/**
 * Extracts the minimized client DTO from a full server profile view.
 */
export function toProfileFormDTO(profile: ServerProfileView): ProfileFormDTO {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
    documentType: (profile.documentType as DocumentTypeEnum) ?? null,
    documentNumber: profile.documentNumber,
    email: profile.email,
  };
}
