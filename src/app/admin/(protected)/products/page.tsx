import React from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  PackageOpen,
  Check,
} from "lucide-react";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import {
  getAdminProductList,
  getPublishedBrands,
  getPublishedCategories,
} from "@/lib/admin/catalog/readers";
import { getProductIdsWithIssues } from "@/lib/admin/catalog/catalog-health";
import { formatCentsToPenDisplay } from "@/lib/admin/catalog/money";
import { getProductReadinessGaps, isReadyToPublish } from "@/lib/admin/catalog/list-readiness";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import type { AdminProductPendingFilter, CatalogStatus } from "@/lib/admin/catalog/types";
import styles from "./products.module.css";

export const dynamic = "force-dynamic";

interface AdminProductsPageProps {
  searchParams?: Promise<{
    search?: string;
    status?: string;
    pending?: string;
    brandId?: string;
    categoryId?: string;
    page?: string;
  }>;
}

const STATUS_LABEL: Record<CatalogStatus, string> = {
  PUBLISHED: "En la tienda",
  DRAFT: "Oculto",
  ARCHIVED: "Archivado",
};

export default async function AdminProductsPage({ searchParams }: AdminProductsPageProps) {
  const authContext = await getVerifiedAuthContext();

  if (authContext.status !== "READY" || !authContext.permissions.has("catalog:manage")) {
    return (
      <AdminForbidden email={authContext.status === "READY" ? authContext.email : undefined} />
    );
  }

  const resolvedParams = searchParams ? await searchParams : {};
  const search = resolvedParams.search?.trim() ? resolvedParams.search.trim() : undefined;
  const rawStatus = resolvedParams.status;
  const status: CatalogStatus | undefined =
    rawStatus === "DRAFT" || rawStatus === "PUBLISHED" || rawStatus === "ARCHIVED"
      ? rawStatus
      : undefined;
  const rawPending = resolvedParams.pending;
  const pending: AdminProductPendingFilter | undefined =
    rawPending === "media" ||
    rawPending === "stock" ||
    rawPending === "price" ||
    rawPending === "variants" ||
    rawPending === "issues"
      ? rawPending
      : undefined;
  const brandId = resolvedParams.brandId?.trim() ? resolvedParams.brandId.trim() : undefined;
  const categoryId = resolvedParams.categoryId?.trim()
    ? resolvedParams.categoryId.trim()
    : undefined;
  const page = Math.max(1, parseInt(resolvedParams.page ?? "1", 10) || 1);

  // "Con pendientes" runs the publish validator over the catalog (same rules as the dashboard),
  // so it is resolved here and handed to the list as a set of product ids.
  const issueProductIds = await getProductIdsWithIssues();

  const [listResult, brands, categories, allProducts] = await Promise.all([
    getAdminProductList(
      {
        search,
        status,
        pending: pending === "issues" ? undefined : pending,
        productIds: pending === "issues" ? issueProductIds : undefined,
        brandId,
        categoryId,
        page,
        pageSize: 20,
      },
      { authContext }
    ),
    getPublishedBrands({ authContext }),
    getPublishedCategories({ authContext }),
    // Unfiltered snapshot so the summary counters describe the whole catalog, not the current page.
    getAdminProductList({ page: 1, pageSize: 100 }, { authContext }),
  ]);

  const catalog = allProducts.items;
  const publishedCount = catalog.filter((i) => i.status === "PUBLISHED").length;
  const hiddenCount = catalog.filter((i) => i.status === "DRAFT").length;
  const missingPhotoCount = catalog.filter((i) => !i.primaryMediaKey).length;
  const outOfStockCount = catalog.filter((i) => i.activeVariantAts <= 0).length;

  const hasFiltersApplied =
    Boolean(search) ||
    Boolean(status) ||
    Boolean(pending) ||
    Boolean(brandId) ||
    Boolean(categoryId);

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { search, status, pending, brandId, categoryId, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `/admin/products?${qs}` : "/admin/products";
  }

  function buildPageUrl(targetPage: number) {
    return buildUrl({ page: String(targetPage) });
  }

  const quickFilters = [
    { label: "Todos", href: "/admin/products", active: !hasFiltersApplied },
    {
      label: "En la tienda",
      href: buildUrl({ status: "PUBLISHED", pending: undefined, page: undefined }),
      active: status === "PUBLISHED" && !pending,
      count: publishedCount,
    },
    {
      label: "Ocultos",
      href: buildUrl({ status: "DRAFT", pending: undefined, page: undefined }),
      active: status === "DRAFT" && !pending,
      count: hiddenCount,
    },
    {
      label: "Con pendientes",
      href: buildUrl({ pending: "issues", status: undefined, page: undefined }),
      active: pending === "issues",
      count: issueProductIds.length,
    },
    {
      label: "Sin foto",
      href: buildUrl({ pending: "media", status: undefined, page: undefined }),
      active: pending === "media",
      count: missingPhotoCount,
    },
    {
      label: "Sin stock",
      href: buildUrl({ pending: "stock", status: undefined, page: undefined }),
      active: pending === "stock",
      count: outOfStockCount,
    },
  ];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Productos</h1>
          <p className={styles.subtitle}>
            {catalog.length} producto{catalog.length === 1 ? "" : "s"} en total &middot;{" "}
            {publishedCount} visible{publishedCount === 1 ? "" : "s"} en la tienda &middot;{" "}
            {hiddenCount} oculto{hiddenCount === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className={styles.primaryButton}
          data-testid="btn-new-product"
        >
          <Plus size={16} aria-hidden="true" />
          <span>Nuevo producto</span>
        </Link>
      </header>

      <nav className={styles.chipRow} aria-label="Filtros rápidos">
        {quickFilters.map((filter) => (
          <Link
            key={filter.label}
            href={filter.href}
            className={`${styles.chip} ${filter.active ? styles.chipActive : ""}`}
            aria-current={filter.active ? "true" : undefined}
            data-testid={`quick-filter-${filter.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <span>{filter.label}</span>
            {filter.count !== undefined && <span className={styles.chipCount}>{filter.count}</span>}
          </Link>
        ))}
      </nav>

      <section className={styles.filterCard} aria-label="Búsqueda avanzada">
        <form method="GET" action="/admin/products" className={styles.filterForm}>
          {pending && <input type="hidden" name="pending" value={pending} />}

          <div className={styles.filterField} style={{ flex: 2, minWidth: 200 }}>
            <input
              type="search"
              name="search"
              defaultValue={search ?? ""}
              placeholder="Buscar por nombre..."
              className={styles.filterInput}
              data-testid="filter-search"
              aria-label="Buscar productos"
            />
          </div>

          <div className={styles.filterField}>
            <select
              name="status"
              defaultValue={status ?? ""}
              className={styles.filterSelect}
              data-testid="filter-status"
              aria-label="Filtrar por estado"
            >
              <option value="">Cualquier estado</option>
              <option value="PUBLISHED">En la tienda</option>
              <option value="DRAFT">Ocultos</option>
              <option value="ARCHIVED">Archivados</option>
            </select>
          </div>

          <div className={styles.filterField}>
            <select
              name="brandId"
              defaultValue={brandId ?? ""}
              className={styles.filterSelect}
              data-testid="filter-brand"
              aria-label="Filtrar por marca"
            >
              <option value="">Todas las marcas</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterField}>
            <select
              name="categoryId"
              defaultValue={categoryId ?? ""}
              className={styles.filterSelect}
              data-testid="filter-category"
              aria-label="Filtrar por categoría"
            >
              <option value="">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterActions}>
            <button type="submit" className={styles.submitButton} data-testid="filter-submit">
              <Search size={14} aria-hidden="true" />
              <span>Buscar</span>
            </button>
            {hasFiltersApplied && (
              <Link
                href="/admin/products"
                className={styles.clearButton}
                data-testid="filter-clear"
              >
                Limpiar
              </Link>
            )}
          </div>
        </form>
      </section>

      {listResult.items.length > 0 ? (
        <div className={styles.tableContainer}>
          <table className={styles.table} data-testid="product-table">
            <thead>
              <tr>
                <th style={{ width: 64 }}>Foto</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Estado</th>
                <th>Qué falta</th>
                <th style={{ textAlign: "right" }}>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {listResult.items.map((item) => {
                let priceDisplay = "Sin precio";
                if (item.minActivePriceCents !== null) {
                  const minFormatted =
                    formatCentsToPenDisplay(item.minActivePriceCents) ?? "Sin precio";
                  if (item.minActivePriceCents === item.maxActivePriceCents) {
                    priceDisplay = minFormatted;
                  } else {
                    const maxFormatted = formatCentsToPenDisplay(item.maxActivePriceCents) ?? "";
                    priceDisplay = `${minFormatted} - ${maxFormatted}`;
                  }
                }

                const thumbnailUrl = item.primaryMediaKey
                  ? resolvePublicMediaUrl(item.primaryMediaKey)
                  : null;
                const gaps = getProductReadinessGaps(item);
                const ready = isReadyToPublish(item);

                return (
                  <tr key={item.id} data-testid={`product-row-${item.id}`}>
                    <td>
                      <div className={styles.mediaThumb}>
                        {thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbnailUrl}
                            alt={item.primaryMediaAlt ?? ""}
                            width={48}
                            height={48}
                            loading="lazy"
                            data-testid={`product-thumb-${item.id}`}
                          />
                        ) : (
                          <ImageIcon size={18} aria-hidden="true" />
                        )}
                      </div>
                    </td>
                    <td>
                      <div className={styles.productMeta}>
                        <Link
                          href={`/admin/products/${item.id}`}
                          className={styles.productName}
                          data-testid={`product-title-${item.id}`}
                        >
                          {item.name}
                        </Link>
                        <span className={styles.productSlug}>{item.brandName}</span>
                      </div>
                    </td>
                    <td>
                      <span className={styles.categoryLabel}>{item.categoryName}</span>
                    </td>
                    <td className={styles.priceCell} data-testid={`product-price-${item.id}`}>
                      {priceDisplay}
                    </td>
                    <td className={styles.atsCell} data-testid={`product-ats-${item.id}`}>
                      <span className={item.activeVariantAts <= 0 ? styles.stockEmpty : undefined}>
                        {item.activeVariantAts <= 0 ? "Agotado" : `${item.activeVariantAts} u.`}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          item.status === "PUBLISHED"
                            ? styles.badgePublished
                            : item.status === "ARCHIVED"
                              ? styles.badgeArchived
                              : styles.badgeDraft
                        }`}
                        data-testid={`product-status-${item.id}`}
                      >
                        {STATUS_LABEL[item.status]}
                      </span>
                    </td>
                    <td>
                      {gaps.length === 0 ? (
                        <span className={styles.readyChip} data-testid={`product-ready-${item.id}`}>
                          <Check size={12} aria-hidden="true" />
                          <span>Listo</span>
                        </span>
                      ) : (
                        <div className={styles.pendingList}>
                          {gaps.map((gap) => (
                            <span
                              key={gap.id}
                              className={`${styles.pendingChip} ${
                                gap.id === "stock" ? styles.pendingChipSoft : ""
                              }`}
                              data-testid={`product-gap-${gap.id}-${item.id}`}
                            >
                              {gap.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={
                          ready
                            ? `/admin/products/${item.id}`
                            : `/admin/products/${item.id}#${gaps[0]?.section ?? "resumen"}`
                        }
                        className={styles.secondaryButton}
                        data-testid={`btn-edit-${item.id}`}
                      >
                        {ready ? "Abrir" : "Completar"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : hasFiltersApplied ? (
        <div className={styles.emptyState} data-testid="empty-filtered">
          <Search className={styles.emptyIcon} aria-hidden="true" />
          <h2 className={styles.emptyTitle}>Ningún producto coincide</h2>
          <p className={styles.emptyDescription}>
            Prueba con otra búsqueda o quita los filtros para ver todo el catálogo.
          </p>
          <Link
            href="/admin/products"
            className={styles.secondaryButton}
            data-testid="btn-reset-filters"
          >
            Ver todos
          </Link>
        </div>
      ) : (
        <div className={styles.emptyState} data-testid="empty-catalog">
          <PackageOpen className={styles.emptyIcon} aria-hidden="true" />
          <h2 className={styles.emptyTitle}>Todavía no hay productos</h2>
          <p className={styles.emptyDescription}>
            Crea el primero para empezar a construir el catálogo de Gamer Perú.
          </p>
          <Link
            href="/admin/products/new"
            className={styles.primaryButton}
            data-testid="btn-create-first"
          >
            <Plus size={16} aria-hidden="true" />
            <span>Crear el primero</span>
          </Link>
        </div>
      )}

      {listResult.totalPages > 1 && (
        <nav
          className={styles.pagination}
          aria-label="Paginación de productos"
          data-testid="pagination"
        >
          <span className={styles.paginationInfo} data-testid="pagination-info">
            Página {listResult.page} de {listResult.totalPages} ({listResult.total} productos)
          </span>
          <div className={styles.paginationButtons}>
            <Link
              href={buildPageUrl(listResult.page - 1)}
              className={`${styles.pageButton} ${listResult.page <= 1 ? styles.disabled : ""}`}
              aria-disabled={listResult.page <= 1}
              tabIndex={listResult.page <= 1 ? -1 : undefined}
              data-testid="btn-prev-page"
            >
              <ChevronLeft size={16} aria-hidden="true" />
              <span>Anterior</span>
            </Link>
            <Link
              href={buildPageUrl(listResult.page + 1)}
              className={`${styles.pageButton} ${
                listResult.page >= listResult.totalPages ? styles.disabled : ""
              }`}
              aria-disabled={listResult.page >= listResult.totalPages}
              tabIndex={listResult.page >= listResult.totalPages ? -1 : undefined}
              data-testid="btn-next-page"
            >
              <span>Siguiente</span>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}
