import React from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  PackageOpen,
} from "lucide-react";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import {
  getAdminProductList,
  getPublishedBrands,
  getPublishedCategories,
} from "@/lib/admin/catalog/readers";
import { formatCentsToPenDisplay } from "@/lib/admin/catalog/money";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import type { CatalogStatus } from "@/lib/admin/catalog/types";
import styles from "./products.module.css";

export const dynamic = "force-dynamic";

interface AdminProductsPageProps {
  searchParams?: Promise<{
    search?: string;
    status?: string;
    brandId?: string;
    categoryId?: string;
    page?: string;
  }>;
}

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
  const brandId = resolvedParams.brandId?.trim() ? resolvedParams.brandId.trim() : undefined;
  const categoryId = resolvedParams.categoryId?.trim()
    ? resolvedParams.categoryId.trim()
    : undefined;
  const page = Math.max(1, parseInt(resolvedParams.page ?? "1", 10) || 1);

  const [listResult, brands, categories] = await Promise.all([
    getAdminProductList(
      {
        search,
        status,
        brandId,
        categoryId,
        page,
        pageSize: 20,
      },
      { authContext }
    ),
    getPublishedBrands({ authContext }),
    getPublishedCategories({ authContext }),
  ]);

  const hasFiltersApplied =
    Boolean(search) || Boolean(status) || Boolean(brandId) || Boolean(categoryId);

  function buildPageUrl(targetPage: number) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (brandId) params.set("brandId", brandId);
    if (categoryId) params.set("categoryId", categoryId);
    params.set("page", String(targetPage));
    return `/admin/products?${params.toString()}`;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Productos</h1>
          <p className={styles.subtitle}>Gestión del catálogo maestro y variantes de Gamer Perú.</p>
        </div>
        <Link
          href="/admin/products/new"
          className={styles.primaryButton}
          data-testid="btn-new-product"
        >
          <Plus size={16} aria-hidden="true" />
          <span>Nuevo Producto</span>
        </Link>
      </header>

      {/* Filter Toolbar */}
      <section className={styles.filterCard} aria-label="Filtros de productos">
        <form method="GET" action="/admin/products" className={styles.filterForm}>
          <div className={styles.filterField} style={{ flex: 2, minWidth: 200 }}>
            <input
              type="search"
              name="search"
              defaultValue={search ?? ""}
              placeholder="Buscar por nombre o slug..."
              className={styles.filterInput}
              data-testid="filter-search"
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
              <option value="">Todos los estados</option>
              <option value="DRAFT">Borrador (DRAFT)</option>
              <option value="PUBLISHED">Publicado (PUBLISHED)</option>
              <option value="ARCHIVED">Archivado (ARCHIVED)</option>
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
              <span>Filtrar</span>
            </button>
            {hasFiltersApplied && (
              <Link
                href="/admin/products"
                className={styles.clearButton}
                data-testid="filter-clear"
              >
                Limpiar filtros
              </Link>
            )}
          </div>
        </form>
      </section>

      {/* Main Table / Empty State */}
      {listResult.items.length > 0 ? (
        <div className={styles.tableContainer}>
          <table className={styles.table} data-testid="product-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>Imagen</th>
                <th>Producto</th>
                <th>Marca / Categoría</th>
                <th>Estado</th>
                <th>Variantes</th>
                <th>Precio</th>
                <th>ATS Variantes Activas</th>
                <th>Actualizado</th>
                <th style={{ textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {listResult.items.map((item) => {
                const thumbUrl = item.primaryMediaKey
                  ? resolvePublicMediaUrl(item.primaryMediaKey)
                  : null;

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

                return (
                  <tr key={item.id} data-testid={`product-row-${item.id}`}>
                    <td>
                      <div className={styles.mediaThumb}>
                        {thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbUrl}
                            alt={item.primaryMediaAlt ?? item.name}
                            loading="lazy"
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
                        <span className={styles.productSlug}>{item.slug}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.taxoText}>
                        <span className={styles.brandLabel}>{item.brandName}</span>
                        <span className={styles.categoryLabel}>{item.categoryName}</span>
                      </div>
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
                        {item.status === "PUBLISHED"
                          ? "Publicado"
                          : item.status === "ARCHIVED"
                            ? "Archivado"
                            : "Borrador"}
                      </span>
                    </td>
                    <td>
                      <span data-testid={`product-variants-count-${item.id}`}>
                        {item.activeVariants} / {item.totalVariants} activas
                      </span>
                    </td>
                    <td className={styles.priceCell} data-testid={`product-price-${item.id}`}>
                      {priceDisplay}
                    </td>
                    <td className={styles.atsCell} data-testid={`product-ats-${item.id}`}>
                      {item.activeVariantAts}
                    </td>
                    <td
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--color-text-secondary, #71717a)",
                      }}
                    >
                      {new Date(item.updatedAt).toLocaleDateString("es-PE", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={`/admin/products/${item.id}`}
                        className={styles.secondaryButton}
                        data-testid={`btn-edit-${item.id}`}
                      >
                        Editar
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
          <h2 className={styles.emptyTitle}>No se encontraron productos</h2>
          <p className={styles.emptyDescription}>
            No hay ningún producto que coincida con los criterios de búsqueda o filtros
            seleccionados.
          </p>
          <Link
            href="/admin/products"
            className={styles.secondaryButton}
            data-testid="btn-reset-filters"
          >
            Limpiar filtros
          </Link>
        </div>
      ) : (
        <div className={styles.emptyState} data-testid="empty-catalog">
          <PackageOpen className={styles.emptyIcon} aria-hidden="true" />
          <h2 className={styles.emptyTitle}>No hay productos en el catálogo</h2>
          <p className={styles.emptyDescription}>
            Comienza creando el primer producto maestro con su variante inicial para Gamer Perú.
          </p>
          <Link
            href="/admin/products/new"
            className={styles.primaryButton}
            data-testid="btn-create-first"
          >
            <Plus size={16} aria-hidden="true" />
            <span>Crear Primer Producto</span>
          </Link>
        </div>
      )}

      {/* Pagination Bar */}
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
