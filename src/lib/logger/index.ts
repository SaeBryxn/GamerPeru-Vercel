import "server-only";
import pino from "pino";

export const CANONICAL_REDACT_PATHS = [
  // Authentication & Authorization credentials
  "password",
  "*.password",
  "*.*.password",
  "authorization",
  "*.authorization",
  "headers.authorization",
  "headers.Authorization",
  "cookie",
  "*.cookie",
  "headers.cookie",
  "headers.Cookie",
  "token",
  "*.token",
  "*.*.token",
  "access_token",
  "*.access_token",
  "refresh_token",
  "*.refresh_token",
  "secret",
  "*.secret",
  "*.*.secret",
  "apiKey",
  "*.apiKey",
  "api_key",
  "*.api_key",

  // Payment proofs & verification references
  "voucher_url",
  "*.voucher_url",
  "proof_url",
  "*.proof_url",
  "operation_code",
  "*.operation_code",

  // Canonical Gamer Perú Environment Secrets
  "DATABASE_URL",
  "*.DATABASE_URL",
  "SUPABASE_SECRET_KEY",
  "*.SUPABASE_SECRET_KEY",
  "RESEND_API_KEY",
  "*.RESEND_API_KEY",
  "R2_ACCESS_KEY_ID",
  "*.R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "*.R2_SECRET_ACCESS_KEY",
  "INNGEST_EVENT_KEY",
  "*.INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "*.INNGEST_SIGNING_KEY",
  "AI_ENCRYPTION_KEY_V1",
  "*.AI_ENCRYPTION_KEY_V1",
  "SENTRY_AUTH_TOKEN",
  "*.SENTRY_AUTH_TOKEN",
];

export function createLogger(
  options?: pino.LoggerOptions,
  destination?: pino.DestinationStream
): pino.Logger {
  const baseOptions: pino.LoggerOptions = {
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
    redact: {
      paths: CANONICAL_REDACT_PATHS,
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      env: process.env.NODE_ENV ?? "development",
    },
    ...options,
  };

  return destination ? pino(baseOptions, destination) : pino(baseOptions);
}

export const logger = createLogger();

export interface LogContext {
  module?: string;
  operation?: string;
  requestId?: string;
  [key: string]: unknown;
}

export function createChildLogger(context: LogContext): pino.Logger {
  return logger.child(context);
}
