"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, Moon, Sun, UserRound } from "lucide-react";
import type { RoleName } from "@/lib/auth/rbac";
import { standingOf, STANDING_LABELS } from "@/lib/admin/staff/levels";
import { requestAdminLeave } from "@/lib/admin/navigation-guard";
import { LogoutButton } from "@/components/auth/logout-button";
import type { AdminTheme } from "./use-admin-theme";
import styles from "./admin-account-menu.module.css";

interface AdminAccountMenuProps {
  email: string | null;
  roles: readonly RoleName[];
  theme: AdminTheme;
  onToggleTheme: () => void;
}

const FOCUSABLE = "a[href], button:not([disabled])";

export function AdminAccountMenu({ email, roles, theme, onToggleTheme }: AdminAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusLast = useRef(false);
  const id = useId();
  const standing = standingOf(roles);
  const level = standing ? STANDING_LABELS[standing] : "Acceso administrativo";
  const isDark = theme === "dark";

  useEffect(() => {
    if (!open) return;
    const items = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusLast.current ? items?.[items.length - 1] : items?.[0])?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div
      ref={rootRef}
      className={styles.root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
          triggerRef.current?.focus();
          return;
        }
        const onTrigger = event.target === triggerRef.current;
        if (!open && onTrigger && ["ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          focusLast.current = event.key === "ArrowUp";
          setOpen(true);
          return;
        }
        if (!open || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
        const current = items.indexOf(document.activeElement as HTMLElement);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : (current + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
        event.preventDefault();
        items[next]?.focus();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label="Abrir menú de cuenta"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        aria-haspopup="dialog"
        onClick={() => {
          focusLast.current = false;
          setOpen((value) => !value);
        }}
      >
        <span className={styles.avatar} aria-hidden="true">
          {email?.trim() ? email.trim()[0]!.toUpperCase() : <UserRound size={17} />}
        </span>
        <span className={styles.triggerLabel}>Mi cuenta</span>
        <ChevronDown className={styles.chevron} size={14} aria-hidden="true" />
      </button>
      <div
        ref={panelRef}
        id={`${id}-panel`}
        hidden={!open}
        className={styles.panel}
        role="dialog"
        aria-labelledby={`${id}-title`}
      >
        <div className={styles.identity}>
          <span className={styles.identityIcon} aria-hidden="true">
            <UserRound size={19} />
          </span>
          <div>
            <h2 id={`${id}-title`}>Mi cuenta</h2>
            <p className={styles.email}>{email ?? "Sesión administrativa"}</p>
            <span className={styles.level}>{level}</span>
          </div>
        </div>
        <div className={styles.actions}>
          <Link className={styles.item} href="/cuenta/perfil" onClick={close}>
            <UserRound size={17} aria-hidden="true" />
            <span>Datos de mi cuenta</span>
          </Link>
          <Link
            className={styles.item}
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              close();
              triggerRef.current?.focus();
            }}
            aria-label="Ir a la tienda (abre una pestaña nueva)"
          >
            <ExternalLink size={17} aria-hidden="true" />
            <span>Ir a la tienda</span>
            <span className={styles.newTab}>Nueva pestaña</span>
          </Link>
        </div>
        <div className={styles.appearance}>
          <button
            type="button"
            className={styles.item}
            role="switch"
            aria-label="Modo oscuro"
            aria-checked={isDark}
            onClick={onToggleTheme}
          >
            {isDark ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
            <span>
              Apariencia <span className={styles.themeName}>{isDark ? "Oscuro" : "Claro"}</span>
            </span>
            <span className={styles.switch} data-checked={isDark} aria-hidden="true">
              <span />
            </span>
          </button>
        </div>
        <div
          className={styles.logout}
          onSubmitCapture={(event) => {
            if (!requestAdminLeave()) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          <LogoutButton appearance="link" />
        </div>
      </div>
    </div>
  );
}
