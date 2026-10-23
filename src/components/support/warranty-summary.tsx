import Link from "@/components/app-link";
import { ArrowRight, CircleCheck, CircleX } from "lucide-react";
import {
  WARRANTY_EVALUATED,
  WARRANTY_EXCLUDED,
  WARRANTY_STEPS,
} from "@/content/support/official-store";
import styles from "./support-hub.module.css";

/** What the store evaluates as a factory defect, what it does not cover and how to ask. */
export function WarrantySummary({ headingId }: { headingId: string }) {
  return (
    <section aria-labelledby={headingId} id="garantia">
      <h2 id={headingId} className={styles.sectionTitle}>
        Garantía por defecto de fábrica
      </h2>
      <p className={styles.sectionLead}>
        Si tu periférico falla por un defecto de fábrica, revisamos el caso contigo. Esto es lo que
        evaluamos y lo que queda fuera.
      </p>
      <div className={styles.columns}>
        <div className={styles.column}>
          <h3 className={styles.columnTitle}>Evaluamos como defecto de fábrica</h3>
          <ul className={styles.checklist}>
            {WARRANTY_EVALUATED.map((item) => (
              <li key={item}>
                <CircleCheck size={18} className={styles.included} aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.column}>
          <h3 className={styles.columnTitle}>No se considera defecto de fábrica</h3>
          <ul className={styles.checklist}>
            {WARRANTY_EXCLUDED.map((item) => (
              <li key={item}>
                <CircleX size={18} className={styles.excluded} aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <ol className={styles.steps} aria-label="Cómo solicitar una revisión">
        {WARRANTY_STEPS.map((step) => (
          <li key={step.title} className={styles.step}>
            <h3 className={styles.cardTitle}>{step.title}</h3>
            <p className={styles.cardText}>{step.text}</p>
          </li>
        ))}
      </ol>
      <div className={styles.inlineLinks}>
        <Link href="/soporte/contacto" className={styles.inlineLink}>
          Solicitar una revisión
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <Link href="/soporte/preguntas-frecuentes" className={styles.inlineLink}>
          Preguntas sobre devoluciones
        </Link>
      </div>
    </section>
  );
}
