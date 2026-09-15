"use server";

import { revalidatePath } from "next/cache";
import { getVerifiedAuthContext, type PermissionName } from "@/lib/auth/rbac";
import { mapDomainErrorToUi } from "./error-mapping";
import {
  CatalogDomainError,
  CatalogIdempotencyConflictError,
  CatalogReplayIntegrityError,
} from "./types";
import {
  discardProductStoryDraft,
  publishProductStory,
  saveProductStoryDraft,
  StoryLifecycleIntegrityError,
  StoryStaleWriteError,
  unpublishProductStory,
  type PublishProductStoryInput,
  type SaveProductStoryDraftInput,
  type StoryMutationResult,
  type StoryPointerMutationInput,
} from "./story-service";
import { StoryValidationError, type StoryValidationIssue } from "./story-validation";

export interface StoryActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  fieldErrors?: StoryValidationIssue[];
  currentDraftRevisionId?: string | null;
  currentPublishedRevisionId?: string | null;
}

function unauthorizedResult(
  status: "UNAUTHENTICATED" | "ERROR"
): StoryActionResult<StoryMutationResult> {
  if (status === "ERROR") {
    return {
      success: false,
      error: "El servicio de autorización no está disponible en este momento.",
      code: "AUTHORIZATION_UNAVAILABLE",
    };
  }
  return {
    success: false,
    error: "Debes iniciar sesión con una cuenta de personal autorizada.",
    code: "AUTHENTICATION_REQUIRED",
  };
}

function forbiddenResult(): StoryActionResult<StoryMutationResult> {
  return {
    success: false,
    error: "No tienes permisos para realizar esta operación de historia.",
    code: "FORBIDDEN",
  };
}

function mapStoryError(error: unknown): StoryActionResult<StoryMutationResult> {
  if (error instanceof StoryValidationError) {
    return {
      success: false,
      error: "Revisa los campos señalados antes de continuar.",
      code: error.code,
      fieldErrors: error.issues,
    };
  }
  if (error instanceof StoryStaleWriteError) {
    return {
      success: false,
      error:
        "La historia cambió desde que abriste el editor. Recarga la versión actual antes de continuar.",
      code: error.code,
      currentDraftRevisionId: error.currentDraftRevisionId,
      currentPublishedRevisionId: error.currentPublishedRevisionId,
    };
  }
  if (error instanceof StoryLifecycleIntegrityError) {
    return {
      success: false,
      error: "No se pudo verificar de forma segura el estado actual de la historia.",
      code: error.code,
    };
  }
  if (
    error instanceof CatalogIdempotencyConflictError ||
    error instanceof CatalogReplayIntegrityError
  ) {
    const mapped = mapDomainErrorToUi(error);
    return { success: false, ...mapped };
  }
  if (error instanceof CatalogDomainError) {
    switch (error.code) {
      case "PRODUCT_NOT_FOUND":
        return {
          success: false,
          error: "El producto solicitado no existe.",
          code: error.code,
        };
      case "PRODUCT_STORY_NOT_FOUND":
      case "STORY_DRAFT_NOT_FOUND":
      case "STORY_PUBLISHED_REVISION_NOT_FOUND":
        return {
          success: false,
          error: "No se encontró la revisión de historia requerida para esta operación.",
          code: error.code,
        };
      case "STORY_INVALID_REQUEST":
        return {
          success: false,
          error: "La solicitud de historia no tiene una estructura válida.",
          code: error.code,
        };
      case "STORY_NOT_RENDERABLE":
        return {
          success: false,
          error: "La historia no puede renderizarse completamente y no puede publicarse.",
          code: error.code,
        };
      case "FORBIDDEN":
        return forbiddenResult();
    }
  }
  return {
    success: false,
    error: "Ocurrió un error inesperado al procesar la historia.",
    code: "UNKNOWN_ERROR",
  };
}

function revalidateAdminPaths(productId: string): void {
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/admin/products/${productId}/story`);
}

async function runStoryAction<TInput>(
  permission: PermissionName,
  input: TInput,
  operation: (
    input: TInput,
    options: {
      authContext: Awaited<ReturnType<typeof getVerifiedAuthContext>> & { status: "READY" };
    }
  ) => Promise<StoryMutationResult>,
  revalidatePublicPath: boolean
): Promise<StoryActionResult<StoryMutationResult>> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return unauthorizedResult(authContext.status);
  }
  if (!authContext.permissions.has(permission)) {
    return forbiddenResult();
  }

  try {
    const result = await operation(input, { authContext });
    revalidateAdminPaths(result.productId);
    if (revalidatePublicPath) {
      revalidatePath(`/productos/${result.productSlug}`);
    }
    return { success: true, data: result };
  } catch (error) {
    return mapStoryError(error);
  }
}

export async function saveProductStoryDraftAction(
  input: SaveProductStoryDraftInput
): Promise<StoryActionResult<StoryMutationResult>> {
  return runStoryAction("catalog:manage", input, saveProductStoryDraft, false);
}

export async function discardProductStoryDraftAction(
  input: StoryPointerMutationInput
): Promise<StoryActionResult<StoryMutationResult>> {
  return runStoryAction("catalog:manage", input, discardProductStoryDraft, false);
}

export async function publishProductStoryAction(
  input: PublishProductStoryInput
): Promise<StoryActionResult<StoryMutationResult>> {
  return runStoryAction("catalog:publish", input, publishProductStory, true);
}

export async function unpublishProductStoryAction(
  input: StoryPointerMutationInput
): Promise<StoryActionResult<StoryMutationResult>> {
  return runStoryAction("catalog:publish", input, unpublishProductStory, true);
}
