"use client";

import React, { useOptimistic, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react";
import { reorderMenuEntriesAction, setMenuEntryVisibilityAction } from "@/lib/admin/menu/actions";
import styles from "./menu.module.css";

export interface MenuEntryView {
  id: string;
  label: string;
  description: string;
  isVisible: boolean;
  categorySlug: string | null;
  publishedProducts: number | null;
  missingDestinations: string[];
}

interface MenuWorkspaceProps {
  entries: MenuEntryView[];
}

function VisibilityToggle({
  isVisible,
  disabled,
  onToggle,
  label,
}: {
  isVisible: boolean;
  disabled: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isVisible}
      aria-label={`${isVisible ? "Ocultar" : "Mostrar"} ${label} en el menú`}
      onClick={onToggle}
      disabled={disabled}
      className={`${styles.switch} ${isVisible ? styles.switchOn : ""}`}
      data-testid={`menu-toggle-${label.toLowerCase()}`}
    >
      <motion.span
        className={styles.switchKnob}
        layout
        transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
      />
    </button>
  );
}

export function MenuWorkspace({ entries }: MenuWorkspaceProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimisticEntries, applyOptimistic] = useOptimistic(
    entries,
    (current: MenuEntryView[], next: MenuEntryView[]) => next
  );

  const toggle = (entry: MenuEntryView) => {
    setError(null);
    const next = optimisticEntries.map((item) =>
      item.id === entry.id ? { ...item, isVisible: !item.isVisible } : item
    );

    startTransition(async () => {
      applyOptimistic(next);
      const result = await setMenuEntryVisibilityAction(entry.id, !entry.isVisible);
      if (!result.success) setError(result.error ?? "No se pudo guardar el cambio.");
    });
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= optimisticEntries.length) return;

    setError(null);
    const next = [...optimisticEntries];
    const moved = next[index];
    const displaced = next[target];
    if (!moved || !displaced) return;
    next[index] = displaced;
    next[target] = moved;

    startTransition(async () => {
      applyOptimistic(next);
      const result = await reorderMenuEntriesAction(next.map((item) => item.id));
      if (!result.success) setError(result.error ?? "No se pudo cambiar el orden.");
    });
  };

  const visibleCount = optimisticEntries.filter((entry) => entry.isVisible).length;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Menú de la tienda</h1>
        <p className={styles.subtitle}>
          Decide qué secciones ve el cliente en la barra superior. Lo que ocultes desaparece del
          menú, del cajón móvil y del pie de página al instante. {visibleCount} de{" "}
          {optimisticEntries.length} visibles.
        </p>
      </header>

      {error && (
        <p className={styles.error} role="alert" data-testid="menu-error">
          {error}
        </p>
      )}

      <ul className={styles.list}>
        {optimisticEntries.map((entry, index) => (
          <li
            key={entry.id}
            className={`${styles.item} ${entry.isVisible ? "" : styles.itemHidden}`}
            data-testid={`menu-entry-${entry.id}`}
          >
            <div className={styles.itemMain}>
              <div className={styles.itemHeading}>
                <span className={styles.itemName}>{entry.label}</span>
                <span className={entry.isVisible ? styles.statusOn : styles.statusOff}>
                  {entry.isVisible ? (
                    <>
                      <Eye size={12} aria-hidden="true" /> En el menú
                    </>
                  ) : (
                    <>
                      <EyeOff size={12} aria-hidden="true" /> Oculta
                    </>
                  )}
                </span>
              </div>
              <p className={styles.itemDescription}>{entry.description}</p>

              <div className={styles.warnings}>
                {entry.publishedProducts === 0 && (
                  <span className={styles.warning} data-testid={`menu-warning-empty-${entry.id}`}>
                    <AlertTriangle size={12} aria-hidden="true" />
                    Sin productos publicados todavía
                  </span>
                )}
                {entry.missingDestinations.length > 0 && (
                  <span
                    className={styles.warningStrong}
                    data-testid={`menu-warning-missing-${entry.id}`}
                  >
                    <AlertTriangle size={12} aria-hidden="true" />
                    {entry.missingDestinations.length} página
                    {entry.missingDestinations.length === 1 ? "" : "s"} sin construir
                  </span>
                )}
              </div>
            </div>

            <div className={styles.itemActions}>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => move(index, -1)}
                disabled={index === 0 || isPending}
                aria-label={`Subir ${entry.label}`}
              >
                <ArrowUp size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => move(index, 1)}
                disabled={index === optimisticEntries.length - 1 || isPending}
                aria-label={`Bajar ${entry.label}`}
              >
                <ArrowDown size={14} aria-hidden="true" />
              </button>
              <VisibilityToggle
                isVisible={entry.isVisible}
                disabled={isPending}
                onToggle={() => toggle(entry)}
                label={entry.label}
              />
            </div>
          </li>
        ))}
      </ul>

      <p className={styles.note}>
        &ldquo;Sin páginas construidas&rdquo; significa que esa sección del menú lleva a direcciones
        que todavía no existen: si la dejas visible, el cliente verá un error 404.
      </p>
    </div>
  );
}
