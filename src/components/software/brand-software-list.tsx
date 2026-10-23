import Link from "@/components/app-link";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { getSoftwareEntries, type SoftwareKind } from "@/content/software/brand-software";
import styles from "./software.module.css";

/** Official software per brand for one kind, with the support fallback where no URL exists. */
export function BrandSoftwareList({ kind, emptyText }: { kind: SoftwareKind; emptyText: string }) {
  const entries = getSoftwareEntries(kind);

  if (entries.length === 0) {
    return (
      <div className={styles.empty}>
        <p>{emptyText}</p>
        <Link href="/soporte/contacto" className={styles.textLink}>
          Escríbenos
        </Link>
      </div>
    );
  }

  return (
    <ul className={styles.brandList}>
      {entries.map(({ brand, entry }) => (
        <li key={brand.brandSlug} className={styles.brandCard}>
          <p className={styles.brandName}>{brand.brandName}</p>
          <h3 className={styles.softwareName}>{entry.name}</h3>
          <p className={styles.cardText}>{entry.description}</p>
          {entry.url ? (
            <a
              href={entry.url}
              className={styles.cardAction}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ir al sitio oficial de {brand.brandName}
              <ArrowUpRight size={16} aria-hidden="true" />
              <span className={styles.srOnly}> (se abre en una pestaña nueva)</span>
            </a>
          ) : (
            <Link href="/soporte/contacto" className={styles.cardAction}>
              Pídenos el enlace oficial de {brand.brandName}
              <MessageCircle size={16} aria-hidden="true" />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
