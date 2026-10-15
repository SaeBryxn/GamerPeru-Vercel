CREATE TYPE "public"."home_section_type" AS ENUM('video_hero', 'product_carousel', 'feature_video', 'split_showcase', 'compare_slider', 'catalog_rail', 'bento_showcase', 'community_banner', 'trust_strip');--> statement-breakpoint
CREATE TABLE "home_section_media" (
	"section_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"slot" varchar(64) NOT NULL,
	CONSTRAINT "home_section_media_pk" PRIMARY KEY("section_id","slot")
);
--> statement-breakpoint
CREATE TABLE "home_sections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"section_type" "home_section_type" NOT NULL,
	"display_order" integer NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"content" jsonb NOT NULL,
	"content_schema_version" smallint DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_auth_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "home_sections_display_order_check" CHECK ("home_sections"."display_order" >= 0),
	CONSTRAINT "home_sections_version_positive" CHECK ("home_sections"."version" > 0),
	CONSTRAINT "home_sections_content_object" CHECK (jsonb_typeof("home_sections"."content") = 'object')
);
--> statement-breakpoint
ALTER TABLE "home_section_media" ADD CONSTRAINT "home_section_media_section_fk" FOREIGN KEY ("section_id") REFERENCES "public"."home_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_section_media" ADD CONSTRAINT "home_section_media_asset_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_sections" ADD CONSTRAINT "home_sections_updated_by_auth_user_id_users_id_fk" FOREIGN KEY ("updated_by_auth_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "home_section_media_asset_idx" ON "home_section_media" USING btree ("media_asset_id");--> statement-breakpoint
CREATE INDEX "home_sections_order_idx" ON "home_sections" USING btree ("display_order","id");--> statement-breakpoint
CREATE UNIQUE INDEX "home_sections_single_hero_idx" ON "home_sections" USING btree ("section_type") WHERE "home_sections"."section_type" = 'video_hero';--> statement-breakpoint
-- Server-only tables: keep them out of the Supabase Data API. The app reads them as the table owner.
ALTER TABLE "home_sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "home_section_media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."home_sections", "public"."home_section_media" FROM "anon", "authenticated", "service_role";
--> statement-breakpoint
-- Seed: the home as it shipped before ADR-012, identical to DEFAULT_HOME_SECTIONS (src/lib/home/default-sections.ts).
INSERT INTO "home_sections" ("id", "section_type", "display_order", "is_visible", "content") VALUES
  ('01a1c000-0000-7000-8000-000000000001', 'video_hero', 0, true, '{"heading":"Periféricos gaming de alto rendimiento","scrollHintLabel":"Desliza para ver la tienda","video":{"kind":"youtube","videoId":"2gX-vyQwHsA"}}'::jsonb),
  ('01a1c000-0000-7000-8000-000000000002', 'product_carousel', 1, true, '{"eyebrow":"Colección","title":"Lo que tenemos disponible","source":{"kind":"showcase"},"maxItems":16}'::jsonb),
  ('01a1c000-0000-7000-8000-000000000003', 'feature_video', 2, true, '{"eyebrow":"Nueva generación","title":"ATK A9 PRO MAX","subtitle":"El mouse insignia de ATK, disponible en Gamer Perú.","cta":{"label":"Ver más","href":"/productos/atk-a9-pro-max-white"},"video":{"kind":"youtube","videoId":"3nAqLAV8JN0"}}'::jsonb),
  ('01a1c000-0000-7000-8000-000000000004', 'split_showcase', 3, true, '{"eyebrow":"Multimarca · Precios en soles · Soporte local","title":"Armado para competir","features":[{"title":"Marcas que cuestan encontrar","description":"Trabajamos con ATK, Mchose, JINMS y X-Raypad."},{"title":"Precios en soles","description":"Todo el catálogo en PEN, sin conversiones ni sorpresas al pagar."},{"title":"Pago con Yape o Plin","description":"Coordinamos y verificamos cada pago contigo antes de despachar."},{"title":"Atención por WhatsApp","description":"Te responde una persona del equipo, no un robot."}],"image":{"mediaAssetId":null,"alt":"Mouse gaming destacado de Gamer Perú"}}'::jsonb),
  ('01a1c000-0000-7000-8000-000000000005', 'compare_slider', 4, true, '{"eyebrow":"Dos acabados del mismo modelo","title":"Elige el tuyo.","left":{"kicker":"Clásico","name":"Negro","image":{"mediaAssetId":null,"alt":"Mouse gaming en color negro, vista de perfil"}},"right":{"kicker":"Limpio","name":"Blanco","image":{"mediaAssetId":null,"alt":"Mouse gaming en color blanco, vista de perfil"}}}'::jsonb),
  ('01a1c000-0000-7000-8000-000000000006', 'catalog_rail', 5, true, '{"eyebrow":"Mouses","title":"Nuestros mouses","categorySlug":"mouses","seeAllLabel":"Ver todos","maxItems":12}'::jsonb),
  ('01a1c000-0000-7000-8000-000000000007', 'bento_showcase', 6, true, '{"title":["Explora nuestros","mousepads"],"description":"Superficies de control y de velocidad, en tamaño grande o compacto según tu sensibilidad.","images":[{"mediaAssetId":null,"alt":"Mousepad grande sobre un escritorio"},{"mediaAssetId":null,"alt":"Detalle del borde cosido de un mousepad"},{"mediaAssetId":null,"alt":"Mousepad con diseño ilustrado"}]}'::jsonb),
  ('01a1c000-0000-7000-8000-000000000008', 'catalog_rail', 7, true, '{"eyebrow":"Mousepads","title":"Nuestros mousepads","categorySlug":"mousepads","seeAllLabel":"Ver todos","maxItems":12}'::jsonb),
  ('01a1c000-0000-7000-8000-000000000009', 'community_banner', 8, true, '{"eyebrow":"Gamer Perú","title":["Únete a nuestra","comunidad"],"description":"Novedades, lanzamientos y recomendaciones directo del equipo que arma la tienda.","ctaLabel":"Entrar al Discord","ctaHref":null,"background":{"mediaAssetId":null,"alt":"Ilustración de la comunidad Gamer Perú"}}'::jsonb),
  ('01a1c000-0000-7000-8000-00000000000a', 'trust_strip', 9, true, '{"items":[{"icon":"whatsapp","title":"Atención por WhatsApp","description":"Te responde una persona del equipo."},{"icon":"payment","title":"Pago con Yape o Plin","description":"Verificamos cada pago al coordinar tu pedido."},{"icon":"currency","title":"Precios en soles","description":"Todo el catálogo en PEN, sin conversiones."},{"icon":"catalog","title":"Catálogo multimarca","description":"ATK, Mchose, JINMS y X-Raypad."}]}'::jsonb);
