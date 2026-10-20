import "server-only";

import { publicEnv } from "@/config/public-env";
import {
  getVerifiedAuthContext,
  type PermissionName,
  type VerifiedAuthContextReady,
} from "@/lib/auth/rbac";
import { CatalogDomainError } from "@/lib/admin/catalog/types";
import { mapDomainErrorToUi } from "@/lib/admin/catalog/error-mapping";

export function mediaJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function mediaRouteError(error: unknown): Response {
  return mediaJson(
    mapDomainErrorToUi(error),
    error instanceof CatalogDomainError ? error.httpStatus : 500
  );
}

export async function guardAdminMediaRequest(
  request: Request,
  permission: PermissionName
): Promise<
  { ok: true; authContext: VerifiedAuthContextReady } | { ok: false; response: Response }
> {
  const deny = (error: string, code: string, status: number) =>
    ({ ok: false, response: mediaJson({ error, code }, status) }) as const;
  if (request.method !== "POST") return deny("Método no permitido.", "METHOD_NOT_ALLOWED", 405);
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  ) {
    return deny("Se requiere JSON.", "INVALID_CONTENT_TYPE", 415);
  }
  const site = new URL(publicEnv.NEXT_PUBLIC_SITE_URL);
  const www = new URL(site.origin);
  www.hostname = site.hostname.startsWith("www.") ? site.hostname.slice(4) : `www.${site.hostname}`;
  const origins = new Set([site.origin, www.origin]);
  if (process.env.NODE_ENV === "development") origins.add("http://localhost:3000");
  if (!origins.has(request.headers.get("origin") ?? "")) {
    return deny("Origen no permitido.", "FORBIDDEN_ORIGIN", 403);
  }
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return deny(
      "Debes iniciar sesión con una cuenta de personal autorizada.",
      "AUTHENTICATION_REQUIRED",
      401
    );
  }
  if (!authContext.permissions.has(permission)) {
    return deny("No tienes permisos para gestionar medios.", "FORBIDDEN", 403);
  }
  return { ok: true, authContext };
}
