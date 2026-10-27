import React from "react";
import Link from "@/components/app-link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Box,
  Boxes,
  ChartColumnIncreasing,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  HeartPulse,
  ImageOff,
  Minus,
  Package,
  PackageCheck,
  PackageX,
  ShoppingCart,
  Store,
  Tag,
  TriangleAlert,
  Trophy,
  Wallet,
  MessageSquareText,
} from "lucide-react";
import type {
  AttentionItem,
  CatalogHealthSummary,
  InventorySummary,
  Kpi,
  KpiTrend,
  RecentOrder,
  SalesOverview,
  StoreStatus,
  TopProduct,
} from "@/lib/admin/dashboard-overview-types";
import { StatusBadge } from "@/components/admin/ui";
import styles from "./overview.module.css";

type Hue = "red" | "blue" | "green" | "amber" | "violet" | "neutral";

function Chip({ hue, small, children }: { hue: Hue; small?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`${styles.chip} ${small ? styles.chipSmall : ""}`}
      data-hue={hue}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

export function TrendLabel({ trend }: { trend: KpiTrend }) {
  const Icon = trend.direction === "up" ? ArrowUp : trend.direction === "down" ? ArrowDown : Minus;
  return (
    <span className={styles.trend} data-direction={trend.direction}>
      {trend.direction !== "new" && <Icon aria-hidden="true" />}
      <span aria-hidden="true">{trend.label}</span>
      <span className={styles.visuallyHidden}>{trend.description}</span>
    </span>
  );
}

/** Tiny trend line, drawn on the server: no interaction, so no client JavaScript. */
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  const width = 112;
  const height = 44;
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points = values.map((value, index) => [
    (index / (values.length - 1)) * width,
    height - 4 - ((value - min) / span) * (height - 8),
  ]);
  const line = points
    .map(([x, y], index) => `${index ? "L" : "M"}${x!.toFixed(1)} ${y!.toFixed(1)}`)
    .join(" ");
  const id = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg
      className={styles.sparkline}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width} ${height} L0 ${height} Z`} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const KPI_STYLE = {
  netSales: { label: "Ventas netas", hue: "red", icon: ShoppingCart, color: "#e11d48" },
  paidOrders: { label: "Pedidos", hue: "blue", icon: Box, color: "#64748b" },
  averageTicket: { label: "Ticket promedio", hue: "red", icon: Tag, color: "#94a3b8" },
  estimatedProfit: {
    label: "Utilidad estimada",
    hue: "green",
    icon: ChartColumnIncreasing,
    color: "#16a34a",
  },
} as const;

export function MetricCard({
  kind,
  kpi,
  series,
  comparisonLabel,
  note,
  className,
}: {
  kind: keyof typeof KPI_STYLE;
  kpi: Kpi | null;
  series: number[];
  comparisonLabel: string;
  note?: string;
  className?: string;
}) {
  const style = KPI_STYLE[kind];
  const Icon = style.icon;
  return (
    <section
      className={`${styles.card} ${styles.metric} ${kind === "netSales" ? styles.metricFeatured : ""} ${className ?? ""}`}
      aria-label={style.label}
    >
      <div className={styles.metricHead}>
        <Chip hue={style.hue}>
          <Icon />
        </Chip>
        <h2 className={styles.metricLabel}>{style.label}</h2>
        {kpi && <TrendLabel trend={kpi.trend} />}
      </div>
      {kpi ? (
        <div className={styles.metricBody}>
          <div>
            <p className={styles.metricValue}>{kpi.value}</p>
            <p className={styles.metricCompare}>
              vs. {kpi.previous} {comparisonLabel}
            </p>
          </div>
          <Sparkline values={series} color={style.color} />
        </div>
      ) : (
        <p className={styles.metricNote}>{note}</p>
      )}
      {kpi && note && <p className={styles.metricNote}>{note}</p>}
    </section>
  );
}

const ATTENTION_ICON: Record<AttentionItem["id"], { icon: typeof Package; hue: Hue }> = {
  payments: { icon: Wallet, hue: "amber" },
  ordersToPrepare: { icon: Package, hue: "red" },
  publishedWithoutPrice: { icon: Tag, hue: "red" },
  publishedWithoutStock: { icon: PackageX, hue: "amber" },
  pendingReviews: { icon: MessageSquareText, hue: "violet" },
  publishedWithoutPhoto: { icon: ImageOff, hue: "blue" },
};

export function AttentionCard({
  items,
  className,
}: {
  items: AttentionItem[];
  className?: string;
}) {
  const shown = items.slice(0, 5);
  return (
    <section className={`${styles.card} ${className ?? ""}`} aria-labelledby="attention-title">
      <div className={styles.cardHead}>
        <Chip hue="red">
          <ClipboardList />
        </Chip>
        <div className={styles.cardTitles}>
          <h2 id="attention-title" className={styles.cardTitle}>
            Por atender
          </h2>
          <p className={styles.cardSubtitle}>Tareas que requieren tu atención</p>
        </div>
      </div>
      {shown.length === 0 ? (
        <div className={styles.allClear}>
          <CircleCheck aria-hidden="true" />
          <p>Todo al día. No hay tareas pendientes.</p>
        </div>
      ) : (
        <ul className={styles.rows}>
          {shown.map((item) => {
            const { icon: Icon, hue } = ATTENTION_ICON[item.id];
            return (
              <li key={item.id}>
                <Link href={item.href} className={styles.rowLink}>
                  <Chip hue={hue} small>
                    <Icon />
                  </Chip>
                  <span className={styles.rowText}>
                    <p className={styles.rowTitle}>
                      <strong>{item.count}</strong>
                      {item.title}
                    </p>
                    <p className={styles.rowDetail}>{item.detail}</p>
                  </span>
                  {item.tone === "danger" && (
                    <span className={styles.urgentDot} role="img" aria-label="Urgente" />
                  )}
                  <ChevronRight className={styles.rowChevron} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CardHead({
  id,
  hue,
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  id: string;
  hue: Hue;
  icon: typeof Package;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.cardHead}>
      <Chip hue={hue}>
        <Icon />
      </Chip>
      <div className={styles.cardTitles}>
        <h2 id={id} className={styles.cardTitle}>
          {title}
        </h2>
        {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={styles.cardLink}>
      {children}
      <ArrowRight size={14} aria-hidden="true" />
    </Link>
  );
}

function Tile({
  hue,
  icon: Icon,
  count,
  label,
  hint,
  href,
}: {
  hue: Hue;
  icon: typeof Package;
  count: number;
  label: string;
  hint: string;
  href: string | null;
}) {
  const body = (
    <>
      <Icon className={styles.tileIcon} aria-hidden="true" />
      <span className={styles.tileValue}>{count.toLocaleString("en-US")}</span>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileHint}>{hint}</span>
    </>
  );
  return href ? (
    <Link href={href} className={styles.tile} data-hue={hue}>
      {body}
    </Link>
  ) : (
    <div className={styles.tile} data-hue={hue}>
      {body}
    </div>
  );
}

export function InventoryCard({
  summary,
  className,
}: {
  summary: InventorySummary;
  className?: string;
}) {
  return (
    <section className={`${styles.card} ${className ?? ""}`} aria-labelledby="inventory-title">
      <CardHead
        id="inventory-title"
        hue="red"
        icon={Boxes}
        title="Inventario"
        subtitle="Productos publicados"
        action={<CardLink href="/admin/inventario">Ver inventario</CardLink>}
      />
      <div className={styles.tiles}>
        <Tile
          hue="red"
          icon={PackageX}
          count={summary.outOfStock.count}
          label="Sin stock"
          hint="Productos agotados"
          href={summary.outOfStock.href}
        />
        <Tile
          hue="amber"
          icon={TriangleAlert}
          count={summary.lowStock.count}
          label="Stock bajo"
          hint="Algún color o talla por agotarse"
          href={summary.lowStock.href}
        />
        <Tile
          hue="neutral"
          icon={PackageCheck}
          count={summary.available.count}
          label="Disponibles"
          hint="Listos para vender"
          href={summary.available.href}
        />
      </div>
    </section>
  );
}

export function ProgressRing({ value }: { value: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const color =
    value >= 90
      ? "var(--color-status-success-text)"
      : value >= 75
        ? "#65a30d"
        : value >= 50
          ? "#d97706"
          : "var(--color-status-danger-text)";
  return (
    <div className={styles.ring}>
      <svg viewBox="0 0 84 84" aria-hidden="true">
        <circle
          cx="42"
          cy="42"
          r={radius}
          fill="none"
          stroke="var(--color-surface-tertiary)"
          strokeWidth="7"
        />
        <circle
          cx="42"
          cy="42"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
        />
      </svg>
      <span className={styles.ringValue}>{value}%</span>
    </div>
  );
}

const toneOfPercent = (percent: number) =>
  percent >= 90 ? "success" : percent >= 60 ? "warning" : "danger";

function ToneIcon({ tone }: { tone: "success" | "warning" | "danger" }) {
  const Icon = tone === "success" ? CircleCheck : CircleAlert;
  return <Icon className={styles.checkIcon} data-tone={tone} aria-hidden="true" />;
}

export function CatalogHealthCard({
  health,
  className,
}: {
  health: CatalogHealthSummary;
  className?: string;
}) {
  return (
    <section className={`${styles.card} ${className ?? ""}`} aria-labelledby="health-title">
      <CardHead id="health-title" hue="red" icon={HeartPulse} title="Salud del catálogo" />
      <div className={styles.healthTop}>
        <ProgressRing value={health.score} />
        <div>
          <p className={styles.healthRating}>{health.rating}</p>
          <p className={styles.cardSubtitle}>
            {health.score}% de {health.publishedProducts} productos publicados con la ficha completa
          </p>
        </div>
      </div>
      <ul className={styles.checks}>
        {health.checks.map((check) => (
          <li key={check.label} className={styles.check}>
            <ToneIcon tone={toneOfPercent(check.percent)} />
            <span className={styles.checkLabel}>
              {check.href ? <Link href={check.href}>{check.label}</Link> : check.label}
            </span>
            <span className={styles.checkValue}>{check.percent}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StoreStatusCard({
  status,
  className,
}: {
  status: StoreStatus;
  className?: string;
}) {
  return (
    <section className={`${styles.card} ${className ?? ""}`} aria-labelledby="store-title">
      <CardHead
        id="store-title"
        hue="red"
        icon={Store}
        title="Estado de la tienda"
        action={
          <span className={styles.pill} data-tone={status.allClear ? "success" : "warning"}>
            {status.allClear ? "Al día" : "Requiere atención"}
          </span>
        }
      />
      <ul className={styles.checks}>
        {status.rows.map((row) => (
          <li key={row.label} className={styles.check}>
            <ToneIcon tone={row.tone} />
            <span className={styles.checkLabel}>
              {row.href ? <Link href={row.href}>{row.label}</Link> : row.label}
            </span>
            <span className={styles.statusValue}>{row.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProductThumbnail({
  src,
  alt,
  small,
}: {
  src: string | null;
  alt: string;
  small?: boolean;
}) {
  return (
    <span className={`${styles.thumb} ${small ? styles.thumbSmall : ""}`}>
      {src ? (
        // Tiny admin thumbnails straight from the CDN: next/image would add a Worker transform each.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" width={small ? 30 : 44} height={small ? 30 : 44} />
      ) : (
        <Package size={small ? 14 : 18} aria-hidden="true" />
      )}
    </span>
  );
}

export function TopProductsCard({
  products,
  periodLabel,
  className,
}: {
  products: TopProduct[];
  periodLabel: string;
  className?: string;
}) {
  return (
    <section className={`${styles.card} ${className ?? ""}`} aria-labelledby="top-title">
      <CardHead
        id="top-title"
        hue="amber"
        icon={Trophy}
        title="Top productos"
        subtitle={`Más vendidos ${periodLabel}`}
        action={<CardLink href="/admin/products">Ver todos</CardLink>}
      />
      {products.length === 0 ? (
        <p className={styles.empty}>Sin ventas pagadas en este período</p>
      ) : (
        <ol className={styles.rows}>
          {products.map((product, index) => {
            const body = (
              <>
                <span className={styles.rank} aria-hidden="true">
                  {index + 1}
                </span>
                <ProductThumbnail src={product.imageUrl} alt="" />
                <span className={styles.rowText}>
                  <p className={styles.rowTitle}>{product.name}</p>
                  <p className={styles.rowDetail}>
                    {product.units} {product.units === 1 ? "unidad vendida" : "unidades vendidas"}
                  </p>
                </span>
                <span className={styles.amount}>{product.revenue}</span>
                <TrendLabel trend={product.trend} />
              </>
            );
            return (
              <li key={product.productId}>
                {product.href ? (
                  <Link href={product.href} className={styles.rowLink}>
                    {body}
                  </Link>
                ) : (
                  <div className={styles.rowLink}>{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function RecentOrdersCard({
  orders,
  className,
}: {
  orders: RecentOrder[];
  className?: string;
}) {
  return (
    <section className={`${styles.card} ${className ?? ""}`} aria-labelledby="orders-title">
      <CardHead
        id="orders-title"
        hue="red"
        icon={ClipboardList}
        title="Pedidos recientes"
        action={<CardLink href="/admin/orders">Ver todos</CardLink>}
      />
      {orders.length === 0 ? (
        <p className={styles.empty}>Todavía no hay pedidos</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col"># Pedido</th>
                <th scope="col">Cliente</th>
                <th scope="col">Productos</th>
                <th scope="col">Total</th>
                <th scope="col">Estado</th>
                <th scope="col">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.orderNumber}>
                  <td>
                    <Link href={order.href} className={styles.orderLink}>
                      #{order.orderNumber}
                    </Link>
                  </td>
                  <td>
                    <span className={styles.customer}>
                      <ProductThumbnail src={order.imageUrl} alt="" small />
                      <span>{order.customer}</span>
                    </span>
                  </td>
                  <td>{order.products}</td>
                  <td className={styles.money}>{order.total}</td>
                  <td>
                    <StatusBadge tone={order.status.tone}>{order.status.label}</StatusBadge>
                  </td>
                  <td>
                    <time dateTime={order.createdAt}>{order.createdLabel}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Profit coverage in words, or nothing when every sold line has a cost. */
export function profitNote(sales: SalesOverview): string | undefined {
  if (!sales.estimatedProfit) return "Registra el costo de tus variantes para estimarla";
  if (sales.profitCoverage >= 0.995) return undefined;
  return `Calculada sobre el ${Math.round(sales.profitCoverage * 100)}% de las ventas con costo registrado`;
}
