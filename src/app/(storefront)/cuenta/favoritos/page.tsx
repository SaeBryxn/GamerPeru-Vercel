import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WishlistGrid } from "@/components/wishlist/wishlist-grid";
import { getCurrentWishlistProducts } from "@/lib/wishlist/products";
import styles from "@/components/account/account.module.css";

export const metadata: Metadata = {
  title: "Mis favoritos | Mi cuenta | Gamer Perú",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function FavoritosPage() {
  const wishlist = await getCurrentWishlistProducts();

  if (wishlist.status === "UNAUTHENTICATED") {
    redirect("/auth/login");
  }

  return (
    <div className={styles.sectionStack}>
      <div>
        <h1 className={styles.title}>Mis favoritos</h1>
        <p className={styles.subtitle}>
          Los productos que guardaste con el corazón, del más reciente al más antiguo.
        </p>
      </div>

      {wishlist.status === "ERROR" ? (
        <div className={styles.alert} role="alert">
          No pudimos cargar tus favoritos. Vuelve a intentarlo en unos minutos.
        </div>
      ) : (
        <WishlistGrid products={wishlist.products} />
      )}
    </div>
  );
}
