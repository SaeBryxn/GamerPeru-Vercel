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
