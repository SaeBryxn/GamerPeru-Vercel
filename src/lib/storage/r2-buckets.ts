import "server-only";
import { serverEnv } from "@/config/server-env";

/**
 * Cloudflare R2 Logical Bucket Names
 */
export const R2_BUCKETS = {
  get PUBLIC_MEDIA() {
    return serverEnv.R2_PUBLIC_MEDIA_BUCKET;
  },
  get PRIVATE_PROOFS() {
    return serverEnv.R2_PRIVATE_PROOFS_BUCKET;
  },
  get PRIVATE_PAYMENT_MEDIA() {
    return serverEnv.R2_PRIVATE_PAYMENT_MEDIA_BUCKET;
  },
  get DB_BACKUPS() {
    return serverEnv.R2_DB_BACKUPS_BUCKET;
  },
} as const;
