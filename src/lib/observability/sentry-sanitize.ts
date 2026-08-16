import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const SENSITIVE_KEY_REGEX =
  /^(password|authorization|cookie|set-cookie|token|access_token|refresh_token|secret|apikey|api_key|voucher_url|proof_url|operation_code|database_url|supabase_secret_key|resend_api_key|r2_access_key_id|r2_secret_access_key|inngest_event_key|inngest_signing_key|ai_encryption_key_v1|sentry_auth_token|email|phone|phone_number|address|street)$/i;

const STRING_PATTERNS: Array<{
  regex: RegExp;
  replacement: string | ((substring: string, ...args: string[]) => string);
}> = [
  // Database connection URLs containing credentials
  {
    regex: /postgres(?:ql)?:\/\/[^@\s]+@/gi,
    replacement: "postgres://[REDACTED_CREDENTIALS]@",
  },
  // Sensitive query parameters inside URLs (tokens, passwords, codes, secrets, emails, signatures)
  {
    regex:
      /([?&](?:token|code|secret|password|email|key|api_key|access_token|refresh_token|signature|sig|X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token)=)[^&\s#]+/gi,
    replacement: (_match: string, p1: string) => `${p1}[REDACTED]`,
  },
  // JWT tokens (Header.Payload.Signature)
  {
    regex: /\beyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]*\b/g,
    replacement: "[REDACTED_JWT]",
  },
  // 64-character hex master keys
  {
    regex: /\b[0-9a-fA-F]{64}\b/g,
    replacement: "[REDACTED_KEY]",
  },
  // Provider API keys (Resend, Supabase secret, Sentry auth)
  {
    regex: /\b(?:re_|sb_secret_|sntrys_)[A-Za-z0-9_-]+\b/gi,
    replacement: "[REDACTED_API_KEY]",
  },
  // Conservative email addresses in diagnostic messages/breadcrumbs
  {
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: "[REDACTED_EMAIL]",
  },
];

export function sanitizeString(value: string): string {
  let sanitized = value;
  for (const { regex, replacement } of STRING_PATTERNS) {
    if (typeof replacement === "string") {
      sanitized = sanitized.replace(regex, replacement);
    } else {
      sanitized = sanitized.replace(regex, replacement);
    }
  }
  return sanitized;
}

export function sanitizeObject<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    if (typeof obj === "string") {
      return sanitizeString(obj) as unknown as T;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      result[key] = "[REDACTED]";
    } else if (typeof val === "string") {
      result[key] = sanitizeString(val);
    } else if (typeof val === "object" && val !== null) {
      result[key] = sanitizeObject(val);
    } else {
      result[key] = val;
    }
  }

  return result as T;
}

/**
 * Pure Sentry beforeSend hook ensuring all events are stripped of secrets,
 * authorization headers, cookies, credentials, PII, and sensitive payment data.
 */
export function sentryBeforeSend(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  if (!event) {
    return null;
  }

  // Deep clone to avoid unexpected external mutations
  const sanitized = JSON.parse(JSON.stringify(event)) as ErrorEvent;

  // Sanitize top-level message
  if (sanitized.message) {
    sanitized.message = sanitizeString(sanitized.message);
  }

  // Sanitize exceptions
  if (sanitized.exception?.values) {
    for (const exc of sanitized.exception.values) {
      if (exc.value) {
        exc.value = sanitizeString(exc.value);
      }
    }
  }

  // Sanitize user context (preserve safe internal pseudonymous ID only; purge email, username, ip)
  if (sanitized.user) {
    const safeId =
      typeof sanitized.user.id === "string" || typeof sanitized.user.id === "number"
        ? sanitized.user.id
        : undefined;
    sanitized.user = safeId ? { id: safeId } : undefined;
  }

  // Sanitize request context
  if (sanitized.request) {
    if (sanitized.request.url) {
      sanitized.request.url = sanitizeString(sanitized.request.url);
    }
    if (sanitized.request.headers) {
      sanitized.request.headers = sanitizeObject(sanitized.request.headers);
    }
    if (sanitized.request.cookies) {
      if (typeof sanitized.request.cookies === "string") {
        sanitized.request.cookies = "[REDACTED]" as unknown as Record<string, string>;
      } else if (typeof sanitized.request.cookies === "object") {
        const redactedCookies: Record<string, string> = {};
        for (const key of Object.keys(sanitized.request.cookies)) {
          redactedCookies[key] = "[REDACTED]";
        }
        sanitized.request.cookies = redactedCookies;
      }
    }
    if (sanitized.request.data) {
      sanitized.request.data = sanitizeObject(sanitized.request.data);
    }
    if (sanitized.request.query_string) {
      if (typeof sanitized.request.query_string === "string") {
        sanitized.request.query_string = sanitizeString(sanitized.request.query_string);
      } else {
        sanitized.request.query_string = sanitizeObject(sanitized.request.query_string);
      }
    }
  }

  // Sanitize tags
  if (sanitized.tags) {
    sanitized.tags = sanitizeObject(sanitized.tags);
  }

  // Sanitize breadcrumbs
  if (sanitized.breadcrumbs) {
    for (const breadcrumb of sanitized.breadcrumbs) {
      if (breadcrumb.message) {
        breadcrumb.message = sanitizeString(breadcrumb.message);
      }
      if (breadcrumb.data) {
        breadcrumb.data = sanitizeObject(breadcrumb.data);
      }
    }
  }

  // Sanitize extra and contexts
  if (sanitized.extra) {
    sanitized.extra = sanitizeObject(sanitized.extra);
  }
  if (sanitized.contexts) {
    sanitized.contexts = sanitizeObject(sanitized.contexts);
  }

  return sanitized;
}
