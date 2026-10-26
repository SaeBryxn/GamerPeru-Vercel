"use client";

import React, { useId, useState } from "react";
import type { ProductSelection as Selection } from "@/lib/catalog/curated-products";
import styles from "./product-selection.module.css";

export interface ProductOption {
  slug: string;
  name: string;
  categorySlug: string;
}

export function ProductSelection({
  value,
  onChange,
  products,
  categorySlug,
  limit = 24,
  disabled = false,
}: {
  value?: Selection;
  onChange: (next: Selection) => void;
  products: readonly ProductOption[];
  categorySlug?: string;
  limit?: number;
  disabled?: boolean;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const selection = value ?? { mode: "automatic", productSlugs: [] };
  const scoped = products.filter(
    (product) => !categorySlug || product.categorySlug === categorySlug
  );
  const names = new Map(products.map((product) => [product.slug, product.name]));
  const move = (index: number, direction: number) => {
    const next = [...selection.productSlugs];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange({ ...selection, productSlugs: next });
  };
  return (
    <fieldset className={styles.root} disabled={disabled}>
      <legend>Productos destacados y su orden</legend>
      <label className={styles.field} htmlFor={`${id}-mode`}>
        Selección de productos
      </label>
      <select
        id={`${id}-mode`}
        value={selection.mode}
        onChange={(event) =>
          onChange({ ...selection, mode: event.target.value as Selection["mode"] })
        }
      >
        <option value="automatic">Automática desde el catálogo</option>
        <option value="manual">Elegir productos y ordenar</option>
      </select>
      {selection.mode === "manual" && (
        <>
          <p>
            Solo se mostrarán los productos elegidos, en este orden. Los que dejen de estar
            publicados se ocultarán.
          </p>
          <ol className={styles.list}>
            {selection.productSlugs.map((slug, index) => (
              <li key={slug}>
                <span>{names.get(slug) ?? `${slug} (no disponible)`}</span>
                <button
                  type="button"
                  aria-label={`Subir ${names.get(slug) ?? slug}`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Bajar ${names.get(slug) ?? slug}`}
                  disabled={index === selection.productSlugs.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Quitar ${names.get(slug) ?? slug}`}
                  onClick={() =>
                    onChange({
                      ...selection,
                      productSlugs: selection.productSlugs.filter((item) => item !== slug),
                    })
                  }
                >
                  Quitar
                </button>
              </li>
            ))}
          </ol>
          {selection.productSlugs.length === 0 && (
            <p>
              No hay productos elegidos. La selección manual vacía oculta los productos de esta
              sección.
            </p>
          )}
          <label className={styles.field} htmlFor={`${id}-search`}>
            Buscar producto
          </label>
          <input
            id={`${id}-search`}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre del producto"
          />
          <label className={styles.field} htmlFor={`${id}-add`}>
            Agregar producto ({selection.productSlugs.length}/{limit})
          </label>
          <select
            id={`${id}-add`}
            value=""
            disabled={selection.productSlugs.length >= limit}
            onChange={(event) => {
              if (event.target.value)
                onChange({
                  ...selection,
                  productSlugs: [...selection.productSlugs, event.target.value],
                });
            }}
          >
            <option value="">Elige un producto</option>
            {scoped
              .filter(
                (product) =>
                  !selection.productSlugs.includes(product.slug) &&
                  product.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es"))
              )
              .map((product) => (
                <option key={product.slug} value={product.slug}>
                  {product.name}
                </option>
              ))}
          </select>
        </>
      )}
    </fieldset>
  );
}
