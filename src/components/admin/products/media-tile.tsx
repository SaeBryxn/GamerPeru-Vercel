"use client";

import React, { useState } from "react";
import { AnimatePresence, m, type Variants } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Lock,
  Pencil,
  Star,
  Tag,
  Trash2,
} from "lucide-react";
import type { AdminProductUiDetail } from "@/lib/admin/catalog/ui-dto";
import styles from "./media-tile.module.css";

type MediaItem = AdminProductUiDetail["media"][number];

interface MediaTileProps {
  media: MediaItem;
  index: number;
  count: number;
  productName: string;
  isPrimary: boolean;
  variantLabel: string | null;
  isSettingPrimary: boolean;
  isDetaching: boolean;
  isConfirmingDetach: boolean;
  isReordering: boolean;
  isDragSource: boolean;
  isDropTarget: boolean;
  onSetPrimary: () => void;
  onEditAlt: (trigger: HTMLElement) => void;
  onEditVariant: (trigger: HTMLElement) => void;
  onRequestDetach: () => void;
  onCancelDetach: () => void;
  onConfirmDetach: () => void;
  onMove: (direction: "up" | "down") => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}

const overlayVariants: Variants = {
  hidden: { opacity: 0, transition: { duration: 0.15 } },
  visible: {
    opacity: 1,
    transition: { duration: 0.18, when: "beforeChildren", staggerChildren: 0.03 },
  },
};

const actionVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 520, damping: 32 } },
};

export function MediaTile({
  media,
  index,
  count,
  productName,
  isPrimary,
  variantLabel,
  isSettingPrimary,
  isDetaching,
  isConfirmingDetach,
  isReordering,
  isDragSource,
  isDropTarget,
  onSetPrimary,
  onEditAlt,
  onEditVariant,
  onRequestDetach,
  onCancelDetach,
  onConfirmDetach,
  onMove,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: MediaTileProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  // Only the grip starts a drag, so selecting text or clicking actions never picks the tile up.
  const [dragArmed, setDragArmed] = useState(false);

  const isVariantScoped = media.variantId !== null;
  const showOverlay = (isHovered || hasFocus) && !isConfirmingDetach;
  const primaryTitle = isVariantScoped
    ? "Las fotos de una variante no pueden ser la principal"
    : isPrimary
      ? "Ya es la foto principal"
      : "Hacer principal";

  return (
    <m.div layout transition={{ layout: { type: "spring", stiffness: 420, damping: 38 } }}>
      <div
        className={`${styles.tile} ${isDragSource ? styles.tileDragging : ""} ${
          isDropTarget ? styles.tileDropTarget : ""
        }`}
        draggable={dragArmed}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", media.id);
          onDragStart();
        }}
        onDragEnter={onDragEnter}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDrop();
        }}
        onDragEnd={() => {
          setDragArmed(false);
          onDragEnd();
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        data-testid={`media-card-${media.id}`}
      >
        <div
          className={styles.preview}
          onFocus={() => setHasFocus(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setHasFocus(false);
            }
          }}
        >
          {media.publicUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.publicUrl}
              alt={media.altText ?? productName}
              className={styles.image}
              draggable={false}
            />
          ) : (
            <ImageIcon size={28} className={styles.placeholder} aria-hidden="true" />
          )}

          <div className={styles.badges}>
            {isPrimary && (
              <span className={styles.badgePrimary} data-testid={`badge-primary-${media.id}`}>
                <Star size={10} fill="currentColor" aria-hidden="true" />
                Principal
              </span>
            )}
          </div>

          <m.div
            className={styles.overlay}
            variants={overlayVariants}
            initial={false}
            animate={showOverlay ? "visible" : "hidden"}
          >
            <m.button
              type="button"
              variants={actionVariants}
              onClick={onSetPrimary}
              disabled={isPrimary || isVariantScoped || isSettingPrimary}
              className={`${styles.action} ${isPrimary ? styles.actionActive : ""}`}
              title={primaryTitle}
              data-testid={`btn-set-primary-${media.id}`}
            >
              {isSettingPrimary ? (
                <Loader2 size={16} className={styles.spinner} aria-hidden="true" />
              ) : (
                <Star size={16} fill={isPrimary ? "currentColor" : "none"} aria-hidden="true" />
              )}
              <span className={styles.srOnly}>{isPrimary ? "Principal" : "Hacer Principal"}</span>
            </m.button>

            <m.button
              type="button"
              variants={actionVariants}
              onClick={(event) => onEditVariant(event.currentTarget)}
              className={styles.action}
              title="Asignar a una variante"
              data-testid={`btn-reassign-variant-${media.id}`}
            >
              <Tag size={16} aria-hidden="true" />
              <span className={styles.srOnly}>Variante</span>
            </m.button>

            <m.button
              type="button"
              variants={actionVariants}
              onClick={(event) => onEditAlt(event.currentTarget)}
              className={styles.action}
              title="Editar texto alternativo"
              data-testid={`btn-edit-alt-${media.id}`}
            >
              <Pencil size={16} aria-hidden="true" />
              <span className={styles.srOnly}>Alt Text</span>
            </m.button>

            <m.button
              type="button"
              variants={actionVariants}
              onClick={onRequestDetach}
              disabled={isPrimary || isDetaching}
              className={`${styles.action} ${styles.actionDanger}`}
              title={
                isPrimary
                  ? "Elige otra foto como principal antes de quitar esta"
                  : "Quitar esta foto del producto"
              }
              aria-label={`Quitar la foto ${index + 1} del producto`}
              data-testid={`btn-detach-media-${media.id}`}
            >
              {isDetaching ? (
                <Loader2 size={16} className={styles.spinner} aria-hidden="true" />
              ) : (
                <Trash2 size={16} aria-hidden="true" />
              )}
            </m.button>
          </m.div>

          <AnimatePresence>
            {isConfirmingDetach && (
              <m.div
                className={styles.confirm}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <span>¿Quitar esta foto?</span>
                <div className={styles.confirmActions}>
                  <button type="button" onClick={onCancelDetach} className={styles.confirmCancel}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={onConfirmDetach}
                    className={styles.confirmDanger}
                    data-testid={`btn-confirm-detach-${media.id}`}
                  >
                    Quitar
                  </button>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>

        <div className={styles.footer}>
          <span
            className={styles.grip}
            onPointerDown={() => setDragArmed(true)}
            onPointerUp={() => setDragArmed(false)}
            title="Arrastra para ordenar"
            aria-hidden="true"
          >
            <GripVertical size={14} />
          </span>

          <div className={styles.meta}>
            {isVariantScoped ? (
              <span className={styles.scope} data-testid={`badge-variant-${media.id}`}>
                <Tag size={10} aria-hidden="true" />
                <span className={styles.scopeText}>
                  Variante: {variantLabel ?? media.variantId}
                </span>
              </span>
            ) : (
              <span className={styles.scope} data-testid={`badge-global-${media.id}`}>
                Global
              </span>
            )}
            {!media.publicUrl && (
              <span className={styles.private} data-testid="non-public-media-badge">
                <Lock size={10} aria-hidden="true" />
                Privado
              </span>
            )}
          </div>

          <div className={styles.move}>
            <button
              type="button"
              onClick={() => onMove("up")}
              disabled={index === 0 || isReordering}
              className={styles.moveButton}
              aria-label="Mover antes"
              title="Mover antes"
              data-testid={`btn-move-up-${media.id}`}
            >
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onMove("down")}
              disabled={index === count - 1 || isReordering}
              className={styles.moveButton}
              aria-label="Mover después"
              title="Mover después"
              data-testid={`btn-move-down-${media.id}`}
            >
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </m.div>
  );
}
