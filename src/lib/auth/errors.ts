/**
 * Maps Supabase Auth errors and network failures to controlled, localized Spanish messages.
 * Prevents account enumeration and internal error leakage.
 */
export function mapAuthError(
  error: { message?: string; status?: number; code?: string } | null | unknown
): string {
  if (!error || typeof error !== "object") {
    return "Ocurrió un error inesperado. Inténtalo nuevamente.";
  }

  const err = error as { message?: string; status?: number; code?: string };
  const msg = (err.message ?? "").toLowerCase();

  if (
    msg.includes("invalid login credentials") ||
    msg.includes("invalid_grant") ||
    msg.includes("email not confirmed")
  ) {
    return "Correo o contraseña incorrectos. Si acabas de registrarte, revisa tu correo para confirmar tu cuenta.";
  }

  if (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("over_email_send_rate_limit") ||
    err.status === 429
  ) {
    return "Demasiados intentos. Por favor, espera unos minutos antes de intentar nuevamente.";
  }

  if (
    msg.includes("user already registered") ||
    msg.includes("email already in use") ||
    msg.includes("user already exists")
  ) {
    return "Ya existe una cuenta registrada con este correo electrónico.";
  }

  if (
    msg.includes("token has expired") ||
    msg.includes("otp expired") ||
    msg.includes("invalid token") ||
    msg.includes("token is invalid or has expired")
  ) {
    return "El enlace de verificación ha expirado o ya fue utilizado. Por favor, solicita uno nuevo.";
  }

  if (msg.includes("password should be at least")) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }

  return "No fue posible procesar tu solicitud. Inténtalo de nuevo en unos minutos.";
}
