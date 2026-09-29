export interface DatabaseErrorDetails {
  errorName: string;
  /** PostgreSQL SQLSTATE (e.g. 57014 statement timeout) or a socket errno (e.g. ETIMEDOUT). */
  errorCode?: string;
}

/**
 * Classifies a database failure for logs by name and code only. The message is left out on
 * purpose: driver messages can carry table names or a connection string, and those must never
 * reach the logs. The code alone tells a timeout, pool exhaustion and a lost connection apart.
 */
export function describeDatabaseError(error: unknown): DatabaseErrorDetails {
  if (!(error instanceof Error)) {
    return { errorName: "UnknownError" };
  }
  const code = (error as { code?: unknown }).code;
  return {
    errorName: error.name,
    ...(typeof code === "string" ? { errorCode: code } : {}),
  };
}
