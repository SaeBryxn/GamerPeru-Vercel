"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, CornerDownLeft, LayoutGrid, Package, Search, X } from "lucide-react";
import type { AdminNavItem } from "@/lib/admin/types";
import type { AdminSearchResults } from "@/lib/admin/admin-search-types";
import styles from "./admin-search.module.css";

const MIN_LENGTH = 2;
const DEBOUNCE_MS = 250;

interface Result {
  id: string;
  group: "Páginas" | "Pedidos" | "Productos";
  label: string;
  detail?: string;
  href: string;
  imageUrl?: string | null;
}

/** Case- and accent-insensitive, so «menu» finds «Menú y navegación». */
function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const ORDER_STATUS: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  PROCESSING: "En proceso",
  FULFILLED: "Completado",
  CANCELLED: "Cancelado",
  EXPIRED: "Expirado",
  REFUNDED: "Reembolsado",
};
const PRODUCT_STATUS: Record<string, string> = {
  PUBLISHED: "En la tienda",
  DRAFT: "Borrador",
};

/**
 * Global search (Ctrl/⌘ K): admin screens, orders by number and products by name or SKU.
 * Screens are matched here; orders and products come from /api/admin/search, already limited
 * to what the operator may open.
 */
export function AdminSearch({ navItems }: { navItems: AdminNavItem[] }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<AdminSearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [shortcut, setShortcut] = useState("Ctrl K");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut("⌘K");
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const term = query.trim();
  useEffect(() => {
    if (!open || term.length < MIN_LENGTH) {
      setRemote(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((response) => (response.ok ? (response.json() as Promise<AdminSearchResults>) : null))
        .then((data) => {
          setRemote(data);
          setLoading(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [term, open]);

  const results = useMemo<Result[]>(() => {
    const needle = normalize(term);
    const pages: Result[] = navItems
      .filter(
        (item) =>
          !needle ||
          normalize(item.label).includes(needle) ||
          normalize(item.description ?? "").includes(needle)
      )
      .slice(0, needle ? 4 : navItems.length)
      .map((item) => ({
        id: `page-${item.id}`,
        group: "Páginas",
        label: item.label,
        detail: item.description,
        href: item.href,
      }));
    const orders: Result[] = (remote?.orders ?? []).map((order) => ({
      id: `order-${order.orderNumber}`,
      group: "Pedidos",
      label: `#${order.orderNumber}`,
      detail: ORDER_STATUS[order.status] ?? order.status,
      href: order.href,
    }));
    const products: Result[] = (remote?.products ?? []).map((product) => ({
      id: `product-${product.id}`,
      group: "Productos",
      label: product.name,
      detail: [product.sku ? `SKU ${product.sku}` : null, PRODUCT_STATUS[product.status]]
        .filter(Boolean)
        .join(" · "),
      href: product.href,
      imageUrl: product.imageUrl,
    }));
    return [...orders, ...products, ...pages];
  }, [navItems, remote, term]);

  useEffect(() => setActive(0), [results]);

  const close = () => {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };
  const go = (result: Result | undefined) => {
    if (!result) return;
    close();
    router.push(result.href);
  };

  const optionId = (index: number) => `${id}-option-${index}`;
  const groups = ["Pedidos", "Productos", "Páginas"] as const;
  const noMatches = term.length >= MIN_LENGTH && !loading && results.length === 0;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Buscar pedidos, productos o secciones"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Search className={styles.triggerIcon} aria-hidden="true" />
        <span className={styles.triggerText}>Buscar pedidos, productos…</span>
        <kbd className={styles.kbd} aria-hidden="true">
          {shortcut}
        </kbd>
      </button>

      {open && (
        <div
          className={styles.overlay}
          onPointerDown={(event) => event.target === event.currentTarget && close()}
        >
          <div
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-label="Buscar en el panel"
          >
            <div className={styles.inputRow}>
              <Search className={styles.inputIcon} aria-hidden="true" />
              <input
                ref={inputRef}
                className={styles.input}
                type="search"
                value={query}
                placeholder="Busca un pedido (GP-…), un producto, un SKU o una sección"
                role="combobox"
                aria-label="Buscar"
                aria-expanded={results.length > 0}
                aria-controls={`${id}-list`}
                aria-activedescendant={results.length > 0 ? optionId(active) : undefined}
                aria-autocomplete="list"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    close();
                  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    const step = event.key === "ArrowDown" ? 1 : -1;
                    setActive(
                      (current) => (current + step + results.length) % Math.max(results.length, 1)
                    );
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    go(results[active]);
                  } else if (event.key === "Tab") {
                    // The input is the only stop inside the dialog; results are picked with arrows.
                    event.preventDefault();
                  }
                }}
              />
              <button
                type="button"
                className={styles.close}
                onClick={close}
                aria-label="Cerrar búsqueda"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <ul id={`${id}-list`} className={styles.list} role="listbox" aria-label="Resultados">
              {groups.map((group) => {
                const items = results.filter((result) => result.group === group);
                if (items.length === 0) return null;
                return (
                  <li key={group} role="presentation">
                    <p className={styles.groupLabel} aria-hidden="true">
                      {group}
                    </p>
                    <ul role="presentation" className={styles.groupList}>
                      {items.map((result) => {
                        const index = results.indexOf(result);
                        const Icon =
                          result.group === "Pedidos"
                            ? ClipboardList
                            : result.group === "Productos"
                              ? Package
                              : LayoutGrid;
                        return (
                          <li
                            key={result.id}
                            id={optionId(index)}
                            role="option"
                            aria-selected={index === active}
                            className={styles.option}
                            onPointerMove={() => setActive(index)}
                            onClick={() => go(result)}
                          >
                            <span className={styles.optionIcon} aria-hidden="true">
                              {result.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={result.imageUrl} alt="" width={28} height={28} />
                              ) : (
                                <Icon size={16} />
                              )}
                            </span>
                            <span className={styles.optionText}>
                              <span className={styles.optionLabel}>{result.label}</span>
                              {result.detail && (
                                <span className={styles.optionDetail}>{result.detail}</span>
                              )}
                            </span>
                            {index === active && (
                              <CornerDownLeft className={styles.enter} aria-hidden="true" />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>

            <p className={styles.status} role="status">
              {loading
                ? "Buscando…"
                : noMatches
                  ? `Nada coincide con «${term}»`
                  : term.length > 0 && term.length < MIN_LENGTH
                    ? "Escribe al menos 2 caracteres para buscar pedidos y productos"
                    : ""}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
