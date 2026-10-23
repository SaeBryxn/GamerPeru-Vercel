import React from "react";
import { AdminPageSkeleton } from "@/components/admin/ui/admin-page-skeleton";

export default function InventoryLoading() {
  return <AdminPageSkeleton layout="list" label="Cargando inventario" />;
}
