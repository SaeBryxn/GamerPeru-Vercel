import React from "react";
import { BadgeCheck, Landmark, MessageCircle, Store, Truck, type LucideIcon } from "lucide-react";
import { Icon } from "@/components/ui";
import styles from "./trust-strip.module.css";

const ICONS: Record<string, LucideIcon> = {
  whatsapp: MessageCircle,
  payment: BadgeCheck,
  currency: Landmark,
  catalog: Store,
  shipping: Truck,
};

export interface TrustItem {
  icon: keyof typeof ICONS;
  title: string;
  description: string;
}

export interface TrustStripProps {
  items: TrustItem[];
}

/** Four claims the store can actually back, between the banner and the footer. */
export function TrustStrip({ items }: TrustStripProps) {
  return (
    <section className={styles.section} aria-label="Cómo compras en Gamer Perú">
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.title} className={styles.item}>
            <Icon icon={ICONS[item.icon] ?? Store} size="md" className={styles.icon} />
            <div className={styles.text}>
              <p className={styles.title}>{item.title}</p>
              <p className={styles.description}>{item.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
