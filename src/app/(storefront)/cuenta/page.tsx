import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { publicEnv } from "@/config/public-env";
import { getCurrentCustomerProfile } from "@/lib/account/profile";
import { getCurrentCustomerOrders } from "@/lib/account/orders";
import { getCurrentCustomerAddresses } from "@/lib/account/addresses";
import { DomeLink } from "@/components/ui";
import { AccountQuickLinks, type QuickLink } from "@/components/account/account-quick-links";
import { OrderCard } from "@/components/account/order-card";
import styles from "@/components/account/account.module.css";

export const dynamic = "force-dynamic";

const MEMBER_SINCE_FORMAT = new Intl.DateTimeFormat("es-PE", {
  month: "long",
  year: "numeric",
  timeZone: "America/Lima",
});

/** wa.me link to the store; without a configured number it only renders outside production. */
function supportWhatsAppHref(): string | null {
  const number = publicEnv.NEXT_PUBLIC_WHATSAPP_NUMBER;
  if (!number && process.env.NODE_ENV === "production") return null;
  const message = "Hola, necesito ayuda con mi cuenta o un pedido en Gamer Perú.";
  return `https://wa.me/${number ?? ""}?text=${encodeURIComponent(message)}`;
}

export default async function CuentaPage() {
  const profileState = await getCurrentCustomerProfile();

  if (profileState.status === "UNAUTHENTICATED") {
    redirect("/auth/login");
  }

  if (profileState.status === "NEEDS_PROFILE_COMPLETION") {
    redirect("/auth/completar-perfil");
  }

  if (profileState.status !== "READY") {
    return null;
  }

  // Readers are request-cached, and the layout has already loaded the profile and orders.
  const [ordersState, addressesState] = await Promise.all([
    getCurrentCustomerOrders(),
    getCurrentCustomerAddresses(),
  ]);

  const profile = profileState.profile;
  const orders = ordersState.status === "READY" ? ordersState.orders : [];
  const latestOrder = orders[0] ?? null;
  const inTransit = orders.filter((order) => order.status.isInTransit).length;
  const defaultAddress =
    addressesState.status === "READY"
      ? addressesState.addresses.find((address) => address.isDefault)
      : undefined;
  const whatsappHref = supportWhatsAppHref();

  const quickLinks: QuickLink[] = [
    {
      href: "/cuenta/pedidos",
      title: "Mis pedidos",
      text:
        orders.length > 0
          ? `${orders.length} pedido${orders.length === 1 ? "" : "s"} en tu historial`
          : "Aquí verás tus compras y su seguimiento",
      icon: "orders",
    },
    {
      href: "/cuenta/direcciones",
      title: "Direcciones",
      text: defaultAddress
        ? `Predeterminada: ${defaultAddress.district}, ${defaultAddress.province}`
        : "Guarda una dirección para comprar más rápido",
      icon: "addresses",
    },
    {
      href: "/cuenta/perfil",
      title: "Datos personales",
      text: "Nombre, teléfono, documento y contraseña",
      icon: "profile",
    },
    {
      href: "/cuenta/favoritos",
      title: "Favoritos",
      text: "Guarda productos para comprarlos después",
      icon: "favorites",
      comingSoon: true,
    },
    {
      href: "/cuenta/referidos",
      title: "Referidos",
      text: "Recomienda Gamer Perú a tus amigos",
      icon: "referrals",
      comingSoon: true,
    },
  ];

  return (
    <div className={styles.sectionStack}>
      <div className={`${styles.card} ${styles.greeting}`}>
        <div>
          <h1 className={styles.greetingTitle}>Hola, {profile.firstName || "de nuevo"}</h1>
          <p className={styles.greetingMeta}>
            Cliente desde {MEMBER_SINCE_FORMAT.format(profile.createdAt)}
          </p>
        </div>
        {inTransit > 0 && (
          <span className={styles.transitNotice} role="status">
            <span className={styles.pulseDot} aria-hidden="true" />
            {inTransit === 1
              ? "Tienes 1 pedido en camino"
              : `Tienes ${inTransit} pedidos en camino`}
          </span>
        )}
      </div>

      <section aria-labelledby="latest-order-title" className={styles.sectionStack}>
        <div className={styles.sectionHeader}>
          <h2 id="latest-order-title" className={styles.cardTitle}>
            Tu último pedido
          </h2>
        </div>
        {latestOrder ? (
          <OrderCard order={latestOrder} />
        ) : (
          <div className={styles.card}>
            <p className={`${styles.cardText} ${styles.cardTextFlush}`}>
              Todavía no has hecho pedidos. Cuando compres, aquí verás su estado al instante.
            </p>
          </div>
        )}
      </section>

      <AccountQuickLinks links={quickLinks} />

      <div className={`${styles.card} ${styles.supportCard}`}>
        <div>
          <h2 className={styles.cardTitle}>¿Necesitas ayuda?</h2>
          <p className={styles.cardText}>
            Te responde una persona del equipo por WhatsApp, con tu número de pedido a la mano.
          </p>
        </div>
        {whatsappHref && (
          <DomeLink
            href={whatsappHref}
            tone="dark"
            className={styles.domeSmall}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={14} aria-hidden="true" className={styles.domeIcon} />
            Escribir por WhatsApp
          </DomeLink>
        )}
      </div>
    </div>
  );
}
