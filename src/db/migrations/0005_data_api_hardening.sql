REVOKE ALL PRIVILEGES ON TABLE
	"public"."brands",
	"public"."categories",
	"public"."category_specification_schemas",
	"public"."customer_profiles",
	"public"."media_assets",
	"public"."permissions",
	"public"."product_media",
	"public"."product_specifications",
	"public"."product_stories",
	"public"."product_story_revisions",
	"public"."product_variants",
	"public"."products",
	"public"."role_permissions",
	"public"."roles",
	"public"."user_roles"
FROM "anon", "authenticated", "service_role";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM "anon", "authenticated", "service_role";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "anon", "authenticated", "service_role";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE EXECUTE ON FUNCTIONS FROM "anon", "authenticated", "service_role";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;