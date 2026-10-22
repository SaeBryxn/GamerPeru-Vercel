"use client";

import Image from "next/image";
import React, { useEffect, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { searchPdpAccessoriesAction } from "@/lib/admin/catalog/pdp-actions";
import { formatCurrency } from "@/lib/utils/currency";
import type { ProductPdpConfig, PdpSize } from "@/lib/catalog/product-pdp-config";
import type { ProductPdpAccessory } from "@/lib/catalog/product-detail-types";
import styles from "./product-pdp-fields.module.css";

type Variant = { id: string; title: string; sku: string; attributes: Record<string, string> };
type Media = {
  mediaAssetId: string;
  variantId: string | null;
  publicUrl: string | null;
  mimeType: string;
};
interface Props {
  value: ProductPdpConfig;
  onChange: (value: ProductPdpConfig) => void;
  productId?: string;
  variants?: Variant[];
  media?: Media[];
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
  step,
}: {
  label: string;
  value: string | number | null;
  onChange: (value: string) => void;
  type?: string;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        min={min}
        max={max}
        step={step}
        maxLength={type === "url" ? 500 : 300}
      />
    </label>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.toggle}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
function Remove({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.remove} onClick={onClick} aria-label={label}>
      <Trash2 size={15} />
    </button>
  );
}
const numeric = (value: string) => (value === "" ? null : Number(value));
const blankSize = (): PdpSize => ({
  name: "",
  weight: "",
  lengthMm: null,
  widthMm: null,
  heightMm: null,
  handMin: null,
  handMax: null,
});

export function ProductPdpFields({ value, onChange, productId, variants = [], media = [] }: Props) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<ProductPdpAccessory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    void searchPdpAccessoriesAction({
      productId,
      search: "",
      selectedIds: value.accessories.variantIds,
    })
      .then((result) => {
        if (cancelled) return;
        setOptions(result.items);
        setError(result.error ?? "");
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo consultar el catálogo.");
      });
    return () => {
      cancelled = true;
    };
    // The initial lookup loads labels for persisted selections; later searches are explicit.
  }, [productId]);
  const updateSize = (index: number, patch: Partial<PdpSize>) =>
    onChange({
      ...value,
      sizeGuide: {
        ...value.sizeGuide,
        sizes: value.sizeGuide.sizes.map((size, row) =>
          row === index ? { ...size, ...patch } : size
        ),
      },
    });
  const searchOptions = async () => {
    if (!productId) return;
    setLoading(true);
    setError("");
    try {
      const result = await searchPdpAccessoriesAction({
        productId,
        search,
        selectedIds: value.accessories.variantIds,
      });
      setOptions((previous) => [
        ...previous.filter(
          (option) =>
            value.accessories.variantIds.includes(option.id) &&
            !result.items.some((item) => item.id === option.id)
        ),
        ...result.items,
      ]);
      setError(result.error ?? "");
    } catch {
      setError("No se pudo consultar el catálogo.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className={styles.root} aria-label="Configuración de la ficha de tienda">
      <header>
        <h3>Ficha de tienda</h3>
        <p>Activa los bloques que necesites. Los campos vacíos se ocultan automáticamente.</p>
      </header>
      <details className={styles.section} open>
        <summary>Precios y reseñas</summary>
        <p>
          El precio y el precio anterior se editan en Variantes. Publica únicamente calificaciones
          respaldadas por reseñas reales.
        </p>
        <Toggle
          label="Mostrar calificación y reseñas"
          checked={value.rating.enabled}
          onChange={(enabled) => onChange({ ...value, rating: { ...value.rating, enabled } })}
        />
        <div className={styles.grid}>
          <Field
            label="Promedio (0 a 5)"
            type="number"
            min={0}
            max={5}
            step="0.1"
            value={value.rating.average}
            onChange={(input) =>
              onChange({ ...value, rating: { ...value.rating, average: numeric(input) } })
            }
          />
          <Field
            label="Cantidad de reseñas"
            type="number"
            min={0}
            max={1000000}
            step="1"
            value={value.rating.count}
            onChange={(input) =>
              onChange({ ...value, rating: { ...value.rating, count: numeric(input) } })
            }
          />
        </div>
      </details>
      <details className={styles.section}>
        <summary>Regalo con tu compra</summary>
        <Toggle
          label="Activar banner de regalo por compra"
          checked={value.gift.enabled}
          onChange={(enabled) => onChange({ ...value, gift: { ...value.gift, enabled } })}
        />
        <div className={styles.grid}>
          <Field
            label="Etiqueta superior"
            value={value.gift.label}
            onChange={(label) => onChange({ ...value, gift: { ...value.gift, label } })}
          />
          <Field
            label="Título del regalo"
            value={value.gift.title}
            onChange={(title) => onChange({ ...value, gift: { ...value.gift, title } })}
          />
        </div>
        <Field
          label="Descripción corta"
          value={value.gift.description}
          onChange={(description) => onChange({ ...value, gift: { ...value.gift, description } })}
        />
      </details>
      <details className={styles.section}>
        <summary>Colores, tallas y miniaturas</summary>
        <p>
          Elige una imagen de la galería de este producto. Puedes cargarla en Imágenes. Las
          combinaciones sin atributos completos conservan el selector por nombre de variante.
        </p>
        {!variants.length && (
          <p>Guarda el producto y crea sus variantes para asociarles una miniatura.</p>
        )}
        {variants.map((variant) => {
          const current = value.variants[variant.id] ?? {
            color: String(variant.attributes.colorway ?? variant.attributes.color ?? ""),
            size: String(variant.attributes.size ?? variant.attributes.talla ?? ""),
            mediaAssetId: null,
          };
          const update = (patch: Partial<typeof current>) =>
            onChange({
              ...value,
              variants: { ...value.variants, [variant.id]: { ...current, ...patch } },
            });
          return (
            <fieldset className={styles.row} key={variant.id}>
              <legend>
                {variant.title} · {variant.sku}
              </legend>
              <div className={styles.grid}>
                <Field
                  label="Color"
                  value={current.color}
                  onChange={(color) => update({ color })}
                />
                <Field
                  label="Talla (Mini, Med, Max o personalizada)"
                  value={current.size}
                  onChange={(size) => update({ size })}
                />
                <label className={styles.field}>
                  <span>Miniatura</span>
                  <select
                    value={current.mediaAssetId ?? ""}
                    onChange={(event) => update({ mediaAssetId: event.target.value || null })}
                  >
                    <option value="">Usar imagen de variante automáticamente</option>
                    {media
                      .filter(
                        (image) =>
                          image.publicUrl &&
                          image.mimeType.startsWith("image/") &&
                          (!image.variantId || image.variantId === variant.id)
                      )
                      .map((image, index) => (
                        <option key={image.mediaAssetId} value={image.mediaAssetId}>
                          Imagen {index + 1}
                          {image.variantId ? " · De esta variante" : " · General"}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              {current.mediaAssetId &&
                media.find((image) => image.mediaAssetId === current.mediaAssetId)?.publicUrl && (
                  <Image
                    unoptimized
                    className={styles.preview}
                    src={
                      media.find((image) => image.mediaAssetId === current.mediaAssetId)!.publicUrl!
                    }
                    alt={`Miniatura de ${variant.title}`}
                    width={64}
                    height={64}
                    loading="lazy"
                  />
                )}
            </fieldset>
          );
        })}
      </details>
      <details className={styles.section}>
        <summary>Más accesorios</summary>
        <Toggle
          label="Mostrar sección Más Accesorios"
          checked={value.accessories.enabled}
          onChange={(enabled) =>
            onChange({ ...value, accessories: { ...value.accessories, enabled } })
          }
        />
        <p>
          Vincula hasta 12 variantes publicadas del catálogo. Se añadirán como líneas independientes
          con su precio vigente. Para crear un accesorio nuevo, usa Nuevo producto y luego vincúlalo
          aquí.
        </p>
        {productId ? (
          <>
            <div className={styles.search}>
              <label className={styles.field}>
                <span>Buscar por producto o SKU</span>
                <input
                  value={search}
                  maxLength={100}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchOptions();
                    }
                  }}
                />
              </label>
              <button type="button" onClick={() => void searchOptions()} disabled={loading}>
                <Search size={16} />
                {loading ? "Buscando…" : "Buscar"}
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
            <div className={styles.options}>
              {options.map((option) => {
                const checked = value.accessories.variantIds.includes(option.id);
                return (
                  <label key={option.id} className={styles.option}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && value.accessories.variantIds.length >= 12}
                      onChange={() =>
                        onChange({
                          ...value,
                          accessories: {
                            ...value.accessories,
                            variantIds: checked
                              ? value.accessories.variantIds.filter((id) => id !== option.id)
                              : [...value.accessories.variantIds, option.id],
                          },
                        })
                      }
                    />
                    {option.imageUrl && (
                      <Image
                        unoptimized
                        src={option.imageUrl}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                      />
                    )}
                    <span>{option.name}</span>
                    <strong>{formatCurrency(option.priceCents)}</strong>
                  </label>
                );
              })}
              {!options.length && <p>No hay resultados. Busca un producto publicado.</p>}
            </div>
            {value.accessories.variantIds
              .filter((id) => !options.some((item) => item.id === id))
              .map((id) => (
                <div className={styles.option} key={id}>
                  <span>Variante no disponible ({id.slice(-8)})</span>
                  <Remove
                    label="Desvincular accesorio no disponible"
                    onClick={() =>
                      onChange({
                        ...value,
                        accessories: {
                          ...value.accessories,
                          variantIds: value.accessories.variantIds.filter((item) => item !== id),
                        },
                      })
                    }
                  />
                </div>
              ))}
          </>
        ) : (
          <p>Guarda el producto para buscar y vincular accesorios.</p>
        )}
      </details>
      <details className={styles.section}>
        <summary>Guía de tallas y dimensiones</summary>
        <Toggle
          label="Mostrar calculador de talla"
          checked={value.sizeGuide.enabled}
          onChange={(enabled) => onChange({ ...value, sizeGuide: { ...value.sizeGuide, enabled } })}
        />
        <Toggle
          label="Mostrar acordeón Dimensiones"
          checked={value.dimensionsEnabled}
          onChange={(dimensionsEnabled) => onChange({ ...value, dimensionsEnabled })}
        />
        <p>
          Rangos de mano: mínimo incluido y máximo excluido. Deja un extremo vacío para un rango
          abierto. Sin rango, la talla solo se muestra para comparar.
        </p>
        {value.sizeGuide.sizes.map((size, index) => (
          <fieldset key={index} className={styles.row}>
            <legend>Talla {index + 1}</legend>
            <div className={styles.rowHeader}>
              <Field
                label="Nombre"
                value={size.name}
                onChange={(name) => updateSize(index, { name })}
              />
              <Remove
                label={`Eliminar talla ${index + 1}`}
                onClick={() =>
                  onChange({
                    ...value,
                    sizeGuide: {
                      ...value.sizeGuide,
                      sizes: value.sizeGuide.sizes.filter((_, row) => row !== index),
                    },
                  })
                }
              />
            </div>
            <div className={styles.grid}>
              <Field
                label="Peso (ej. 45 ± 2 g)"
                value={size.weight}
                onChange={(weight) => updateSize(index, { weight })}
              />
              {(
                [
                  ["lengthMm", "Largo (mm)"],
                  ["widthMm", "Ancho (mm)"],
                  ["heightMm", "Alto (mm)"],
                  ["handMin", "Mano mínima (cm)"],
                  ["handMax", "Mano máxima (cm)"],
                ] as const
              ).map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  type="number"
                  min={key.startsWith("hand") ? 15 : 0.1}
                  max={key.startsWith("hand") ? 22 : 3000}
                  step="0.1"
                  value={size[key]}
                  onChange={(input) => updateSize(index, { [key]: numeric(input) })}
                />
              ))}
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={value.sizeGuide.sizes.length >= 6}
          onClick={() =>
            onChange({
              ...value,
              sizeGuide: { ...value.sizeGuide, sizes: [...value.sizeGuide.sizes, blankSize()] },
            })
          }
        >
          <Plus size={15} />
          Añadir talla
        </button>
      </details>
      <details className={styles.section}>
        <summary>Especificaciones y destacados</summary>
        <Toggle
          label="Mostrar grilla de especificaciones rápidas"
          checked={value.highlightsEnabled}
          onChange={(highlightsEnabled) => onChange({ ...value, highlightsEnabled })}
        />
        <Toggle
          label="Mostrar acordeón Especificaciones"
          checked={value.specificationsEnabled}
          onChange={(specificationsEnabled) => onChange({ ...value, specificationsEnabled })}
        />
        <p>
          Se usa la ficha técnica actual. Estas filas opcionales permiten añadir atributos con una
          nota debajo del valor.
        </p>
        {value.specifications.map((spec, index) => (
          <div className={styles.row} key={index}>
            <div className={styles.grid}>
              {(["label", "value", "note"] as const).map((key) => (
                <Field
                  key={key}
                  label={{ label: "Atributo", value: "Valor", note: "Nota opcional" }[key]}
                  value={spec[key]}
                  onChange={(input) =>
                    onChange({
                      ...value,
                      specifications: value.specifications.map((row, i) =>
                        i === index ? { ...row, [key]: input } : row
                      ),
                    })
                  }
                />
              ))}
            </div>
            <Remove
              label={`Eliminar especificación ${index + 1}`}
              onClick={() =>
                onChange({
                  ...value,
                  specifications: value.specifications.filter((_, row) => row !== index),
                })
              }
            />
          </div>
        ))}
        <button
          type="button"
          disabled={value.specifications.length >= 60}
          onClick={() =>
            onChange({
              ...value,
              specifications: [...value.specifications, { label: "", value: "", note: "" }],
            })
          }
        >
          <Plus size={15} />
          Añadir especificación
        </button>
      </details>
      <details className={styles.section}>
        <summary>Contenido de la caja</summary>
        <Toggle
          label="Mostrar acordeón Contenido de la caja"
          checked={value.packageContents.enabled}
          onChange={(enabled) =>
            onChange({ ...value, packageContents: { ...value.packageContents, enabled } })
          }
        />
        {value.packageContents.editions.map((edition, editionIndex) => {
          const update = (patch: Partial<typeof edition>) =>
            onChange({
              ...value,
              packageContents: {
                ...value.packageContents,
                editions: value.packageContents.editions.map((row, index) =>
                  index === editionIndex ? { ...row, ...patch } : row
                ),
              },
            });
          return (
            <fieldset className={styles.row} key={editionIndex}>
              <legend>Edición {editionIndex + 1}</legend>
              <div className={styles.rowHeader}>
                <Field
                  label="Nombre de la edición"
                  value={edition.name}
                  onChange={(name) => update({ name })}
                />
                <Remove
                  label={`Eliminar edición ${editionIndex + 1}`}
                  onClick={() =>
                    onChange({
                      ...value,
                      packageContents: {
                        ...value.packageContents,
                        editions: value.packageContents.editions.filter(
                          (_, index) => index !== editionIndex
                        ),
                      },
                    })
                  }
                />
              </div>
              <label className={styles.field}>
                <span>Color de la etiqueta</span>
                <select
                  value={edition.badge}
                  onChange={(event) =>
                    update({ badge: event.target.value as typeof edition.badge })
                  }
                >
                  <option value="neutral">Neutro</option>
                  <option value="gold">Dorado</option>
                  <option value="blue">Azul</option>
                </select>
              </label>
              {edition.items.map((item, itemIndex) => (
                <div className={styles.itemRow} key={itemIndex}>
                  {(["name", "note", "quantity"] as const).map((key) => (
                    <Field
                      key={key}
                      label={
                        {
                          name: "Nombre del ítem",
                          note: "Nota opcional",
                          quantity: "Cantidad (ej. 1 o 20)",
                        }[key]
                      }
                      value={item[key]}
                      onChange={(input) =>
                        update({
                          items: edition.items.map((row, i) =>
                            i === itemIndex ? { ...row, [key]: input } : row
                          ),
                        })
                      }
                    />
                  ))}
                  <Remove
                    label={`Eliminar ítem ${itemIndex + 1}`}
                    onClick={() =>
                      update({ items: edition.items.filter((_, index) => index !== itemIndex) })
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                disabled={edition.items.length >= 30}
                onClick={() =>
                  update({ items: [...edition.items, { name: "", note: "", quantity: "1" }] })
                }
              >
                <Plus size={15} />
                Añadir ítem
              </button>
            </fieldset>
          );
        })}
        <button
          type="button"
          disabled={value.packageContents.editions.length >= 2}
          onClick={() =>
            onChange({
              ...value,
              packageContents: {
                ...value.packageContents,
                editions: [
                  ...value.packageContents.editions,
                  { name: "", badge: "neutral", items: [] },
                ],
              },
            })
          }
        >
          <Plus size={15} />
          Añadir edición
        </button>
      </details>
      <details className={styles.section}>
        <summary>Garantía, soporte y envío</summary>
        <div className={styles.grid}>
          {(["warranty", "manualUrl", "driverUrl", "shippingNote"] as const).map((key) => (
            <Field
              key={key}
              label={
                {
                  warranty: "Texto de garantía",
                  manualUrl: "URL del manual",
                  driverUrl: "URL del web-hub / driver",
                  shippingNote: "Nota de envío",
                }[key]
              }
              type={key.endsWith("Url") ? "url" : "text"}
              value={value.support[key]}
              onChange={(input) =>
                onChange({ ...value, support: { ...value.support, [key]: input } })
              }
            />
          ))}
        </div>
      </details>
    </section>
  );
}
