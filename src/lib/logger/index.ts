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
  "credential",
  "*.credential",
  "*.*.credential",
  "credentials",
  "*.credentials",
  "*.*.credentials",

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

export const NORMALIZED_SENSITIVE_KEYS = new Set([
  "ciphertext",
  "iv",
  "authtag",
  "apikey",
  "accesstoken",
  "refreshtoken",
  "authtoken",
  "bearertoken",
  "token",
  "secret",
  "password",
  "credential",
  "credentials",
  "privatekey",
  "authorization",
  "cookie",
  "setcookie",
  "voucherurl",
  "proofurl",
  "operationcode",
  "databaseurl",
  "supabasesecretkey",
  "resendapikey",
  "r2accesskeyid",
  "r2secretaccesskey",
  "inngesteventkey",
  "inngestsigningkey",
  "sentryauthtoken",
  "email",
  "phone",
  "phonenumber",
  "address",
  "street",
  "q",
]);

export function isDynamicSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, "");
  if (/^aiencryptionkeyv\d+$/.test(normalized)) {
    return true;
  }
  return NORMALIZED_SENSITIVE_KEYS.has(normalized);
}

export function sanitizeDynamicLogData<T>(val: T): T {
  if (val === null || val === undefined || typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeDynamicLogData(item)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(val as Record<string, unknown>)) {
    if (isDynamicSensitiveKey(key)) {
      out[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      out[key] = sanitizeDynamicLogData(value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

function wrapLoggerInstance(instance: pino.Logger): pino.Logger {
  const originalChild = instance.child.bind(instance);
  instance.child = ((bindings: pino.Bindings, childOptions?: pino.ChildLoggerOptions<never>) => {
    const sanitizedBindings = sanitizeDynamicLogData(bindings);
    const child = originalChild(sanitizedBindings, childOptions as never);
    return wrapLoggerInstance(child);
  }) as unknown as typeof instance.child;
  return instance;
}

export function createLogger(
  options?: pino.LoggerOptions,
  destination?: pino.DestinationStream
): pino.Logger {
  const userRedactPaths = Array.isArray(options?.redact)
    ? options.redact
    : Array.isArray(options?.redact?.paths)
      ? options.redact.paths
      : [];

  const combinedRedactPaths = Array.from(new Set([...CANONICAL_REDACT_PATHS, ...userRedactPaths]));

  const baseOptions: pino.LoggerOptions = {
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      env: process.env.NODE_ENV ?? "development",
    },
    ...options,
    redact: {
      paths: combinedRedactPaths,
      censor: "[REDACTED]",
    },
    hooks: {
      logMethod(inputArgs: Parameters<pino.LogFn>, method: pino.LogFn) {
        const sanitizedArgs = inputArgs.map((arg) =>
          typeof arg === "object" && arg !== null ? sanitizeDynamicLogData(arg) : arg
        ) as Parameters<pino.LogFn>;
        return method.apply(this, sanitizedArgs);
      },
    },
  };

  const baseLogger = destination ? pino(baseOptions, destination) : pino(baseOptions);
  return wrapLoggerInstance(baseLogger);
}

export const logger = createLogger();

export interface LogContext {
  module?: string;
  operation?: string;
  requestId?: string;
  [key: string]: unknown;
}

export function createChildLogger(context: LogContext): pino.Logger {
  return logger.child(sanitizeDynamicLogData(context));
}
