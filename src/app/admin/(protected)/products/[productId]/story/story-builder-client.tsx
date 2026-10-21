"use client";

import dynamic from "next/dynamic";
import { AdminPageSkeleton } from "@/components/admin/ui";

// Same reason as the product editor: no server-rendered HTML for an interactive-only editor.
export const StoryBuilder = dynamic(
  () => import("./story-builder").then((module) => module.StoryBuilder),
  {
    ssr: false,
    loading: () => (
      <AdminPageSkeleton layout="workspace" label="Cargando la historia del producto…" />
    ),
  }
);
