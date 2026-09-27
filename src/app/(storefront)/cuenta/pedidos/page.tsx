import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentCustomerOrders } from "@/lib/account/orders";
import { OrderList } from "@/components/account/order-list";
import styles from "@/components/account/account.module.css";

export const metadata: Metadata = {
  title: "Mis pedidos | Mi cuenta | Gamer Perú",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  const ordersState = await getCurrentCustomerOrders();

  if (ordersState.status === "UNAUTHENTICATED") {
    redirect("/auth/login");
  }

  if (ordersState.status === "NEEDS_PROFILE_COMPLETION") {
    redirect("/auth/completar-perfil");
  }

  return (
    <div className={styles.sectionStack}>
      <div>
        <h1 className={styles.title}>Mis pedidos</h1>
        <p className={styles.subtitle}>
          El estado de cada compra, desde la verificación del pago hasta la entrega.
        </p>
      </div>

      {ordersState.status === "ERROR" ? (
        <div className={styles.alert} role="alert">
          {ordersState.error} Vuelve a intentarlo en unos minutos.
        </div>
      ) : (
        <OrderList orders={ordersState.orders} />
      )}
    </div>
  );
}
