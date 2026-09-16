"use client";

import React, { useRef } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { EditorTechnicalSpecsPayload } from "@/lib/admin/catalog/story-builder-model";
import type { StoryValidationIssue } from "@/lib/admin/catalog/story-validation";
import { EditorField } from "./editor-field";
import styles from "../story-builder.module.css";

interface TechnicalSpecsEditorProps {
  blockId: string;
  payload: EditorTechnicalSpecsPayload;
  issues?: readonly StoryValidationIssue[];
  onChange: (payload: EditorTechnicalSpecsPayload) => void;
  onAnnounce?: (msg: string) => void;
}

export function TechnicalSpecsEditor({
  blockId,
  payload,
  issues = [],
  onChange,
  onAnnounce = () => {},
}: TechnicalSpecsEditorProps) {
  const addGroupButtonRef = useRef<HTMLButtonElement | null>(null);

  const getIssue = (fieldPath: string) => issues.find((i) => i.path.includes(fieldPath))?.message;

  function addGroup() {
    if (payload.groups.length >= 10) return;
    const newGroupId = crypto.randomUUID();
    const newSpecId = crypto.randomUUID();
    const nextGroups = [
      ...payload.groups,
      {
        clientId: newGroupId,
        groupName: "",
        specs: [{ clientId: newSpecId, label: "", value: "" }],
      },
    ];
    onChange({ ...payload, groups: nextGroups });
    onAnnounce(`Grupo de especificaciones ${nextGroups.length} agregado.`);
    setTimeout(() => {
      const el = document.getElementById(`field-${blockId}-groups-${nextGroups.length - 1}-name`);
      el?.focus();
    }, 10);
  }

  function removeGroup(groupIndex: number) {
    const rawName = payload.groups[groupIndex]?.groupName?.trim();
    const groupName = rawName && rawName.length > 0 ? rawName : `Grupo ${groupIndex + 1}`;
    const nextGroups = payload.groups.filter((_, i) => i !== groupIndex);
    onChange({ ...payload, groups: nextGroups });
    onAnnounce(`Grupo ${groupName} eliminado. Quedan ${nextGroups.length} grupos.`);
    setTimeout(() => {
      const nextFocusIndex = Math.min(groupIndex, nextGroups.length - 1);
      if (nextFocusIndex >= 0) {
        const el = document.getElementById(`field-${blockId}-groups-${nextFocusIndex}-name`);
        el?.focus();
      } else {
        addGroupButtonRef.current?.focus();
      }
    }, 10);
  }

  function moveGroup(groupIndex: number, direction: -1 | 1) {
    const destination = groupIndex + direction;
    if (destination < 0 || destination >= payload.groups.length) return;
    const nextGroups = [...payload.groups];
    const current = nextGroups[groupIndex]!;
    const adjacent = nextGroups[destination]!;
    nextGroups[groupIndex] = adjacent;
    nextGroups[destination] = current;
    onChange({ ...payload, groups: nextGroups });
    onAnnounce(`Grupo movido a la posición ${destination + 1}.`);
  }

  function addSpec(groupIndex: number) {
    const group = payload.groups[groupIndex];
    if (!group || group.specs.length >= 20) return;
    const newSpecId = crypto.randomUUID();
    const nextSpecs = [...group.specs, { clientId: newSpecId, label: "", value: "" }];
    const nextGroups = [...payload.groups];
    nextGroups[groupIndex] = { ...group, specs: nextSpecs };
    onChange({ ...payload, groups: nextGroups });
    const gName = group.groupName || `Grupo ${groupIndex + 1}`;
    onAnnounce(`Especificación agregada al grupo ${gName}.`);
  }

  function removeSpec(groupIndex: number, specIndex: number) {
    const group = payload.groups[groupIndex];
    if (!group) return;
    const nextSpecs = group.specs.filter((_, i) => i !== specIndex);
    const nextGroups = [...payload.groups];
    nextGroups[groupIndex] = { ...group, specs: nextSpecs };
    onChange({ ...payload, groups: nextGroups });
    const gName = group.groupName || `Grupo ${groupIndex + 1}`;
    onAnnounce(`Especificación eliminada de ${gName}.`);
  }

  function moveSpec(groupIndex: number, specIndex: number, direction: -1 | 1) {
    const group = payload.groups[groupIndex];
    if (!group) return;
    const destination = specIndex + direction;
    if (destination < 0 || destination >= group.specs.length) return;
    const nextSpecs = [...group.specs];
    const current = nextSpecs[specIndex]!;
    const adjacent = nextSpecs[destination]!;
    nextSpecs[specIndex] = adjacent;
    nextSpecs[destination] = current;
    const nextGroups = [...payload.groups];
    nextGroups[groupIndex] = { ...group, specs: nextSpecs };
    onChange({ ...payload, groups: nextGroups });
    onAnnounce(`Especificación movida en el grupo.`);
  }

  return (
    <div className={styles.editorFieldsStack} data-testid={`editor-technical-specs-${blockId}`}>
      <EditorField
        fieldId={`field-${blockId}-title`}
        label="Título del bloque (opcional)"
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
            placeholder="Ej: Ficha técnica completa"
          />
        )}
      </EditorField>

      <div className={styles.nestedSection}>
        <div className={styles.nestedSectionHeader}>
          <div>
            <h4 className={styles.nestedSectionTitle}>
              Grupos de especificaciones ({payload.groups.length} de 10)
            </h4>
            <p className={styles.fieldHelp}>
              Entre 1 y 10 grupos temáticos (ej: Sensor, Conectividad, Batería).
            </p>
          </div>
          <button
            ref={addGroupButtonRef}
            type="button"
            className={styles.secondaryButton}
            disabled={payload.groups.length >= 10}
            onClick={addGroup}
            aria-label="Agregar grupo de especificaciones"
            data-testid={`add-spec-group-${blockId}`}
          >
            <Plus size={16} aria-hidden="true" />
            Agregar grupo
          </button>
        </div>

        {getIssue(".groups") && !payload.groups.some((_, g) => getIssue(`groups[${g}]`)) && (
          <p className={styles.fieldError} role="alert">
            {getIssue(".groups")}
          </p>
        )}

        <div className={styles.nestedList}>
          {payload.groups.map((group, groupIndex) => {
            const groupPos = groupIndex + 1;
            const groupNameLabel = group.groupName || `Grupo ${groupPos}`;
            const groupNameError = getIssue(`groups[${groupIndex}].groupName`);
            const groupSpecsError =
              getIssue(`groups[${groupIndex}].specs`) &&
              !group.specs.some((_, s) => getIssue(`groups[${groupIndex}].specs[${s}]`));

            return (
              <div
                key={group.clientId}
                className={styles.nestedGroupCard}
                data-testid={`spec-group-${blockId}-${groupIndex}`}
              >
                <div className={styles.nestedGroupHeader}>
                  <div className={styles.inlineFieldGrow}>
                    <label
                      htmlFor={`field-${blockId}-groups-${groupIndex}-name`}
                      className={styles.fieldLabel}
                    >
                      Nombre del grupo {groupPos} *
                    </label>
                    <input
                      id={`field-${blockId}-groups-${groupIndex}-name`}
                      type="text"
                      value={group.groupName}
                      onChange={(e) => {
                        const nextGroups = [...payload.groups];
                        nextGroups[groupIndex] = { ...group, groupName: e.target.value };
                        onChange({ ...payload, groups: nextGroups });
                      }}
                      maxLength={100}
                      className={styles.textInput}
                      placeholder="Ej: Sensor y Óptica"
                      aria-invalid={Boolean(groupNameError)}
                      aria-describedby={
                        groupNameError
                          ? `field-${blockId}-groups-${groupIndex}-name-error`
                          : undefined
                      }
                    />
                    {groupNameError && (
                      <p
                        id={`field-${blockId}-groups-${groupIndex}-name-error`}
                        className={styles.fieldError}
                        role="alert"
                      >
                        {groupNameError}
                      </p>
                    )}
                  </div>

                  <div className={styles.nestedCardActions}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      disabled={groupIndex === 0}
                      onClick={() => moveGroup(groupIndex, -1)}
                      aria-label={`Mover grupo ${groupNameLabel} hacia arriba`}
                    >
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      disabled={groupIndex === payload.groups.length - 1}
                      onClick={() => moveGroup(groupIndex, 1)}
                      aria-label={`Mover grupo ${groupNameLabel} hacia abajo`}
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.deleteAction}`}
                      onClick={() => removeGroup(groupIndex)}
                      aria-label={`Eliminar grupo ${groupNameLabel}`}
                      data-testid={`remove-spec-group-${blockId}-${groupIndex}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className={styles.subNestedSection}>
                  <div className={styles.subNestedHeader}>
                    <h5 className={styles.subNestedTitle}>
                      Especificaciones ({group.specs.length} de 20)
                    </h5>
                    <button
                      type="button"
                      className={styles.smallButton}
                      disabled={group.specs.length >= 20}
                      onClick={() => addSpec(groupIndex)}
                      aria-label={`Agregar especificación al grupo ${groupNameLabel}`}
                      data-testid={`add-spec-to-group-${blockId}-${groupIndex}`}
                    >
                      <Plus size={14} aria-hidden="true" />
                      Agregar especificación
                    </button>
                  </div>

                  {groupSpecsError && (
                    <p className={styles.fieldError} role="alert">
                      {getIssue(`groups[${groupIndex}].specs`)}
                    </p>
                  )}

                  <div className={styles.subNestedList}>
                    {group.specs.map((spec, specIndex) => {
                      const specPos = specIndex + 1;
                      const labelError = getIssue(
                        `groups[${groupIndex}].specs[${specIndex}].label`
                      );
                      const valueError = getIssue(
                        `groups[${groupIndex}].specs[${specIndex}].value`
                      );

                      return (
                        <div
                          key={spec.clientId}
                          className={styles.subNestedRow}
                          data-testid={`spec-item-${blockId}-${groupIndex}-${specIndex}`}
                        >
                          <div className={styles.subNestedInputsGrid}>
                            <div>
                              <label
                                htmlFor={`field-${blockId}-groups-${groupIndex}-specs-${specIndex}-label`}
                                className={styles.accessibleCellLabel}
                              >
                                Etiqueta de especificación {specPos} ({groupNameLabel})
                              </label>
                              <input
                                id={`field-${blockId}-groups-${groupIndex}-specs-${specIndex}-label`}
                                type="text"
                                value={spec.label}
                                onChange={(e) => {
                                  const nextSpecs = [...group.specs];
                                  nextSpecs[specIndex] = { ...spec, label: e.target.value };
                                  const nextGroups = [...payload.groups];
                                  nextGroups[groupIndex] = { ...group, specs: nextSpecs };
                                  onChange({ ...payload, groups: nextGroups });
                                }}
                                maxLength={100}
                                className={styles.textInput}
                                placeholder="Etiqueta (ej: DPI máximo) *"
                                aria-invalid={Boolean(labelError)}
                                aria-describedby={
                                  labelError
                                    ? `field-${blockId}-groups-${groupIndex}-specs-${specIndex}-label-error`
                                    : undefined
                                }
                              />
                              {labelError && (
                                <p
                                  id={`field-${blockId}-groups-${groupIndex}-specs-${specIndex}-label-error`}
                                  className={styles.fieldError}
                                  role="alert"
                                >
                                  {labelError}
                                </p>
                              )}
                            </div>

                            <div>
                              <label
                                htmlFor={`field-${blockId}-groups-${groupIndex}-specs-${specIndex}-value`}
                                className={styles.accessibleCellLabel}
                              >
                                Valor de especificación {specPos} ({groupNameLabel})
                              </label>
                              <input
                                id={`field-${blockId}-groups-${groupIndex}-specs-${specIndex}-value`}
                                type="text"
                                value={spec.value}
                                onChange={(e) => {
                                  const nextSpecs = [...group.specs];
                                  nextSpecs[specIndex] = { ...spec, value: e.target.value };
                                  const nextGroups = [...payload.groups];
                                  nextGroups[groupIndex] = { ...group, specs: nextSpecs };
                                  onChange({ ...payload, groups: nextGroups });
                                }}
                                maxLength={200}
                                className={styles.textInput}
                                placeholder="Valor (ej: 26,000 DPI) *"
                                aria-invalid={Boolean(valueError)}
                                aria-describedby={
                                  valueError
                                    ? `field-${blockId}-groups-${groupIndex}-specs-${specIndex}-value-error`
                                    : undefined
                                }
                              />
                              {valueError && (
                                <p
                                  id={`field-${blockId}-groups-${groupIndex}-specs-${specIndex}-value-error`}
                                  className={styles.fieldError}
                                  role="alert"
                                >
                                  {valueError}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className={styles.nestedCardActions}>
                            <button
                              type="button"
                              className={styles.iconButton}
                              disabled={specIndex === 0}
                              onClick={() => moveSpec(groupIndex, specIndex, -1)}
                              aria-label={`Mover especificación ${specPos} hacia arriba en ${groupNameLabel}`}
                            >
                              <ArrowUp size={14} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className={styles.iconButton}
                              disabled={specIndex === group.specs.length - 1}
                              onClick={() => moveSpec(groupIndex, specIndex, 1)}
                              aria-label={`Mover especificación ${specPos} hacia abajo en ${groupNameLabel}`}
                            >
                              <ArrowDown size={14} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className={`${styles.iconButton} ${styles.deleteAction}`}
                              onClick={() => removeSpec(groupIndex, specIndex)}
                              aria-label={`Eliminar especificación ${specPos} de ${groupNameLabel}`}
                              data-testid={`remove-spec-item-${blockId}-${groupIndex}-${specIndex}`}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
