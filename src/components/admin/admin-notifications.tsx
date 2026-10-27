"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "@/components/app-link";
import { Bell, ChevronRight, CircleCheck } from "lucide-react";
import type { AttentionSnapshot } from "@/lib/admin/dashboard-overview-types";
import styles from "./admin-notifications.module.css";

/**
 * The bell: the same pending work as «Por atender», reachable from every screen. There is no
 * separate notification feed yet, so it never shows anything the dashboard would not.
 */
export function AdminNotifications({ attention }: { attention: AttentionSnapshot | null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const items = attention?.items ?? [];
  const total = items.reduce((sum, item) => sum + item.count, 0);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={styles.root}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={
          items.length > 0 ? `Notificaciones: ${items.length} tareas pendientes` : "Notificaciones"
        }
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={19} aria-hidden="true" />
        {items.length > 0 && <span className={styles.dot} aria-hidden="true" />}
      </button>
      <div
        id={`${id}-panel`}
        className={styles.panel}
        role="dialog"
        aria-label="Notificaciones"
        hidden={!open}
      >
        <p className={styles.title}>
          Por atender
          {total > 0 && <span className={styles.count}>{total}</span>}
        </p>
        {attention === null ? (
          <p className={styles.empty}>Cargando…</p>
        ) : items.length === 0 ? (
          <p className={styles.empty}>
            <CircleCheck size={18} aria-hidden="true" />
            Todo al día
          </p>
        ) : (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className={styles.item} onClick={() => setOpen(false)}>
                  <span className={styles.tone} data-tone={item.tone} aria-hidden="true" />
                  <span className={styles.text}>
                    <span className={styles.itemTitle}>
                      <strong>{item.count}</strong> {item.title}
                    </span>
                    <span className={styles.itemDetail}>{item.detail}</span>
                  </span>
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
