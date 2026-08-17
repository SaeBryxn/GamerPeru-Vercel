import Image from "next/image";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Icon } from "@/components/ui";
import type { HomeCategoryItem } from "../types";
import styles from "./category-showcase.module.css";

interface CategoryCardProps {
  category: HomeCategoryItem;
  isWide?: boolean;
}

/**
 * CategoryCard — Server Component for an individual Category Visual Door
 *
 * Media-First Layout:
 * - Media stage occupies majority of tile area (~70-80%).
 * - Clean title, subtitle and action near edge.
 * - Supports real image rendering or token-driven ambient stage.
 */
export function CategoryCard({ category, isWide = false }: CategoryCardProps) {
  const { media } = category;
  const themeClass =
    category.theme === "dark"
      ? styles.themeDark
      : category.theme === "neutral"
        ? styles.themeNeutral
        : styles.themeLight;

  return (
    <Link
      href={category.href}
      className={`${styles.categoryCard} ${isWide ? styles.categoryCardWide : ""} ${themeClass}`}
      aria-label={`${category.title} — ${category.subtitle}`}
    >
      <div className={styles.cardContent}>
        <h3 className={styles.cardTitle}>{category.title}</h3>
        <p className={styles.cardSubtitle}>{category.subtitle}</p>
        <span className={styles.cardAction} aria-hidden="true">
          Ver categoría
          <Icon icon={ArrowRight} size="sm" />
        </span>
      </div>

      <div className={styles.cardVisualStage} aria-hidden="true">
        {media.kind === "image" ? (
          <Image
            src={media.src}
            alt={media.altText}
            fill
            sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 33vw"
            className={styles.cardImage}
          />
        ) : (
          <div className={styles.ambientCircle} />
        )}
      </div>
    </Link>
  );
}
