import "server-only";
import pino from "pino";

const SENSITIVE_PATHS = [
  "password",
  "*.password",
  "authorization",
  "*.authorization",
  "headers.authorization",
  "cookie",
  "*.cookie",
  "headers.cookie",
  "token",
  "*.token",
  "access_token",
  "*.access_token",
  "refresh_token",
  "*.refresh_token",
  "secret",
  "*.secret",
  "apiKey",
  "*.apiKey",
  "api_key",
  "*.api_key",
  "voucher_url",
  "*.voucher_url",
  "proof_url",
  "*.proof_url",
  "operation_code",
  "*.operation_code",
  "DATABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "AI_ENCRYPTION_KEY_V1",
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  redact: {
    paths: SENSITIVE_PATHS,
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: process.env.NODE_ENV ?? "development",
  },
});

export interface LogContext {
  module?: string;
  operation?: string;
  requestId?: string;
  [key: string]: unknown;
}

export function createChildLogger(context: LogContext): pino.Logger {
  return logger.child(context);
}
