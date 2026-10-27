/* eslint-disable @next/next/no-img-element -- Preview uses the same public assets as the admin gallery. */
"use client";

import { ImagePlus, Pencil, Settings2, Star } from "lucide-react";
import type { AdminProductUiDetail } from "@/lib/admin/catalog/ui-dto";
import type { ProductEditorSection } from "@/lib/admin/catalog/readiness-guidance";
import { parseProductPdpConfig } from "@/lib/catalog/product-pdp-config";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "./product-editor-preview.module.css";

interface Props {
  detail: AdminProductUiDetail;
  name: string;
  subtitle: string;
  description: string;
  brand: string;
  category: string;
  specValues: Record<string, unknown>;
  onEdit: (section: ProductEditorSection) => void;
  editingSection?: ProductEditorSection | null;
}

export function ProductEditorPreview({
  detail,
  name,
  subtitle,
  description,
  brand,
  category,
  specValues,
  onEdit,
  editingSection = null,
}: Props) {
  const sectionControl = (section: ProductEditorSection) =>
    editingSection ? {} : { "data-testid": `section-nav-${section}`, "aria-expanded": false };
  const photos = detail.media.filter(
    (photo) => photo.publicUrl && photo.mimeType.startsWith("image/")
  );
  const hero =
    photos.find((photo) => photo.mediaAssetId === detail.product.primaryMediaId) ?? photos[0];
  const config = parseProductPdpConfig(detail.product.pdpConfig);
  const technical = Object.entries(specValues)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({
      label:
        detail.currentSpecSchema?.fieldDefinitions.find((field) => field.key === key)?.label ?? key,
      value: Array.isArray(value) ? value.join(" · ") : String(value),
    }));
  const specs = technical.length ? technical : config.specifications;
  const variants = detail.variants.filter((variant) => variant.status === "ACTIVE");
  const prices = variants.map((variant) => variant.priceCents);
  const reviewsVisible = config.contentSections.includes("reviews");
  return (
    <section
      className={styles.workspace}
      aria-label="Vista previa editable del producto"
      data-testid="product-editor-preview"
    >
      <div className={styles.caption}>
        <span>Vista de la ficha</span>
        <span>Selecciona lo que quieres cambiar</span>
      </div>
      <div className={styles.page}>
        <div className={styles.breadcrumb}>
          {category || "Categoría"}
          <span>/</span>
          {name || "Nombre del producto"}
        </div>
        <div className={styles.hero}>
          <div>
            <button
              type="button"
              className={styles.photo}
              onClick={() => onEdit("imagenes")}
              aria-label="Editar fotos del producto"
              {...sectionControl("imagenes")}
            >
              {hero?.publicUrl ? (
                <img src={hero.publicUrl} alt={hero.altText?.trim() ? hero.altText : name} />
              ) : (
                <ImagePlus size={56} aria-hidden="true" />
              )}
              <span className={styles.edit}>
                <Pencil size={14} aria-hidden="true" />
                Editar fotos
              </span>
            </button>
            <div className={styles.thumbnails}>
              {photos.slice(0, 5).map((photo) => (
                <button
                  type="button"
                  key={photo.id}
                  onClick={() => onEdit("imagenes")}
                  aria-label={`Editar foto ${photo.displayOrder + 1}`}
                >
                  <img src={photo.publicUrl!} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
          <div className={styles.summary}>
            <button
              type="button"
              className={styles.copy}
              onClick={() => onEdit("informacion")}
              aria-label="Editar nombre y descripción"
              {...sectionControl("informacion")}
            >
              <span className={styles.brand}>{brand || "Marca"}</span>
              <h2>{name || "Nombre del producto"}</h2>
              {subtitle && <strong>{subtitle}</strong>}
              <p>{description || "Añade una descripción para presentar este producto."}</p>
              <span className={styles.edit}>
                <Pencil size={14} aria-hidden="true" />
                Editar información
              </span>
            </button>
            <button
              type="button"
              className={styles.versions}
              onClick={() => onEdit("variantes")}
              aria-label="Editar versiones y precios"
              {...sectionControl("variantes")}
            >
              <div className={styles.row}>
                <strong>Versiones y precios</strong>
                <Pencil size={15} aria-hidden="true" />
              </div>
              {prices.length ? (
                <span className={styles.price}>
                  {Math.min(...prices) !== Math.max(...prices) ? "Desde " : ""}
                  {formatCurrency(Math.min(...prices))}
                </span>
              ) : (
                <p>Agrega la primera versión.</p>
              )}
              <div className={styles.chips}>
                {detail.variants.slice(0, 4).map((variant) => (
                  <span key={variant.id}>{variant.title}</span>
                ))}
              </div>
              <small>{detail.variants.length} versiones · fotos, colores, precio y oferta</small>
            </button>
            <div className={styles.purchase}>Área de compra del cliente</div>
          </div>
        </div>
        <button
          type="button"
          className={styles.technical}
          onClick={() => onEdit("especificaciones")}
          aria-label="Editar ficha técnica"
          {...sectionControl("especificaciones")}
        >
          <div className={styles.row}>
            <h3>Ficha técnica</h3>
            <Pencil size={16} aria-hidden="true" />
          </div>
          {specs.length ? (
            <dl>
              {specs.slice(0, 8).map((spec, index) => (
                <div key={`${spec.label}-${index}`}>
                  <dt>{spec.label}</dt>
                  <dd>{spec.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>Completa las características técnicas de este modelo.</p>
          )}
          <small>Datos de la categoría y especificaciones del producto</small>
        </button>
        <button
          type="button"
          className={styles.content}
          onClick={() => onEdit("historia")}
          aria-label="Editar contenido y visibilidad de la página"
          {...sectionControl("historia")}
        >
          <div className={styles.row}>
            <h3>Contenido de la página</h3>
            <Settings2 size={18} aria-hidden="true" />
          </div>
          <div className={styles.sectionList}>
            {config.contentSections.map((section) => (
              <span key={section}>
                {section === "story"
                  ? "Historia y especificaciones de la familia"
                  : "Opiniones de compradores"}
              </span>
            ))}
            {!config.contentSections.length && <span>No hay secciones adicionales visibles.</span>}
          </div>
          <div className={styles.row}>
            <span>
              <Star size={15} aria-hidden="true" /> Opiniones{" "}
              {reviewsVisible ? "visibles" : "ocultas"}
            </span>
            <span>
              Editar bloques y orden <Pencil size={14} aria-hidden="true" />
            </span>
          </div>
        </button>
      </div>
    </section>
  );
}
