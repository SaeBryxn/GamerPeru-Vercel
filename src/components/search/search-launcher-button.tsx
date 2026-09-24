"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Icon } from "@/components/ui";
import { SearchDrawer } from "./search-drawer";
import styles from "./search-launcher-button.module.css";

export interface SearchLauncherButtonProps {
  label?: string;
  className?: string;
}

export function SearchLauncherButton({
  label = "Buscar productos",
  className,
}: SearchLauncherButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setIsOpen(true);
  };

  // The drawer restores focus to this link once its exit animation ends.
  const handleClose = () => setIsOpen(false);

  const classNames = [styles.launcherButton, className].filter(Boolean).join(" ");

  return (
    <>
      <Link href="/buscar" onClick={handleClick} className={classNames} aria-label={label}>
        <Icon icon={Search} size="lg" aria-hidden="true" />
      </Link>

      <SearchDrawer isOpen={isOpen} onClose={handleClose} />
    </>
  );
}
