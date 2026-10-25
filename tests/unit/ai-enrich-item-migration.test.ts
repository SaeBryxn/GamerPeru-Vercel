import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

const MIGRATION = resolve(
  process.cwd(),
  "src/db/migrations/0024_ai_enrich_item_outlives_product.sql"
);

describe("0024 — un ítem ENRICH de IA no impide eliminar su producto", () => {
  it("el producto objetivo se suelta (set null) al eliminarse", () => {
    const fk = getTableConfig(schema.aiResearchJobItems).foreignKeys.find(
      (candidate) => candidate.reference().foreignTable === schema.products
    );
    expect(fk?.onDelete).toBe("set null");
  });

  it("la restricción ya no exige producto en ENRICH, pero sí la versión del snapshot", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const enrichBranch = sql.slice(sql.lastIndexOf("'ENRICH'"));

    expect(sql).toContain('DROP CONSTRAINT "ai_research_job_items_mode_product_snapshot_check"');
    expect(sql).toContain('ADD CONSTRAINT "ai_research_job_items_mode_product_snapshot_check"');
    expect(enrichBranch).toContain('"target_product_version_snapshot" IS NOT NULL');
    expect(enrichBranch).not.toContain('"target_product_id" IS NOT NULL');
  });
});
