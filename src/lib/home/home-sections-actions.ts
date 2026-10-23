"use server";

import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { mapDomainErrorToUi } from "@/lib/admin/catalog/error-mapping";
import { revalidateStorefrontHome } from "./read-home-sections";
import {
  reorderHomeSections,
  setHomeSectionVisibility,
  updateHomeSectionContent,
} from "./home-sections-service";

export interface HomeSectionActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

async function readyContext() {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      error: {
        success: false as const,
        error: "Debes iniciar sesión con una cuenta de personal autorizada.",
        code: "AUTHENTICATION_REQUIRED",
      },
    };
  }
  if (!authContext.permissions.has("catalog:manage")) {
    return {
      error: {
        success: false as const,
        error: "No tienes los permisos necesarios para gestionar el home.",
        code: "FORBIDDEN",
      },
    };
  }
  return { authContext };
}

function refresh(): void {
  revalidateStorefrontHome();
}

export async function updateHomeSectionContentAction(input: {
  sectionId: string;
  expectedVersion: number;
  content: unknown;
}): Promise<HomeSectionActionResult<{ version: number }>> {
  const context = await readyContext();
  if (context.error) return context.error;
  try {
    const data = await updateHomeSectionContent(input, { authContext: context.authContext });
    refresh();
    return { success: true, data };
  } catch (err) {
    return { success: false, ...mapDomainErrorToUi(err) };
  }
}

export async function setHomeSectionVisibilityAction(input: {
  sectionId: string;
  expectedVersion: number;
  isVisible: boolean;
}): Promise<HomeSectionActionResult<{ version: number }>> {
  const context = await readyContext();
  if (context.error) return context.error;
  try {
    const data = await setHomeSectionVisibility(input, { authContext: context.authContext });
    refresh();
    return { success: true, data };
  } catch (err) {
    return { success: false, ...mapDomainErrorToUi(err) };
  }
}

export async function reorderHomeSectionsAction(input: {
  orderedIds: string[];
  expectedOrder: string[];
}): Promise<HomeSectionActionResult<{ versions: Record<string, number> }>> {
  const context = await readyContext();
  if (context.error) return context.error;
  try {
    const data = await reorderHomeSections(input, { authContext: context.authContext });
    refresh();
    return { success: true, data };
  } catch (err) {
    return { success: false, ...mapDomainErrorToUi(err) };
  }
}
