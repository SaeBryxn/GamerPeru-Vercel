"use client";

import React, { useState } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import type { ProductOption } from "@/components/admin/product-selection";
import { menuProductLabel, type MenuDisplay } from "@/lib/navigation/menu-display";
import styles from "./menu.module.css";

export function MenuDisplayFields({
  value,
  products,
  disabled,
  onChange,
}: {
  value: MenuDisplay;
  products: readonly ProductOption[];
  disabled: boolean;
  onChange: (value: MenuDisplay) => void;
}) {
  const [selected, setSelected] = useState(products[0]?.slug ?? "");
  const [search, setSearch] = useState("");
  const product = products.find((item) => item.slug === selected);
  const updateLabel = (label: string) => {
    if (!product) return;
    const productLabels = { ...value.productLabels };
    if (label.trim()) productLabels[product.slug] = label;
    else delete productLabels[product.slug];
    onChange({ ...value, productLabels });
  };
  return (
    <>
      <div className={styles.entryFields}>
        <label>
          Modelos por marca
          <input
            type="number"
            min={1}
            max={8}
            value={value.itemsPerBrand}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, itemsPerBrand: Number(event.target.value) })}
          />
        </label>
        <label>
          Modelos cuando hay una sola marca
          <input
            type="number"
            min={1}
            max={12}
            value={value.singleBrandItems}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...value, singleBrandItems: Number(event.target.value) })
            }
          />
        </label>
      </div>
      <p className={styles.hint}>
        Una sola marca se distribuye en dos columnas. «Ver todos» abre el catálogo filtrado por
        marca y categoría. Las dos primeras fotos disponibles forman las tarjetas destacadas.
      </p>
      <div className={styles.linkWorkspace}>
        <section className={styles.linkCanvas} aria-label="Nombres de productos en el menú">
          <div className={styles.canvasHeading}>
            <h3>Nombres en el menú</h3>
            <span>{products.length} productos</span>
          </div>
          <label className={styles.labelSearch}>
            Buscar producto
            <input
              type="search"
              value={search}
              disabled={disabled}
              placeholder="Nombre o marca…"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <ol className={styles.linkRows}>
            {products
              .filter((item) =>
                `${item.name} ${item.brandName ?? ""}`
                  .toLocaleLowerCase()
                  .includes(search.toLocaleLowerCase())
              )
              .map((item) => (
                <li key={item.slug} data-selected={item.slug === selected}>
                  <button
                    type="button"
                    className={styles.selectLink}
                    disabled={disabled}
                    onClick={() => setSelected(item.slug)}
                  >
                    <span className={styles.labelPhoto}>
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt="" width={40} height={40} />
                      ) : (
                        <ImageIcon size={20} />
                      )}
                    </span>
                    <span>
                      <strong>{menuProductLabel(item, value)}</strong>
                      <small>
                        {item.brandName} · {item.name}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
          </ol>
          {!products.length && (
            <p className={styles.blank}>
              Elige productos publicados para personalizar sus nombres.
            </p>
          )}
        </section>
        <aside className={styles.linkInspector} aria-label="Nombre corto del producto">
          {product ? (
            <fieldset disabled={disabled}>
              <legend>{product.name}</legend>
              <label>
                Nombre corto en el menú
                <input
                  maxLength={80}
                  value={value.productLabels[product.slug] ?? ""}
                  placeholder={menuProductLabel(product)}
                  onChange={(event) => updateLabel(event.target.value)}
                />
              </label>
              <p className={styles.hint}>
                Solo cambia el texto del menú y sus tarjetas. La ficha conserva el nombre completo.
                Déjalo vacío para usar el nombre del catálogo sin repetir la marca.
              </p>
              <strong>{menuProductLabel(product, value)}</strong>
            </fieldset>
          ) : (
            <p className={styles.blank}>Selecciona un producto para ajustar su nombre.</p>
          )}
        </aside>
      </div>
    </>
  );
}
