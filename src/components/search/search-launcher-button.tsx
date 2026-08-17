"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Icon } from "@/components/ui";
import { SearchModal } from "./search-modal";
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
  const linkRef = useRef<HTMLAnchorElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    requestAnimationFrame(() => {
      linkRef.current?.focus();
    });
  };

  const classNames = [styles.launcherButton, className].filter(Boolean).join(" ");

  return (
    <>
      <Link
        ref={linkRef}
        href="/buscar"
        onClick={handleClick}
        className={classNames}
        aria-label={label}
      >
        <Icon icon={Search} size="lg" aria-hidden="true" />
      </Link>

      {isOpen && <SearchModal isOpen={isOpen} onClose={handleClose} />}
    </>
  );
}
