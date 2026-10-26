import React from "react";
import { formatDimensions, type ProductPdpConfig } from "@/lib/catalog/product-pdp-config";
import type { FormattedSpecRow } from "./hardware-specifications";
import { PdpAccordion, type PdpAccordionItem } from "./pdp-accordion";
import { PdpSizeGuide } from "./pdp-size-guide";
import styles from "./pdp-technical-details.module.css";

export function PdpTechnicalDetails({
  config,
  specRows: allSpecRows,
  highlightedKeys = [],
  previewContents = [],
}: {
  config: ProductPdpConfig;
  specRows: FormattedSpecRow[];
  /** Spec keys already shown in the highlights box above; listing them again only repeats them. */
  highlightedKeys?: string[];
  previewContents?: string[];
}) {
  const specRows = allSpecRows.filter((row) => !highlightedKeys.includes(row.key));
  const sizes = config.sizeGuide.sizes.filter((size) => size.name);
  const dimensionalSizes = sizes.filter(
    (size) => formatDimensions(size) !== null || size.weight !== ""
  );
  const dimensionRows = specRows.filter((row) =>
    /largo|ancho|alto|length|width|height|dimens|peso|weight/i.test(`${row.key} ${row.label}`)
  );
  const items: PdpAccordionItem[] = [];
  if (config.sizeGuide.enabled && sizes.length)
    items.push({
      id: "guia-tallas",
      title: "Guía de tallas",
      content: <PdpSizeGuide sizes={sizes} />,
    });
  if (config.dimensionsEnabled && (dimensionalSizes.length || dimensionRows.length))
    items.push({
      id: "dimensiones",
      title: "Dimensiones",
      content: dimensionalSizes.length ? (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Tamaño</th>
                <th scope="col">Dimensiones · L × A × H</th>
                <th scope="col">Peso</th>
              </tr>
            </thead>
            <tbody>
              {dimensionalSizes.map((size, index) => (
                <tr key={index}>
                  <th scope="row">{size.name}</th>
                  <td>
                    <strong>{formatDimensions(size) ?? "—"}</strong>
                    {formatDimensions(size, true) && <small>{formatDimensions(size, true)}</small>}
                  </td>
                  <td>{size.weight || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <table className={styles.table}>
          <tbody>
            {dimensionRows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                <td>{row.formattedValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    });
  const extraSpecs = config.specifications.filter((row) => row.label && row.value);
  if (config.specificationsEnabled && (specRows.length || extraSpecs.length))
    items.push({
      id: "especificaciones",
      title: "Especificaciones",
      content: (
        <table className={styles.table}>
          <tbody>
            {specRows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                <td>{row.formattedValue}</td>
              </tr>
            ))}
            {extraSpecs.map((row, index) => (
              <tr key={`extra-${index}`}>
                <th scope="row">{row.label}</th>
                <td>
                  {row.value}
                  {row.note && <small>{row.note}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    });
  const editions = config.packageContents.editions
    .map((edition) => ({ ...edition, items: edition.items.filter((item) => item.name) }))
    .filter((edition) => edition.items.length);
  if (config.packageContents.enabled && editions.length)
    items.push({
      id: "contenido",
      title: "Contenido de la caja",
      content: (
        <div className={styles.editions}>
          {editions.map((edition, index) => (
            <section key={index}>
              {edition.name && (
                <h4 className={styles.editionBadge} data-tone={edition.badge}>
                  {edition.name}
                </h4>
              )}
              <ul className={styles.packageList}>
                {edition.items.map((item, row) => (
                  <li key={row}>
                    <span>
                      {item.name}
                      {item.note && <small>{item.note}</small>}
                    </span>
                    <strong>× {item.quantity.replace(/^[x×]\s*/i, "") || "1"}</strong>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ),
    });
  else if (previewContents.length && !config.packageContents.editions.length)
    items.push({
      id: "contenido",
      title: "Contenido de la caja",
      content: (
        <ul>
          {previewContents.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ),
    });
  return items.length ? <PdpAccordion items={items} /> : null;
}
