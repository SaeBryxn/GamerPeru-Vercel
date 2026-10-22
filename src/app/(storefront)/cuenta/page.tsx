import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { buildWhatsAppHref } from "@/lib/support/whatsapp";
import { getCurrentCustomerProfile } from "@/lib/account/profile";
import { getCurrentCustomerOrders } from "@/lib/account/orders";
import { getCurrentCustomerAddresses } from "@/lib/account/addresses";
import { DomeLink } from "@/components/ui";
import { AccountQuickLinks, type QuickLink } from "@/components/account/account-quick-links";
import { OrderCard } from "@/components/account/order-card";
import styles from "@/components/account/account.module.css";

export const dynamic = "force-dynamic";

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

  const orders = ordersState.status === "READY" ? ordersState.orders : [];
  const latestOrder = orders[0] ?? null;
  const defaultAddress =
    addressesState.status === "READY"
      ? addressesState.addresses.find((address) => address.isDefault)
      : undefined;
  const whatsappHref = buildWhatsAppHref(
    "Hola, necesito ayuda con mi cuenta o un pedido en Gamer Perú."
  );

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
  ];

  return (
    <div className={styles.sectionStack}>
      <h1 className={styles.visuallyHidden}>Resumen de tu cuenta</h1>

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
        <span className={`${styles.quickIcon} ${styles.toneGreen}`} aria-hidden="true">
          <MessageCircle size={20} />
        </span>
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
