"use client";

import { useEffect } from "react";
import { ADMIN_BEFORE_LEAVE_EVENT } from "@/lib/admin/navigation-guard";

/** Keeps a drawer draft safe when the operator reloads or follows an admin link. */
export function useUnsavedDraft(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const canLeave = () => window.confirm("Tienes cambios sin guardar. ¿Descartarlos y continuar?");
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const beforeLeave = (event: Event) => {
      if (!event.defaultPrevented && !canLeave()) event.preventDefault();
    };
    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      if (
        url.origin === location.origin &&
        url.pathname === location.pathname &&
        url.search === location.search
      )
        return;
      if (!canLeave()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener(ADMIN_BEFORE_LEAVE_EVENT, beforeLeave);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener(ADMIN_BEFORE_LEAVE_EVENT, beforeLeave);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty]);
}
