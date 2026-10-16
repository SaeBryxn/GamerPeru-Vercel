import type { Metadata } from "next";
import Link from "next/link";
import { Cpu, Keyboard, Mouse, Usb, type LucideIcon } from "lucide-react";
import { Reveal } from "@/components/support/reveal";
import { SupportAsideCard, SupportShell } from "@/components/support/support-shell";
import { BRAND_SOFTWARE, type SoftwareKind } from "@/content/software/brand-software";
import { SOFTWARE_KIND_PAGES } from "@/content/software/kinds";
import styles from "@/components/software/software.module.css";

export const metadata: Metadata = {
  title: "Software y drivers | Gamer Perú",
  description:
    "Software oficial, emparejamiento de receptores 8K y actualizaciones de firmware para los periféricos del catálogo de Gamer Perú.",
  alternates: { canonical: "/software" },
};

const KIND_ICONS: Record<SoftwareKind, LucideIcon> = {
  mouse: Mouse,
  teclado: Keyboard,
  dongle: Usb,
  firmware: Cpu,
};

export default function SoftwarePage() {
  return (
    <SupportShell
      hero={{
        title: "Software y drivers",
        description:
          "El software oficial de cada marca del catálogo, cómo emparejar tu receptor 8K y cómo actualizar el firmware sin riesgos. Gamer Perú no aloja instaladores: siempre te enviamos al sitio de la marca.",
      }}
      aside={
        <Reveal delay={0.15}>
          <SupportAsideCard
            title="¿No encuentras tu software?"
            text="Dinos tu modelo y te enviamos el enlace oficial que le corresponde."
          >
            <Link href="/soporte/contacto" className={styles.textLink}>
              Escríbenos
            </Link>
          </SupportAsideCard>
        </Reveal>
      }
    >
      <section aria-labelledby="por-periferico">
        <Reveal>
          <h2 id="por-periferico" className={styles.sectionTitle}>
            Por periférico
          </h2>
          <ul className={styles.kindGrid}>
            {SOFTWARE_KIND_PAGES.map((page) => {
              const Icon = KIND_ICONS[page.kind];
              return (
                <li key={page.kind}>
                  <Link href={`/software/${page.kind}`} className={styles.kindCard}>
                    <span className={styles.kindIcon} aria-hidden="true">
                      <Icon size={22} />
                    </span>
                    <span className={styles.kindTitle}>{page.title}</span>
                    <span className={styles.cardText}>{page.metaDescription}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </section>

      <section aria-labelledby="por-marca">
        <Reveal>
          <h2 id="por-marca" className={styles.sectionTitle}>
            Por marca
          </h2>
          <ul className={styles.brandList}>
            {BRAND_SOFTWARE.map((brand) => {
              const names = [...new Set(brand.entries.map((entry) => entry.name))];
              return (
                <li key={brand.brandSlug} className={styles.brandCard}>
                  <h3 className={styles.softwareName}>{brand.brandName}</h3>
                  <p className={styles.cardText}>{brand.noSoftwareNote ?? names.join(" · ")}</p>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </section>
    </SupportShell>
  );
}
