"use client";

import React from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  Gift,
  Heart,
  MapPin,
  Package,
  ShoppingBag,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { useAccountNavigate } from "./account-transition";
import styles from "./account.module.css";

const GRID_VARIANTS: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const TILE_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
};

// Icons travel by name: the overview is a server component and cannot hand functions to the client.
const QUICK_ICONS = {
  orders: Package,
  addresses: MapPin,
  profile: UserRound,
  favorites: Heart,
  referrals: Gift,
} satisfies Record<string, LucideIcon>;

export interface QuickLink {
  href: string;
  title: string;
  text: string;
  icon: keyof typeof QUICK_ICONS;
  comingSoon?: boolean;
}

function QuickTileBody({
  icon: Icon,
  title,
  text,
  comingSoon,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  comingSoon?: boolean;
}): React.JSX.Element {
  return (
    <>
      <span className={styles.quickIcon}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className={styles.quickBody}>
        <span className={styles.quickTitle}>
          {title}
          {comingSoon && <span className={styles.badgeComingSoon}>Próximamente</span>}
        </span>
        <span className={styles.quickText}>{text}</span>
      </span>
    </>
  );
}

/** Shortcut tiles on the overview; account links switch sections with the hub's transition. */
export function AccountQuickLinks({ links }: { links: QuickLink[] }) {
  const navigate = useAccountNavigate();
  const { itemCount, openDrawer } = useCart();

  return (
    <motion.div
      className={styles.quickGrid}
      variants={GRID_VARIANTS}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={TILE_VARIANTS}>
        <button
          type="button"
          className={`${styles.quickCard} ${styles.quickCardButton}`}
          onClick={(event) => openDrawer({ returnFocusTo: event.currentTarget })}
        >
          <QuickTileBody
            icon={ShoppingBag}
            title="Tu carrito"
            text={
              itemCount > 0
                ? `${itemCount} producto${itemCount === 1 ? "" : "s"} esperando por ti`
                : "Tu carrito está vacío por ahora"
            }
          />
        </button>
      </motion.div>

      {links.map((link) => (
        <motion.div key={link.href} variants={TILE_VARIANTS}>
          <Link
            href={link.href}
            className={styles.quickCard}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              navigate(link.href);
            }}
          >
            <QuickTileBody
              icon={QUICK_ICONS[link.icon]}
              title={link.title}
              text={link.text}
              comingSoon={link.comingSoon}
            />
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
