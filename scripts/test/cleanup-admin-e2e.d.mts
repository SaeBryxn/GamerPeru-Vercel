import type postgres from "postgres";

export function cleanupAdminUsers(): Promise<void>;
export function cleanupAdminOrderFixtures(clientSql: postgres.Sql): Promise<void>;
