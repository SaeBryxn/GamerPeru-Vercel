import { inngest } from "../client";
import { expireStaleUploads } from "@/lib/admin/media/upload-ledger";

export const mediaUploadsSweep = inngest.createFunction(
  {
    id: "media-uploads-sweep",
    name: "Limpieza de subidas de medios caducadas",
    concurrency: { limit: 1 },
    triggers: [{ cron: "17 * * * *" }],
  },
  async ({ step }) =>
    step.run("expire-pending-media-uploads", () => expireStaleUploads(new Date(), 25))
);
