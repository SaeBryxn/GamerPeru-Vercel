"use client";

import Link from "@/components/app-link";
import React, { useId, useRef, useState } from "react";
import { Award, BookOpen, ChevronDown, ExternalLink, Gift, Truck, Zap } from "lucide-react";
import { StatusBadge } from "@/components/admin/ui";
import { PdpAccessories } from "@/components/product-detail/pdp-accessories";
import { PdpSizeGuide } from "@/components/product-detail/pdp-size-guide";
import { updateProductAction } from "@/lib/admin/catalog/actions";
import { MutationRequestTracker } from "@/lib/admin/catalog/mutation-request";
import {
  getStoryLifecycleText,
  type StoryLifecycleSummary,
} from "@/lib/admin/catalog/story-builder-model";
import type { AdminProductDetailVariant } from "@/lib/admin/catalog/types";
import type { AdminProductUiDetail } from "@/lib/admin/catalog/ui-dto";
import type { ProductPdpAccessory } from "@/lib/catalog/product-detail-types";
import {
  buildPdpEditorConfig,
  formatDimensions,
  productPdpConfigSchema,
  type ProductPdpConfig,
} from "@/lib/catalog/product-pdp-config";
import { ProductPdpFields } from "./product-pdp-fields";
import styles from "./product-page-step.module.css";
import { useEditorDirty } from "./editor-safety";

export interface ProductPageStepProps {
  product: Pick<AdminProductUiDetail["product"], "id" | "name" | "updatedAt">;
  /** The product's stored config as saved; it is normalized here. */
  pdpConfig: unknown;
  variants: AdminProductDetailVariant[];
  media: AdminProductUiDetail["media"];
  storySummary: StoryLifecycleSummary;
  onChanged: () => void;
  technicalFieldNames?: string[];
}

const BLOCKS = [
  ["story", "Historia"],
  ["variants", "Colores y miniaturas"],
  ["gift", "Regalo"],
  ["accessories", "Accesorios"],
  ["sizeGuide", "Guía de tallas"],
  ["dimensions", "Dimensiones"],
  ["specifications", "Especificaciones de la tienda"],
  ["packageContents", "Contenido de caja"],
  ["support", "Soporte"],
] as const;
type Block = (typeof BLOCKS)[number][0];
const ALWAYS_SHOWN: Block[] = ["story", "variants", "support"];
const hasSupport = (config: ProductPdpConfig) =>
  Object.values(config.support).some((value) => value.trim());

function editorConfig(
  pdpConfig: unknown,
  variants: AdminProductDetailVariant[],
  media: ProductPageStepProps["media"]
) {
  return withAvailablePhotos(buildPdpEditorConfig(pdpConfig, variants), media);
}

/** Photos can have been reassigned in step 3 since the presentation was last saved. */
function withAvailablePhotos(config: ProductPdpConfig, media: ProductPageStepProps["media"]) {
  for (const [variantId, presentation] of Object.entries(config.variants)) {
    if (
      presentation.mediaAssetId &&
      !media.some(
        (photo) =>
          photo.mediaAssetId === presentation.mediaAssetId &&
          photo.publicUrl &&
          photo.mimeType.startsWith("image/") &&
          (!photo.variantId || photo.variantId === variantId)
      )
    )
      presentation.mediaAssetId = null;
  }
  return config;
}

function visible(block: Block, config: ProductPdpConfig, story: StoryLifecycleSummary) {
  switch (block) {
    case "story":
      return story.lifecycle === "PUBLISHED_ONLY" || story.lifecycle === "DRAFT_OVER_PUBLISHED";
    case "variants":
      return true;
    case "gift":
      return config.gift.enabled;
    case "accessories":
      return config.accessories.enabled;
    case "sizeGuide":
      return config.sizeGuide.enabled;
    case "dimensions":
      return config.dimensionsEnabled;
    case "specifications":
      return config.specificationsEnabled;
    case "packageContents":
      return config.packageContents.enabled;
    case "support":
      return hasSupport(config);
  }
}

function blockSummary(
  block: Block,
  config: ProductPdpConfig,
  story: StoryLifecycleSummary,
  technicalFieldNames: string[] = []
) {
  const hasContent: Partial<Record<Block, boolean>> = {
    gift: Boolean(config.gift.title.trim()),
    accessories: config.accessories.variantIds.length > 0,
    sizeGuide: config.sizeGuide.sizes.some((size) => Boolean(size.name.trim())),
    dimensions:
      technicalFieldNames.some((name) =>
        /largo|ancho|alto|length|width|height|dimens|peso|weight/i.test(name)
      ) ||
      config.sizeGuide.sizes.some((size) =>
        Boolean(size.name.trim() && (formatDimensions(size) ?? size.weight.trim()))
      ),
    specifications:
      technicalFieldNames.length > 0 ||
      config.specifications.some((row) => Boolean(row.label.trim() && row.value.trim())),
    packageContents: config.packageContents.editions.some((edition) =>
      edition.items.some((item) => Boolean(item.name.trim()))
    ),
  };
  if (visible(block, config, story) && hasContent[block] === false) {
    return "Activado, pero vacío: no se verá en la tienda";
  }
  switch (block) {
    case "story":
      return getStoryLifecycleText(story);
    case "variants": {
      const count = Object.keys(config.variants).length;
      return count
        ? `${count} ${count === 1 ? "versión" : "versiones"} · nombre del color, talla y miniatura`
        : "Crea los colores o tallas en el paso 3.";
    }
    case "gift":
      return config.gift.title || "Aún no agregaste un regalo.";
    case "accessories":
      return config.accessories.variantIds.length
        ? `${config.accessories.variantIds.length} accesorios vinculados`
        : "Elige productos para acompañar esta compra.";
    case "sizeGuide":
      return config.sizeGuide.sizes.length
        ? `${config.sizeGuide.sizes.length} tallas para comparar y recomendar`
        : "Agrega tallas y rangos de mano.";
    case "dimensions":
      return config.sizeGuide.sizes.some((size) => formatDimensions(size) ?? size.weight)
        ? "Medidas y peso por talla"
        : "Completa las medidas o usa las de la ficha técnica.";
    case "specifications":
      return `${config.specifications.length} datos adicionales · conserva la ficha técnica`;
    case "packageContents":
      return config.packageContents.editions.length
        ? `${config.packageContents.editions.length} ediciones · ${config.packageContents.editions.reduce((sum, edition) => sum + edition.items.length, 0)} elementos`
        : "Cuenta qué recibe el cliente en la caja.";
    case "support":
      return hasSupport(config)
        ? `${Object.values(config.support).filter(Boolean).length} datos de garantía, enlaces y envío`
        : "Agrega garantía, manual, software o envío.";
  }
}

function safeLink(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function BlockPreview({
  block,
  config,
  accessories,
  story,
}: {
  block: Block;
  config: ProductPdpConfig;
  accessories: ProductPdpAccessory[];
  story: StoryLifecycleSummary;
}) {
  const sizes = config.sizeGuide.sizes.filter((size) => size.name.trim());
  switch (block) {
    case "story":
      return (
        <div className={styles.storyPreview}>
          <BookOpen size={28} aria-hidden="true" />
          <strong>{getStoryLifecycleText(story)}</strong>
          <p>El contenido completo se revisa en el editor de historia.</p>
        </div>
      );
    case "variants": {
      const rows = Object.values(config.variants).filter(
        (variant) => variant.color || variant.size
      );
      return rows.length ? (
        <ul className={styles.swatches}>
          {rows.map((variant, index) => (
            <li key={index}>{[variant.color, variant.size].filter(Boolean).join(" · ")}</li>
          ))}
        </ul>
      ) : (
        <p>Escribe el color o la talla de cada versión para ver los selectores.</p>
      );
    }
    case "gift":
      return config.gift.title.trim() ? (
        <div className={styles.gift}>
          <small>{config.gift.label}</small>
          <div>
            <Gift size={20} aria-hidden="true" />
            <div>
              <strong>{config.gift.title}</strong>
              <p>{config.gift.description}</p>
            </div>
          </div>
        </div>
      ) : (
        <p>Escribe el título del regalo para ver el banner.</p>
      );
    case "accessories": {
      const selected = accessories.filter((item) =>
        config.accessories.variantIds.includes(item.id)
      );
      return selected.length ? (
        <>
          <PdpAccessories accessories={selected} disabled />
          {selected.length < config.accessories.variantIds.length && (
            <p>Algunos accesorios ya no están disponibles.</p>
          )}
        </>
      ) : (
        <p>Busca y vincula un accesorio para verlo aquí.</p>
      );
    }
    case "sizeGuide":
      return sizes.length ? (
        <PdpSizeGuide sizes={sizes} />
      ) : (
        <p>Agrega una talla con su nombre y rango de mano.</p>
      );
    case "dimensions": {
      const rows = sizes.filter((size) => formatDimensions(size) ?? size.weight);
      return rows.length ? (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Talla</th>
                <th scope="col">Largo × ancho × alto</th>
                <th scope="col">Peso</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((size, index) => (
                <tr key={index}>
                  <th scope="row">{size.name}</th>
                  <td>
                    {formatDimensions(size) ?? "—"}
                    <small>{formatDimensions(size, true)}</small>
                  </td>
                  <td>{size.weight || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>
          Agrega medidas por talla. En la tienda también se usan las dimensiones de la ficha técnica
          cuando corresponda.
        </p>
      );
    }
    case "specifications":
      return (
        <>
          {config.specifications.some((row) => row.label && row.value) ? (
            <table className={styles.table}>
              <tbody>
                {config.specifications
                  .filter((row) => row.label && row.value)
                  .map((row, index) => (
                    <tr key={index}>
                      <th scope="row">{row.label}</th>
                      <td>
                        {row.value}
                        {row.note && <small>{row.note}</small>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <p>
              Los datos de la ficha técnica se mostrarán aquí. Puedes añadir información y notas.
            </p>
          )}
          {config.rating.enabled &&
            config.rating.average !== null &&
            config.rating.count !== null &&
            config.rating.count > 0 && (
              <p aria-label="Calificación del producto">
                ★ {config.rating.average.toFixed(1)} · {config.rating.count} reseñas
              </p>
            )}
        </>
      );
    case "packageContents":
      return config.packageContents.editions.some((edition) =>
        edition.items.some((item) => item.name)
      ) ? (
        <div className={styles.editions}>
          {config.packageContents.editions.map((edition, index) => (
            <div key={index}>
              {edition.name && (
                <strong className={styles.editionName} data-tone={edition.badge}>
                  {edition.name}
                </strong>
              )}
              <ul>
                {edition.items
                  .filter((item) => item.name)
                  .map((item, itemIndex) => (
                    <li key={itemIndex}>
                      <span>
                        {item.name}
                        {item.note && <small>{item.note}</small>}
                      </span>
                      <strong>× {item.quantity.replace(/^[x×]\s*/i, "") || "1"}</strong>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p>Agrega una edición y sus elementos para ver el contenido.</p>
      );
    case "support":
      return hasSupport(config) ? (
        <ul className={styles.support}>
          {config.support.warranty && (
            <li>
              <Award size={18} aria-hidden="true" />
              <span>{config.support.warranty}</span>
            </li>
          )}
          {config.support.manualUrl && (
            <li>
              <BookOpen size={18} aria-hidden="true" />
              <a
                href={safeLink(config.support.manualUrl)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Manual de usuario
              </a>
            </li>
          )}
          {config.support.driverUrl && (
            <li>
              <Zap size={18} aria-hidden="true" />
              <a
                href={safeLink(config.support.driverUrl)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Web-hub / Software Driver
              </a>
            </li>
          )}
          {config.support.shippingNote && (
            <li>
              <Truck size={18} aria-hidden="true" />
              <span>{config.support.shippingNote}</span>
            </li>
          )}
        </ul>
      ) : (
        <p>Completa un texto o enlace para mostrar el soporte.</p>
      );
  }
}

export function ProductPageStep({
  product,
  pdpConfig,
  variants,
  media,
  storySummary,
  onChanged,
  technicalFieldNames = [],
}: ProductPageStepProps) {
  const id = useId();
  const version = new Date(product.updatedAt).toISOString();
  const sourceKey = `${product.id}:${version}:${JSON.stringify([
    pdpConfig,
    variants.map((variant) => [variant.id, variant.updatedAt, variant.attributes]),
    media.map((photo) => [photo.id, photo.mediaAssetId, photo.variantId, photo.publicUrl]),
  ])}`;
  const [source, setSource] = useState(sourceKey);
  const [config, setConfig] = useState(() => editorConfig(pdpConfig, variants, media));
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(version);
  const [active, setActive] = useState<Block | null>("story");
  const [accessories, setAccessories] = useState<ProductPdpAccessory[]>([]);
  const [dirty, setDirty] = useState(false);
  useEditorDirty("pdp", dirty);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [saved, setSaved] = useState(false);
  const tracker = useRef(new MutationRequestTracker());
  const saving = useRef(false);

  // Accept refreshed props only while clean; a refresh must never erase an unfinished edit.
  if (source !== sourceKey && !pending && (!dirty || source.split(":")[0] !== product.id)) {
    setSource(sourceKey);
    setConfig(editorConfig(pdpConfig, variants, media));
    setExpectedUpdatedAt(version);
    setDirty(false);
    setSaved(false);
    setError(null);
    setStale(false);
  }

  const change = (next: ProductPdpConfig) => {
    setConfig(next);
    setDirty(true);
    setSaved(false);
    setError(null);
  };
  const toggle = (block: Block, checked: boolean) => {
    switch (block) {
      case "story":
      case "variants":
        return;
      case "gift":
        change({ ...config, gift: { ...config.gift, enabled: checked } });
        break;
      case "accessories":
        change({ ...config, accessories: { ...config.accessories, enabled: checked } });
        break;
      case "sizeGuide":
        change({ ...config, sizeGuide: { ...config.sizeGuide, enabled: checked } });
        break;
      case "dimensions":
        change({ ...config, dimensionsEnabled: checked });
        break;
      case "specifications":
        change({ ...config, specificationsEnabled: checked });
        break;
      case "packageContents":
        change({ ...config, packageContents: { ...config.packageContents, enabled: checked } });
        break;
      case "support":
        // There is no persisted support visibility flag in the existing schema.
        return;
    }
    if (checked) setActive(block);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving.current || !dirty) return;
    setError(null);
    setStale(false);
    const validated = productPdpConfigSchema.safeParse(config);
    if (!validated.success) {
      const issue = validated.error.issues[0];
      const section = issue?.path[0];
      if (BLOCKS.some(([key]) => key === section)) setActive(section as Block);
      setError(issue?.message ?? "Revisa los datos de la página del producto.");
      return;
    }
    saving.current = true;
    setPending(true);
    const payload = {
      productId: product.id,
      expectedUpdatedAt,
      pdpConfig: withAvailablePhotos(validated.data, media),
    };
    try {
      const result = await updateProductAction({
        ...payload,
        mutationRequestId: tracker.current.getRequestId(payload),
      });
      tracker.current.complete();
      if (!result.success || !result.data) {
        setStale(result.code === "STALE_WRITE_CONFLICT");
        setError(result.error ?? "No se pudo actualizar el producto.");
        return;
      }
      setExpectedUpdatedAt(new Date(result.data.product.updatedAt).toISOString());
      setConfig(editorConfig(result.data.product.pdpConfig, variants, media));
      setDirty(false);
      setSaved(true);
      onChanged();
    } catch {
      setError("Error de conexión al enviar la solicitud. Puedes reintentar.");
    } finally {
      saving.current = false;
      setPending(false);
    }
  };
  const activeTitle = BLOCKS.find(([block]) => block === active)?.[1];

  return (
    <form
      className={styles.root}
      onSubmit={save}
      aria-label="Página del producto"
      aria-busy={pending}
    >
      <p className={styles.hint}>
        Abre un bloque para editarlo y ver cómo quedará. Los campos vacíos se ocultan en la tienda.
      </p>
      <div className={styles.layout}>
        <div className={styles.blocks}>
          {BLOCKS.map(([block, title]) => {
            const isOpen = active === block;
            const isVisible = visible(block, config, storySummary);
            return (
              <section
                className={styles.block}
                key={block}
                aria-labelledby={`${id}-${block}-title`}
                data-open={isOpen}
              >
                <div className={styles.blockHead}>
                  <button
                    type="button"
                    className={styles.openButton}
                    disabled={pending}
                    onClick={() => setActive(isOpen ? null : block)}
                    aria-expanded={isOpen}
                    aria-controls={`${id}-${block}-content`}
                  >
                    <span>
                      <strong id={`${id}-${block}-title`}>{title}</strong>
                      <span className={styles.summary}>
                        {blockSummary(block, config, storySummary, technicalFieldNames)}
                      </span>
                    </span>
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={`Mostrar en la tienda: ${title}`}
                      checked={isVisible}
                      disabled={pending || ALWAYS_SHOWN.includes(block)}
                      onChange={(event) => toggle(block, event.target.checked)}
                    />
                    <span>Mostrar en la tienda</span>
                  </label>
                </div>
                <div id={`${id}-${block}-content`} hidden={!isOpen}>
                  {isOpen && (
                    <fieldset disabled={pending} className={styles.editor}>
                      <legend className={styles.srOnly}>{title}</legend>
                      {block === "story" ? (
                        <>
                          <StatusBadge tone={isVisible ? "success" : "neutral"}>
                            {getStoryLifecycleText(storySummary)}
                          </StatusBadge>
                          <p className={styles.hint}>
                            La historia se muestra cuando la publicas desde su editor. El enlace se
                            abre en otra pestaña.
                          </p>
                          <div className={styles.storyActions}>
                            <Link
                              href={`/admin/products/${product.id}/story`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Editar historia
                              <ExternalLink size={14} aria-hidden="true" />
                            </Link>
                            <button type="button" onClick={onChanged}>
                              Actualizar estado
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <ProductPdpFields
                            value={config}
                            onChange={change}
                            productId={product.id}
                            variants={variants}
                            media={media}
                            section={block}
                            onAccessoryOptions={
                              block === "accessories" ? setAccessories : undefined
                            }
                          />
                          {block === "specifications" && (
                            <details className={styles.secondary}>
                              <summary>Calificación y reseñas</summary>
                              <ProductPdpFields value={config} onChange={change} section="rating" />
                            </details>
                          )}
                          {block === "support" && (
                            <p className={styles.hint}>
                              El soporte se muestra al completar al menos un dato. Cada texto o
                              enlace vacío se oculta automáticamente.
                            </p>
                          )}
                        </>
                      )}
                    </fieldset>
                  )}
                </div>
              </section>
            );
          })}
        </div>
        <aside
          className={styles.preview}
          aria-label="Vista previa del bloque"
          data-admin-theme="light"
        >
          <div className={styles.previewHead}>
            <span>Vista previa</span>
            <small>{product.name}</small>
          </div>
          {active && <h3>{activeTitle}</h3>}
          {!active ? (
            <p>Abre un bloque para ver su contenido.</p>
          ) : visible(active, config, storySummary) || ALWAYS_SHOWN.includes(active) ? (
            <BlockPreview
              key={active}
              block={active}
              config={config}
              accessories={accessories}
              story={storySummary}
            />
          ) : (
            <p>Este bloque está oculto. Activa «Mostrar en la tienda» para ver su contenido.</p>
          )}
        </aside>
      </div>
      <footer className={styles.footer}>
        <span role="status" className={styles.hint}>
          {pending
            ? "Guardando…"
            : dirty
              ? "Tienes cambios sin guardar."
              : saved
                ? "Página del producto guardada."
                : "Sin cambios pendientes."}
        </span>
        <button type="submit" disabled={pending || !dirty} className={styles.save}>
          {pending ? "Guardando…" : "Guardar página del producto"}
        </button>
      </footer>
      {error && (
        <div role="alert" className={styles.error}>
          <p>{error}</p>
          {stale && (
            <button
              type="button"
              onClick={() => {
                setDirty(false);
                setSource("");
                onChanged();
              }}
            >
              Descartar mis cambios y recargar datos
            </button>
          )}
        </div>
      )}
    </form>
  );
}
