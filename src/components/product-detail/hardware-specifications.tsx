import React from "react";
import type { ProductSpecificationDetail } from "@/lib/catalog/product-detail-types";
import type { ValidatedSpecificationField } from "@/lib/discovery-filters/types";
import styles from "./hardware-specifications.module.css";

export interface HardwareSpecificationsProps {
  specifications: ProductSpecificationDetail;
}

export interface FormattedSpecRow {
  key: string;
  label: string;
  formattedValue: string;
}

/**
 * Validates and formats a single specification field value based on canonical lowercase dataType.
 *
 * Returns null if the value is malformed, invalid, or omitted.
 */
export function formatSpecFieldValue(
  field: ValidatedSpecificationField,
  rawValue: unknown
): string | null {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }

  switch (field.dataType) {
    case "number": {
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        return null;
      }
      return field.unit ? `${rawValue} ${field.unit}` : `${rawValue}`;
    }

    case "boolean": {
      if (typeof rawValue !== "boolean") {
        return null;
      }
      return rawValue ? "Sí" : "No";
    }

    case "string": {
      if (typeof rawValue !== "string") {
        return null;
      }
      const trimmed = rawValue.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    case "enum": {
      if (typeof rawValue !== "string") {
        return null;
      }
      const strVal = rawValue.trim();
      if (!strVal) {
        return null;
      }

      // If schema defines options, validate and resolve canonical label
      if (field.options && field.options.length > 0) {
        const matched = field.options.find((opt) => opt.value === strVal);
        if (!matched) {
          // Structurally inconsistent enum value -> omit safely
          return null;
        }
        return matched.label;
      }

      return strVal;
    }

    default:
      return null;
  }
}

/**
 * Builds the displayable spec rows: schema fields in displayOrder, formatted,
 * dropping malformed values and keys the schema does not define. Shared by the
 * specifications table and the PDP highlights grid.
 */
export function buildSpecRows(specifications: ProductSpecificationDetail): FormattedSpecRow[] {
  const { schema, specValues } = specifications;

  if (!schema || !schema.fieldDefinitions || !specValues) {
    return [];
  }

  const sortedFields = [...schema.fieldDefinitions].sort((a, b) => a.displayOrder - b.displayOrder);

  const rows: FormattedSpecRow[] = [];
  for (const field of sortedFields) {
    const formatted = formatSpecFieldValue(field, specValues[field.key]);
    if (formatted !== null) {
      rows.push({ key: field.key, label: field.label, formattedValue: formatted });
    }
  }
  return rows;
}

/**
 * Server Component: HardwareSpecifications
 *
 * Renders technical hardware attributes validated against the category schema.
 * Rejects arbitrary unknown specValues keys not represented in schema.fieldDefinitions.
 */
export function HardwareSpecifications({
  specifications,
}: HardwareSpecificationsProps): React.JSX.Element {
  const validRows = buildSpecRows(specifications);

  if (validRows.length === 0) {
    return <></>;
  }

  return (
    <section
      className={styles.specsSection}
      aria-labelledby="specs-heading"
      data-testid="hardware-specifications"
    >
      <h2 id="specs-heading" className={styles.sectionTitle}>
        Especificaciones Técnicas
      </h2>

      <table className={styles.specsTable}>
        <tbody>
          {validRows.map((row) => (
            <tr key={row.key} className={styles.specRow} data-testid={`spec-row-${row.key}`}>
              <th scope="row" className={styles.specLabel}>
                {row.label}
              </th>
              <td className={styles.specValue} data-testid={`spec-value-${row.key}`}>
                {row.formattedValue}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
