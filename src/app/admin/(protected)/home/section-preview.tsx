"use client";

/* eslint-disable @next/next/no-img-element -- Lightweight admin previews show uploaded assets without an image transformation request. */

import React from "react";
import { ImageIcon, Play, ArrowUpRight, ShieldCheck } from "lucide-react";
import type { HomeSectionType } from "@/db/schema";
import type { ProductOption } from "@/components/admin/product-selection";
import type { EditorMedia } from "./media-fields";
import styles from "./section-preview.module.css";

type Content = Record<string, unknown>;
const object = (value: unknown): Content =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Content) : {};
const text = (value: unknown): string =>
  typeof value === "string"
    ? value
    : Array.isArray(value)
      ? value.filter((v) => typeof v === "string").join(" ")
      : "";
const items = (value: unknown): Content[] => (Array.isArray(value) ? value.map(object) : []);

/** A lightweight composition preview, using the actual draft and uploaded assets. No public data fetches. */
export function SectionPreview({
  type,
  content,
  media,
  products = [],
}: {
  type: HomeSectionType;
  content: Content;
  media: Record<string, EditorMedia>;
  products?: readonly ProductOption[];
}) {
  const photo = (slot: unknown, label: string, className?: string, fallbackUrl?: string) => {
    const image = object(slot);
    const url = media[text(image.mediaAssetId)]?.url ?? fallbackUrl;
    return (
      <div className={`${styles.image} ${className ?? ""}`}>
        {url ? (
          <img src={url} alt={text(image.alt) || label} loading="lazy" />
        ) : (
          <span>
            <ImageIcon size={25} aria-hidden="true" />
            {label}
          </span>
        )}
      </div>
    );
  };
  const heading = (
    <div className={styles.heading}>
      {content.eyebrow ? <small>{text(content.eyebrow)}</small> : null}
      <h3>{text(content.title) || text(content.heading) || "Título de la sección"}</h3>
      {content.subtitle || content.description ? (
        <p>{text(content.subtitle) || text(content.description)}</p>
      ) : null}
    </div>
  );
  const cta = object(content.cta);

  if (type === "product_carousel" || type === "catalog_rail") {
    const selection = object(content.selection);
    const category = text(content.categorySlug) || text(object(content.source).categorySlug);
    const selected =
      selection.mode === "manual"
        ? (Array.isArray(selection.productSlugs) ? selection.productSlugs : []).flatMap(
            (slug) => products.find((p) => p.slug === slug) ?? []
          )
        : products.filter((p) => !category || p.categorySlug === category);
    const visible = selected.slice(0, Math.min(4, Number(content.maxItems) || 4));
    return (
      <div className={styles.preview} data-testid="home-content-preview">
        {heading}
        {visible.length ? (
          <div className={styles.products}>
            {visible.map((p) => (
              <div key={p.slug} className={styles.product}>
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.name} loading="lazy" />
                ) : (
                  <ImageIcon size={28} aria-hidden="true" />
                )}
                <small>{p.brandName}</small>
                <strong>{p.name}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>Elige los productos que aparecerán aquí.</p>
        )}
        {selection.mode !== "manual" && (
          <p className={styles.note}>Selección automática · muestra del catálogo disponible</p>
        )}
      </div>
    );
  }
  if (type === "brand_strip")
    return (
      <div className={styles.preview} data-testid="home-content-preview">
        {heading}
        <div className={styles.brands}>
          {items(content.items).map((brand, i) => (
            <div key={i}>
              {photo(brand.image, text(brand.name) || "Logo de marca")}
              <strong>{text(brand.name)}</strong>
              <small>
                {text(brand.href)} <ArrowUpRight size={12} aria-hidden="true" />
              </small>
            </div>
          ))}
        </div>
        {!items(content.items).length && (
          <p className={styles.empty}>Agrega una marca, su imagen y su destino.</p>
        )}
      </div>
    );
  if (type === "trust_strip")
    return (
      <div className={`${styles.preview} ${styles.trust}`} data-testid="home-content-preview">
        {items(content.items).map((item, i) => (
          <div key={i}>
            <ShieldCheck size={22} aria-hidden="true" />
            <strong>{text(item.title)}</strong>
            <p>{text(item.description)}</p>
          </div>
        ))}
      </div>
    );
  if (type === "compare_slider")
    return (
      <div className={styles.preview} data-testid="home-content-preview">
        {heading}
        <div className={styles.compare}>
          {[content.left, content.right].map((side, i) => {
            const item = object(side);
            return (
              <div key={i}>
                {photo(item.image, text(item.name))}
                <small>{text(item.kicker)}</small>
                <strong>{text(item.name)}</strong>
              </div>
            );
          })}
        </div>
      </div>
    );
  if (type === "bento_showcase")
    return (
      <div className={styles.preview} data-testid="home-content-preview">
        {heading}
        <div className={styles.bento}>
          {(Array.isArray(content.images) ? content.images : []).map((image, i) => (
            <React.Fragment key={i}>{photo(image, `Imagen ${i + 1}`)}</React.Fragment>
          ))}
        </div>
      </div>
    );
  if (type === "split_showcase")
    return (
      <div className={`${styles.preview} ${styles.split}`} data-testid="home-content-preview">
        <div>
          {heading}
          {items(content.features).map((f, i) => (
            <p key={i}>
              <strong>{text(f.title)}</strong>
              <br />
              {text(f.description)}
            </p>
          ))}
        </div>
        {photo(content.image, "Imagen del producto")}
      </div>
    );
  const isVideo = type === "video_hero" || type === "feature_video";
  const video = object(content.video);
  return (
    <div className={`${styles.preview} ${styles.banner}`} data-testid="home-content-preview">
      {photo(
        isVideo ? { mediaAssetId: video.posterAssetId } : content.background,
        isVideo ? "Portada del video" : "Imagen de fondo",
        styles.backdrop,
        video.kind === "youtube" && /^[A-Za-z0-9_-]{11}$/.test(text(video.videoId))
          ? `https://i.ytimg.com/vi/${text(video.videoId)}/hqdefault.jpg`
          : undefined
      )}
      <div className={styles.bannerContent}>
        {isVideo && <Play size={24} aria-hidden="true" />}
        {heading}
        {cta.label || content.ctaLabel ? (
          <span className={styles.cta}>
            {text(cta.label) || text(content.ctaLabel)}{" "}
            <ArrowUpRight size={14} aria-hidden="true" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
