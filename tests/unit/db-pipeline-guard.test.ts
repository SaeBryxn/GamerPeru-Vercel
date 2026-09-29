import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("Supavisor-safe database client", () => {
  it("disables query pipelining on the application client", () => {
    const source = readFileSync(resolve(process.cwd(), "src/db/index.ts"), "utf-8");
    expect(source).toMatch(/max_pipeline:\s*0\b/);
  });

  it("runs the patched postgres.js that lets sql.begin reserve a connection without pipelining", () => {
    // Without the patch, max_pipeline: 0 makes every db.transaction fail with UNSAFE_TRANSACTION.
    const entry = require.resolve("postgres");
    const connectionSource = readFileSync(join(dirname(entry), "connection.js"), "utf-8");
    expect(connectionSource).toContain("sql.begin must reserve its connection");
  });
});
