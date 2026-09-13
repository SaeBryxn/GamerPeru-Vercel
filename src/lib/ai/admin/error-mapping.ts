import { ZodError } from "zod";
import { ForbiddenError } from "@/lib/auth/rbac";
import { ProposalApplyError, ProposalReviewError } from "@/lib/ai/proposals/types";
import { ResearchIdempotencyConflictError } from "@/lib/ai/research/job-service";

const SAFE_MESSAGES: Record<string, string> = {
  AUTHENTICATION_REQUIRED: "Inicia sesión con una cuenta de personal autorizada.",
  FORBIDDEN: "No tienes permiso para realizar esta operación.",
  VALIDATION_ERROR: "Revisa los campos e intenta nuevamente.",
  AI_IDEMPOTENCY_CONFLICT:
    "Este intento ya se usó para una solicitud distinta. Modifica la solicitud y vuelve a enviarla.",
  AI_PROPOSAL_STALE:
    "La propuesta cambió desde tu última lectura. Recarga los datos antes de continuar.",
  AI_PROPOSAL_UNRESOLVED_CONFLICT:
    "Selecciona una fuente preferida o ingresa un valor manual para resolver el conflicto.",
  SOURCE_CONFLICT: "La evidencia contiene valores en conflicto que requieren revisión humana.",
  APPLY_ACTOR_MISMATCH:
    "Esta aplicación fue iniciada por otra persona autorizada. Esa persona debe reanudarla.",
  AI_PROPOSAL_APPLY_FAILED_RETRYABLE:
    "La aplicación se interrumpió de forma temporal y puede reanudarse.",
  AI_PROPOSAL_APPLY_FAILED_TERMINAL:
    "La aplicación terminó con un error permanente. Requiere recuperación operativa o una nueva propuesta.",
  AI_PROFILE_DISABLED: "El perfil seleccionado está deshabilitado o no está disponible.",
  AI_PROVIDER_DISABLED: "El proveedor seleccionado está deshabilitado o no está disponible.",
  AI_RESEARCH_PROVIDER_UNSUPPORTED:
    "El proveedor seleccionado aún no tiene un adaptador de ejecución para investigación.",
  AI_PROFILE_PROVIDER_UNSUPPORTED:
    "Un perfil habilitado de GP-025 requiere un proveedor con adaptador de ejecución.",
  AI_PROVIDER_HEALTH_CHECK_UNSUPPORTED:
    "Este proveedor aún no tiene un adaptador disponible para probar la conexión.",
  AI_TARGET_PRODUCT_NOT_FOUND: "El producto seleccionado para enriquecer ya no existe.",
  AI_ENRICH_TARGET_NOT_DRAFT:
    "El producto seleccionado ya no es un borrador DRAFT y no puede enriquecerse.",
  REJECTED_SECRET_SETTINGS_KEY:
    "La configuración no secreta contiene una clave reservada para credenciales.",
  PROVIDER_NOT_FOUND: "El proveedor seleccionado no existe.",
  CREDENTIAL_NOT_FOUND: "La credencial seleccionada no existe.",
  NO_ACTIVE_CREDENTIAL: "Este proveedor no tiene una credencial activa.",
  CANNOT_ROTATE_REVOKED_CREDENTIAL: "Solo se puede rotar una credencial activa.",
};

function extractSafeCode(error: unknown): string {
  if (error instanceof ResearchIdempotencyConflictError) return error.code;
  if (error instanceof ProposalReviewError || error instanceof ProposalApplyError)
    return error.code;
  if (error instanceof ForbiddenError) return "FORBIDDEN";
  if (error instanceof ZodError) return "VALIDATION_ERROR";
  if (error instanceof Error) {
    const match = /^([A-Z][A-Z0-9_]{2,80}):/.exec(error.message);
    if (match?.[1] && SAFE_MESSAGES[match[1]]) return match[1];
  }
  return "AI_ADMIN_OPERATION_FAILED";
}

export function mapAdminAiError(error: unknown): { code: string; error: string } {
  const code = extractSafeCode(error);
  return {
    code,
    error: SAFE_MESSAGES[code] ?? "La operación no pudo completarse. Intenta nuevamente.",
  };
}
