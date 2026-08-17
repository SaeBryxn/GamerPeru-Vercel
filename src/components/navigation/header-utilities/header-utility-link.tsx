import React from "react";
import Link from "next/link";
import type { LucideIcon, LucideProps } from "lucide-react";
import { Icon } from "@/components/ui";
import styles from "./header-utilities.module.css";

export interface HeaderUtilityLinkProps {
  href: string;
  label: string;
  icon: LucideIcon | React.ComponentType<LucideProps>;
  badgeCount?: number;
  className?: string;
}

export function HeaderUtilityLink({
  href,
  label,
  icon,
  badgeCount,
  className,
}: HeaderUtilityLinkProps) {
  const classNames = [styles.utilityLink, className].filter(Boolean).join(" ");

  return (
    <Link href={href} className={classNames} aria-label={label}>
      <Icon icon={icon} size="lg" aria-hidden="true" />
      {typeof badgeCount === "number" && badgeCount > 0 ? (
        <span className={styles.badge} aria-hidden="true">
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      ) : null}
    </Link>
  );
}
