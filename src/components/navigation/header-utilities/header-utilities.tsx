import React from "react";
import { Heart, Search, ShoppingCart, User } from "lucide-react";
import { HeaderUtilityLink } from "./header-utility-link";
import styles from "./header-utilities.module.css";

export interface HeaderUtilitiesProps {
  searchHref?: string;
  searchLabel?: string;
  accountHref?: string;
  accountLabel?: string;
  wishlistHref?: string;
  wishlistLabel?: string;
  cartHref?: string;
  cartLabel?: string;
  cartCount?: number;
  className?: string;
}

export function HeaderUtilities({
  searchHref = "/buscar",
  searchLabel = "Buscar productos",
  accountHref = "/cuenta",
  accountLabel = "Mi cuenta",
  wishlistHref = "/favoritos",
  wishlistLabel = "Lista de favoritos",
  cartHref = "/carrito",
  cartLabel = "Carrito de compras",
  cartCount,
  className,
}: HeaderUtilitiesProps) {
  const classNames = [styles.utilitiesContainer, className].filter(Boolean).join(" ");

  return (
    <div className={classNames} role="group" aria-label="Acciones de usuario">
      <HeaderUtilityLink href={searchHref} label={searchLabel} icon={Search} />
      <HeaderUtilityLink href={wishlistHref} label={wishlistLabel} icon={Heart} />
      <HeaderUtilityLink href={accountHref} label={accountLabel} icon={User} />
      <HeaderUtilityLink
        href={cartHref}
        label={cartLabel}
        icon={ShoppingCart}
        badgeCount={cartCount}
      />
    </div>
  );
}
