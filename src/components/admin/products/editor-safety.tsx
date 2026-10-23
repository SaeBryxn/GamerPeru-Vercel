"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getProductEditorVersionAction } from "@/lib/admin/catalog/version-actions";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";
import styles from "./product-page-step.module.css";
const SafetyContext = createContext<{
  dirty: (key: string, value: boolean) => void;
  canLeave: () => boolean;
} | null>(null);
export function useEditorSafety() {
  return useContext(SafetyContext);
}
export function useEditorDirty(key: string, value: boolean) {
  const safety = useEditorSafety();
  useEffect(() => {
    safety?.dirty(key, value);
    return () => safety?.dirty(key, false);
  }, [key, value, safety]);
}
export function EditorSafetyProvider({
  productId,
  version,
  children,
}: {
  productId: string;
  version: string;
  children: React.ReactNode;
}) {
  const dirty = useRef(new Set<string>());
  const baseline = useRef(version);
  const lastSeen = useRef(version);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const markDirty = useCallback((key: string, value: boolean) => {
    if (value) dirty.current.add(key);
    else dirty.current.delete(key);
  }, []);
  const canLeave = useCallback(
    () =>
      dirty.current.size === 0 ||
      window.confirm("Tienes cambios sin guardar. ¿Quieres descartarlos y continuar?"),
    []
  );
  const context = React.useMemo(() => ({ dirty: markDirty, canLeave }), [markDirty, canLeave]);
  useEffect(() => {
    if (!dirty.current.size) {
      baseline.current = version;
      setRemoteChanged(false);
    }
  }, [version]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty.current.size) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const navigate = (event: MouseEvent) => {
      const link =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (
        event.defaultPrevented ||
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download") ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const url = new URL(link.href, location.href);
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (!canLeave()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [canLeave]);
  useVisiblePolling(
    productId,
    true,
    async () => {
      const current = await getProductEditorVersionAction(productId);
      if (!current) return false;
      const changed = current !== lastSeen.current;
      lastSeen.current = current;
      if (current !== baseline.current) setRemoteChanged(true);
      return changed;
    },
    30000,
    120000
  );
  return (
    <SafetyContext.Provider value={context}>
      {remoteChanged && (
        <aside role="status" className={styles.hint}>
          Hay una versión nueva de este producto. Tus campos siguen intactos; revisa antes de
          guardar para evitar sobrescribir cambios.
          <button
            type="button"
            onClick={() => {
              if (canLeave()) {
                dirty.current.clear();
                location.reload();
              }
            }}
          >
            Recargar datos y descartar mis cambios
          </button>
        </aside>
      )}
      {children}
    </SafetyContext.Provider>
  );
}
