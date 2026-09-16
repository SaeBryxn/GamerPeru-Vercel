"use client";

import React, { useRef } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { EditorDimensionsPayload } from "@/lib/admin/catalog/story-builder-model";
import type { AdminStorySelectableMedia } from "@/lib/admin/catalog/story-reader";
import type { StoryValidationIssue } from "@/lib/admin/catalog/story-validation";
import { EditorField, MediaField } from "./editor-field";
import styles from "../story-builder.module.css";

interface DimensionsEditorProps {
  blockId: string;
  payload: EditorDimensionsPayload;
  selectableMedia: readonly AdminStorySelectableMedia[];
  issues?: readonly StoryValidationIssue[];
  onChange: (payload: EditorDimensionsPayload) => void;
  onOpenMediaPicker: (options: {
    title: string;
    mediaType: "IMAGE";
    selectedMediaId?: string;
    allowClear?: boolean;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
    onSelect: (mediaId: string | undefined) => void;
  }) => void;
  onAnnounce?: (msg: string) => void;
}

export function DimensionsEditor({
  blockId,
  payload,
  selectableMedia,
  issues = [],
  onChange,
  onOpenMediaPicker,
  onAnnounce = () => {},
}: DimensionsEditorProps) {
  const addGripButtonRef = useRef<HTMLButtonElement | null>(null);

  const getIssue = (fieldPath: string) => issues.find((i) => i.path.includes(fieldPath))?.message;

  function addGripType() {
    if (payload.gripTypes.length >= 10) return;
    const newId = crypto.randomUUID();
    const nextGrips = [...payload.gripTypes, { clientId: newId, value: "" }];
    onChange({ ...payload, gripTypes: nextGrips });
    onAnnounce(`Tipo de agarre ${nextGrips.length} agregado.`);
    setTimeout(() => {
      const el = document.getElementById(`field-${blockId}-gripTypes-${nextGrips.length - 1}`);
      el?.focus();
    }, 10);
  }

  function removeGripType(index: number) {
    const nextGrips = payload.gripTypes.filter((_, i) => i !== index);
    onChange({ ...payload, gripTypes: nextGrips });
    onAnnounce(`Tipo de agarre ${index + 1} eliminado.`);
    setTimeout(() => {
      const nextFocusIndex = Math.min(index, nextGrips.length - 1);
      if (nextFocusIndex >= 0) {
        const el = document.getElementById(`field-${blockId}-gripTypes-${nextFocusIndex}`);
        el?.focus();
      } else {
        addGripButtonRef.current?.focus();
      }
    }, 10);
  }

  function moveGripType(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= payload.gripTypes.length) return;
    const nextGrips = [...payload.gripTypes];
    const current = nextGrips[index]!;
    const adjacent = nextGrips[destination]!;
    nextGrips[index] = adjacent;
    nextGrips[destination] = current;
    onChange({ ...payload, gripTypes: nextGrips });
    onAnnounce(`Tipo de agarre movido a la posición ${destination + 1}.`);
  }

  return (
    <div className={styles.editorFieldsStack} data-testid={`editor-dimensions-${blockId}`}>
      <p className={styles.sectionNotice}>
        Este bloque requiere al menos un plano, una medida numérica o un tipo de agarre.
      </p>

      {getIssue("blocks[") &&
        !getIssue("lengthMm") &&
        !getIssue("widthMm") &&
        !getIssue("heightMm") &&
        !getIssue("blueprintMediaId") && (
          <p className={styles.fieldError} role="alert">
            {getIssue("blocks[")}
          </p>
        )}

      <MediaField
        fieldId={`field-${blockId}-blueprintMediaId`}
        label="Plano o esquema visual (opcional)"
        mediaType="IMAGE"
        selectedMediaId={payload.blueprintMediaId}
        selectableMedia={selectableMedia}
        helpText="Esquema con cotas o dimensiones."
        error={getIssue("blueprintMediaId")}
        onOpenPicker={(triggerRef) =>
          onOpenMediaPicker({
            title: "Seleccionar plano o esquema de dimensiones",
            mediaType: "IMAGE",
            selectedMediaId: payload.blueprintMediaId,
            triggerRef,
            onSelect: (blueprintMediaId) => onChange({ ...payload, blueprintMediaId }),
          })
        }
        onClear={() => onChange({ ...payload, blueprintMediaId: undefined })}
      />

      <div className={styles.nestedGridThree}>
        <EditorField
          fieldId={`field-${blockId}-lengthMm`}
          label="Largo (mm)"
          helpText="Número > 0 y ≤ 1000"
          error={getIssue("lengthMm")}
        >
          {(inputProps) => (
            <input
              type="text"
              inputMode="decimal"
              {...inputProps}
              value={payload.lengthMm}
              onChange={(e) => onChange({ ...payload, lengthMm: e.target.value })}
              className={styles.textInput}
              placeholder="Ej: 118"
            />
          )}
        </EditorField>

        <EditorField
          fieldId={`field-${blockId}-widthMm`}
          label="Ancho (mm)"
          helpText="Número > 0 y ≤ 1000"
          error={getIssue("widthMm")}
        >
          {(inputProps) => (
            <input
              type="text"
              inputMode="decimal"
              {...inputProps}
              value={payload.widthMm}
              onChange={(e) => onChange({ ...payload, widthMm: e.target.value })}
              className={styles.textInput}
              placeholder="Ej: 62.5"
            />
          )}
        </EditorField>

        <EditorField
          fieldId={`field-${blockId}-heightMm`}
          label="Alto (mm)"
          helpText="Número > 0 y ≤ 1000"
          error={getIssue("heightMm")}
        >
          {(inputProps) => (
            <input
              type="text"
              inputMode="decimal"
              {...inputProps}
              value={payload.heightMm}
              onChange={(e) => onChange({ ...payload, heightMm: e.target.value })}
              className={styles.textInput}
              placeholder="Ej: 38"
            />
          )}
        </EditorField>
      </div>

      <div className={styles.nestedSection}>
        <div className={styles.nestedSectionHeader}>
          <div>
            <h4 className={styles.nestedSectionTitle}>
              Tipos de agarre compatibles ({payload.gripTypes.length} de 10)
            </h4>
            <p className={styles.fieldHelp}>Ej: Palm grip, Claw grip, Fingertip grip.</p>
          </div>
          <button
            ref={addGripButtonRef}
            type="button"
            className={styles.secondaryButton}
            disabled={payload.gripTypes.length >= 10}
            onClick={addGripType}
            aria-label="Agregar tipo de agarre"
            data-testid={`add-grip-${blockId}`}
          >
            <Plus size={16} aria-hidden="true" />
            Agregar agarre
          </button>
        </div>

        {getIssue("gripTypes") &&
          !payload.gripTypes.some((_, i) => getIssue(`gripTypes[${i}]`)) && (
            <p className={styles.fieldError} role="alert">
              {getIssue("gripTypes")}
            </p>
          )}

        <div className={styles.nestedList}>
          {payload.gripTypes.map((grip, index) => {
            const gripPos = index + 1;
            const gripError = getIssue(`gripTypes[${index}]`);

            return (
              <div
                key={grip.clientId}
                className={styles.nestedInlineRow}
                data-testid={`grip-row-${blockId}-${index}`}
              >
                <div className={styles.inlineFieldGrow}>
                  <label
                    htmlFor={`field-${blockId}-gripTypes-${index}`}
                    className={styles.accessibleCellLabel}
                  >
                    Tipo de agarre {gripPos}
                  </label>
                  <input
                    id={`field-${blockId}-gripTypes-${index}`}
                    type="text"
                    value={grip.value}
                    onChange={(e) => {
                      const next = [...payload.gripTypes];
                      next[index] = { ...grip, value: e.target.value };
                      onChange({ ...payload, gripTypes: next });
                    }}
                    maxLength={50}
                    className={styles.textInput}
                    placeholder={`Tipo de agarre ${gripPos}`}
                    aria-invalid={Boolean(gripError)}
                    aria-describedby={
                      gripError ? `field-${blockId}-gripTypes-${index}-error` : undefined
                    }
                  />
                  {gripError && (
                    <p
                      id={`field-${blockId}-gripTypes-${index}-error`}
                      className={styles.fieldError}
                      role="alert"
                    >
                      {gripError}
                    </p>
                  )}
                </div>

                <div className={styles.nestedCardActions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={index === 0}
                    onClick={() => moveGripType(index, -1)}
                    aria-label={`Mover tipo de agarre ${gripPos} hacia arriba`}
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={index === payload.gripTypes.length - 1}
                    onClick={() => moveGripType(index, 1)}
                    aria-label={`Mover tipo de agarre ${gripPos} hacia abajo`}
                  >
                    <ArrowDown size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.deleteAction}`}
                    onClick={() => removeGripType(index)}
                    aria-label={`Eliminar tipo de agarre ${gripPos}`}
                    data-testid={`remove-grip-${blockId}-${index}`}
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
