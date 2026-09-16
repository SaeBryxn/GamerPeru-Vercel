"use client";

import React, { useRef } from "react";
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Plus, Trash2 } from "lucide-react";
import {
  getExactFieldIssue,
  type EditorRelatedProductsPayload,
} from "@/lib/admin/catalog/story-builder-model";
import type { AdminStoryRelatedProductOption } from "@/lib/admin/catalog/story-reader";
import type { StoryValidationIssue } from "@/lib/admin/catalog/story-validation";
import { EditorField } from "./editor-field";
import styles from "../story-builder.module.css";

interface RelatedProductsEditorProps {
  blockId: string;
  payload: EditorRelatedProductsPayload;
  knownProductOptions: ReadonlyMap<string, AdminStoryRelatedProductOption>;
  issues?: readonly StoryValidationIssue[];
  onChange: (payload: EditorRelatedProductsPayload) => void;
  onOpenProductPicker: (triggerRef: React.RefObject<HTMLButtonElement | null>) => void;
  onAnnounce?: (msg: string) => void;
}

export function RelatedProductsEditor({
  blockId,
  payload,
  knownProductOptions,
  issues = [],
  onChange,
  onOpenProductPicker,
  onAnnounce = () => {},
}: RelatedProductsEditorProps) {
  const addProductTriggerRef = useRef<HTMLButtonElement | null>(null);

  const getIssue = (fieldPath: string) => getExactFieldIssue(issues, fieldPath);

  function removeProduct(index: number) {
    const nextIds = payload.productIds.filter((_, i) => i !== index);
    onChange({ ...payload, productIds: nextIds });
    onAnnounce(`Producto relacionado eliminado. Quedan ${nextIds.length}.`);
    setTimeout(() => {
      const nextFocusIndex = Math.min(index, nextIds.length - 1);
      if (nextFocusIndex >= 0) {
        const el = document.getElementById(`field-${blockId}-related-${nextFocusIndex}`);
        el?.focus();
      } else {
        addProductTriggerRef.current?.focus();
      }
    }, 10);
  }

  function moveProduct(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= payload.productIds.length) return;
    const nextIds = [...payload.productIds];
    const current = nextIds[index]!;
    const adjacent = nextIds[destination]!;
    nextIds[index] = adjacent;
    nextIds[destination] = current;
    onChange({ ...payload, productIds: nextIds });
    onAnnounce(`Producto relacionado movido a la posición ${destination + 1}.`);
  }

  const productsError =
    getIssue(".productIds") && !payload.productIds.some((_, i) => getIssue(`productIds[${i}]`))
      ? getIssue(".productIds")
      : payload.productIds.length === 0
        ? "Debes seleccionar al menos un producto relacionado."
        : undefined;

  return (
    <div className={styles.editorFieldsStack} data-testid={`editor-related-products-${blockId}`}>
      <EditorField
        fieldId={`field-${blockId}-title`}
        label="Título de la sección (opcional)"
        helpText="Máximo 200 caracteres."
        error={getIssue(".title")}
      >
        {(inputProps) => (
          <input
            type="text"
            {...inputProps}
            value={payload.title}
            onChange={(e) => onChange({ ...payload, title: e.target.value })}
            maxLength={200}
            className={styles.textInput}
            placeholder="Ej: También te podría interesar"
          />
        )}
      </EditorField>

      <div className={styles.nestedSection}>
        <div className={styles.nestedSectionHeader}>
          <div>
            <h4 className={styles.nestedSectionTitle}>
              Productos seleccionados ({payload.productIds.length} de 10)
            </h4>
            <p className={styles.fieldHelp}>
              Entre 1 y 10 productos únicos vinculados explícitamente desde el catálogo.
            </p>
          </div>
          <button
            ref={addProductTriggerRef}
            type="button"
            className={styles.secondaryButton}
            disabled={payload.productIds.length >= 10}
            onClick={() => onOpenProductPicker(addProductTriggerRef)}
            aria-label="Buscar y agregar producto relacionado"
            data-testid={`add-related-product-${blockId}`}
          >
            <Plus size={16} aria-hidden="true" />
            Buscar producto
          </button>
        </div>

        {productsError && (
          <p className={styles.fieldError} role="alert">
            {productsError}
          </p>
        )}

        <div className={styles.nestedList}>
          {payload.productIds.map((productId, index) => {
            const pos = index + 1;
            const itemError = getIssue(`productIds[${index}]`);
            const option = knownProductOptions.get(productId);
            const name = option?.name ?? `Producto (${productId.slice(0, 8)}…)`;
            const slug = option?.slug ?? "";
            const isEligible = option?.isPublicEligible ?? true;

            return (
              <div
                key={productId}
                id={`field-${blockId}-related-${index}`}
                tabIndex={-1}
                className={styles.nestedInlineRow}
                data-testid={`related-product-item-${blockId}-${index}`}
              >
                <div className={styles.inlineFieldGrow}>
                  <div className={styles.relatedProductDisplay}>
                    <strong>
                      {pos}. {name}
                    </strong>
                    {slug && <span className={styles.productSearchSlug}>/{slug}</span>}
                    {option && !isEligible && (
                      <span className={styles.notEligibleBadge}>
                        <AlertCircle size={12} aria-hidden="true" /> No elegible para publicación
                      </span>
                    )}
                    {option && isEligible && (
                      <span className={styles.eligibleBadge}>
                        <CheckCircle2 size={12} aria-hidden="true" /> Elegible
                      </span>
                    )}
                  </div>
                  {itemError && (
                    <p className={styles.fieldError} role="alert">
                      {itemError}
                    </p>
                  )}
                </div>

                <div className={styles.nestedCardActions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={index === 0}
                    onClick={() => moveProduct(index, -1)}
                    aria-label={`Mover producto ${name} hacia arriba`}
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={index === payload.productIds.length - 1}
                    onClick={() => moveProduct(index, 1)}
                    aria-label={`Mover producto ${name} hacia abajo`}
                  >
                    <ArrowDown size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.deleteAction}`}
                    onClick={() => removeProduct(index)}
                    aria-label={`Eliminar producto ${name}`}
                    data-testid={`remove-related-product-${blockId}-${index}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
