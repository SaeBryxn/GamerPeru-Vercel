import type { Metadata } from "next";
import { Boxes, Handshake, Headset, LineChart, PackageCheck, Sparkles } from "lucide-react";
import { loadShowcaseProducts } from "@/components/home/home-catalog";
import { TrustStrip } from "@/components/home/trust-strip/trust-strip";
import { DistributorHero } from "@/components/support/distributor-hero";
import { DistributorForm } from "@/components/support/inquiry-forms";
import { Reveal } from "@/components/support/reveal";
import { SUPPORT_TRUST_ITEMS } from "@/content/support/trust";
import styles from "@/components/support/support-pages.module.css";

export const metadata: Metadata = {
  title: "Distribuidores | Gamer Perú",
  description:
    "Programa para tiendas, centros gamer y equipos de esports que quieren ofrecer periféricos gaming de alto rendimiento en el Perú.",
  alternates: { canonical: "/soporte/distribuidores" },
};

export const revalidate = 300;

/** How we work with partners, not commercial terms: those are agreed case by case. */
const BENEFITS = [
  {
    icon: Boxes,
    title: "Catálogo multimarca",
    text: "Mouses, mousepads y accesorios de marcas especializadas en un solo proveedor.",
  },
  {
    icon: LineChart,
    title: "Condiciones según tu volumen",
    text: "Conversamos precios y condiciones de acuerdo con el tamaño y el tipo de tu negocio.",
  },
  {
    icon: Headset,
    title: "Atención directa",
    text: "Un canal de contacto con nuestro equipo para pedidos, consultas y reposiciones.",
  },
  {
    icon: Sparkles,
    title: "Material de producto",
    text: "Fotos, especificaciones y descripciones de nuestro catálogo para tu tienda o tus redes.",
  },
  {
    icon: PackageCheck,
    title: "Asesoría técnica",
    text: "Te ayudamos a elegir qué productos ofrecer según tu público: competitivo, casual o creadores.",
  },
  {
    icon: Handshake,
    title: "Relación de largo plazo",
    text: "Buscamos aliados que compartan nuestra pasión por el hardware de alto rendimiento.",
  },
];

export default async function DistribuidoresPage() {
  const products = await loadShowcaseProducts(6);

  return (
    <main id="main-content">
      <DistributorHero products={products} />

      <section className={styles.section} aria-labelledby="beneficios">
        <Reveal>
          <h2 id="beneficios" className={styles.sectionHeading}>
            Por qué trabajar con nosotros
          </h2>
          <p className={styles.sectionLead}>
            Ofrece a tus clientes los periféricos que piden los jugadores más exigentes, con el
            respaldo de un equipo que conoce el producto.
          </p>
        </Reveal>
        <ul className={styles.benefits}>
          {BENEFITS.map((benefit, index) => (
            <Reveal key={benefit.title} as="li" delay={(index % 3) * 0.08}>
              <div className={styles.benefit}>
                <span className={styles.benefitIcon} aria-hidden="true">
                  <benefit.icon size={22} />
                </span>
                <h3 className={styles.benefitTitle}>{benefit.title}</h3>
                <p className={styles.benefitText}>{benefit.text}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </section>

      <section className={styles.requestSection} aria-labelledby="solicitud-title">
        <div id="solicitud" className={styles.requestInner}>
          <Reveal>
            <h2 id="solicitud-title" className={styles.sectionHeading}>
              Solicita ser distribuidor
            </h2>
            <p className={styles.sectionLead}>
              Completa el formulario y nuestro equipo revisará tu solicitud. El RUC y el mensaje son
              opcionales, pero nos ayudan a responderte con una propuesta concreta.
            </p>
          </Reveal>
          <Reveal delay={0.1} className={styles.formCard}>
            <DistributorForm />
          </Reveal>
        </div>
      </section>

      <TrustStrip items={SUPPORT_TRUST_ITEMS} />
    </main>
  );
}
