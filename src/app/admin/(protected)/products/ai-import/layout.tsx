import type React from "react";
import { redirect } from "next/navigation";
import { AI_ASSISTANT_ENABLED } from "@/config/features";

/** While the assistant is switched off, its workspace and proposal reviews send back to products. */
export default function AiImportLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!AI_ASSISTANT_ENABLED) redirect("/admin/products");
  return children;
}
