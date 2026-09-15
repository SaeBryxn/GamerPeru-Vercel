DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "product_stories" AS stories
		INNER JOIN "product_story_revisions" AS revisions
			ON revisions."id" = stories."published_revision_id"
		WHERE stories."published_revision_id" IS NOT NULL
			AND revisions."product_id" <> stories."product_id"
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '23514',
			MESSAGE = 'GP026_CHK1_PREFLIGHT_CROSS_PRODUCT_PUBLISHED_POINTER: published revision belongs to another Product';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "product_stories" AS stories
		INNER JOIN "product_story_revisions" AS revisions
			ON revisions."id" = stories."published_revision_id"
		WHERE stories."published_revision_id" IS NOT NULL
			AND revisions."status" <> 'PUBLISHED'
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '23514',
			MESSAGE = 'GP026_CHK1_PREFLIGHT_PUBLISHED_POINTER_STATUS: published pointer must target a PUBLISHED revision';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "product_stories" AS stories
		INNER JOIN "product_story_revisions" AS revisions
			ON revisions."id" = stories."published_revision_id"
		WHERE stories."published_revision_id" IS NOT NULL
			AND revisions."status" = 'PUBLISHED'
			AND revisions."published_at" IS NULL
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '23514',
			MESSAGE = 'GP026_CHK1_PREFLIGHT_PUBLISHED_POINTER_TIMESTAMP: published pointer targets a revision without published_at';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "product_story_revisions"
		WHERE "status" = 'DRAFT'
		GROUP BY "product_id"
		HAVING COUNT(*) > 1
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '23514',
			MESSAGE = 'GP026_CHK1_PREFLIGHT_MULTIPLE_DRAFTS: a Product has more than one DRAFT revision';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "product_story_revisions"
		WHERE "status" = 'PUBLISHED'
		GROUP BY "product_id"
		HAVING COUNT(*) > 1
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '23514',
			MESSAGE = 'GP026_CHK1_PREFLIGHT_MULTIPLE_PUBLISHED: a Product has more than one PUBLISHED revision';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "product_story_revisions" AS revisions
		LEFT JOIN "product_stories" AS stories
			ON stories."product_id" = revisions."product_id"
			AND stories."published_revision_id" = revisions."id"
		WHERE revisions."status" = 'PUBLISHED'
			AND stories."product_id" IS NULL
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '23514',
			MESSAGE = 'GP026_CHK1_PREFLIGHT_ORPHAN_PUBLISHED_REVISION: every PUBLISHED revision must be the authoritative published pointer for its Product';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "product_stories" ADD COLUMN "draft_revision_id" uuid;
--> statement-breakpoint
INSERT INTO "product_stories" ("product_id", "published_revision_id", "updated_at")
SELECT DISTINCT revisions."product_id", NULL::uuid, NOW()
FROM "product_story_revisions" AS revisions
LEFT JOIN "product_stories" AS stories ON stories."product_id" = revisions."product_id"
WHERE stories."product_id" IS NULL
ON CONFLICT ("product_id") DO NOTHING;
--> statement-breakpoint
UPDATE "product_stories" AS stories
SET "draft_revision_id" = drafts."revision_id"
FROM (
	SELECT "product_id", MIN("id"::text)::uuid AS "revision_id"
	FROM "product_story_revisions"
	WHERE "status" = 'DRAFT'
	GROUP BY "product_id"
	HAVING COUNT(*) = 1
) AS drafts
WHERE stories."product_id" = drafts."product_id"
	AND stories."draft_revision_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "product_story_revisions" ADD CONSTRAINT "product_story_revisions_product_id_id_unique" UNIQUE("product_id","id");
--> statement-breakpoint
ALTER TABLE "product_stories" ADD CONSTRAINT "product_stories_draft_revision_fk" FOREIGN KEY ("draft_revision_id") REFERENCES "public"."product_story_revisions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_stories" ADD CONSTRAINT "product_stories_published_revision_product_fk" FOREIGN KEY ("product_id","published_revision_id") REFERENCES "public"."product_story_revisions"("product_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_stories" ADD CONSTRAINT "product_stories_draft_revision_product_fk" FOREIGN KEY ("product_id","draft_revision_id") REFERENCES "public"."product_story_revisions"("product_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_stories" ADD CONSTRAINT "product_stories_distinct_revision_pointers" CHECK ("product_stories"."published_revision_id" IS NULL OR "product_stories"."draft_revision_id" IS NULL OR "product_stories"."published_revision_id" <> "product_stories"."draft_revision_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "product_story_revisions_one_draft_per_product_idx" ON "product_story_revisions" USING btree ("product_id") WHERE "product_story_revisions"."status" = 'DRAFT';
--> statement-breakpoint
CREATE UNIQUE INDEX "product_story_revisions_one_published_per_product_idx" ON "product_story_revisions" USING btree ("product_id") WHERE "product_story_revisions"."status" = 'PUBLISHED';
