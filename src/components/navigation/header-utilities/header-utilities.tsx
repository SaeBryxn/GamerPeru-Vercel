import React from "react";
import { User } from "lucide-react";
import { CartLauncher } from "@/components/cart";
import { SearchLauncherButton, type SearchSuggestionGroup } from "@/components/search";
import { HeaderUtilityLink } from "./header-utility-link";
import styles from "./header-utilities.module.css";

export interface HeaderUtilitiesProps {
  searchLabel?: string;
  accountHref?: string;
  accountLabel?: string;
  cartHref?: string;
  cartLabel?: string;
  cartCount?: number;
  className?: string;
  searchSuggestions?: SearchSuggestionGroup[];
}

export function HeaderUtilities({
  searchLabel = "Buscar productos",
  accountHref = "/cuenta",
  accountLabel = "Mi cuenta",
  cartLabel = "Carrito de compras",
  className,
  searchSuggestions,
}: HeaderUtilitiesProps) {
  const classNames = [styles.utilitiesContainer, className].filter(Boolean).join(" ");

  return (
    <div className={classNames} role="group" aria-label="Acciones de usuario">
      <SearchLauncherButton label={searchLabel} suggestions={searchSuggestions} />
      <HeaderUtilityLink href={accountHref} label={accountLabel} icon={User} />
      <CartLauncher label={cartLabel} data-testid="desktop-cart-launcher" />
    </div>
  );
}
