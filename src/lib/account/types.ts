import type { CustomerProfile } from "@/db/schema";

export type DocumentTypeEnum = "DNI" | "CE" | "RUC" | "PASSPORT";

export interface CustomerProfileView {
  id: string;
  authUserId: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  documentType: DocumentTypeEnum | null;
  documentNumber: string | null;
  defaultShippingAddressId: string | null;
  createdAt: Date;
  updatedAt: Date;
  email: string | null;
}

export type AccountProfileState =
  | { status: "READY"; profile: CustomerProfileView }
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

export type UpdateProfileResult =
  | { success: true; message: string; profile: CustomerProfile }
  | { success: false; errors: UpdateProfileValidationErrors };
