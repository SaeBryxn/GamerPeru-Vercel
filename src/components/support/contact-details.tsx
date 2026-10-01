import React from "react";
import { Clock, Mail, MapPin, MessageCircle, ShieldCheck } from "lucide-react";
import { BrandGlyph } from "@/components/ui";
import { COMPANY } from "@/config/company";
import { publicEnv } from "@/config/public-env";
import { SOCIAL_LINKS } from "@/config/social-links";
import styles from "./contact-details.module.css";

/** Company facts beside the contact form. Only configured channels are listed. */
export function ContactDetails() {
  const whatsapp = publicEnv.NEXT_PUBLIC_WHATSAPP_NUMBER;
  const socials = SOCIAL_LINKS.filter((link) => link.href);

  const rows = [
    whatsapp && {
      icon: MessageCircle,
      label: "WhatsApp",
      value: `+${whatsapp}`,
      href: `https://wa.me/${whatsapp}`,
    },
    COMPANY.contactEmail && {
      icon: Mail,
      label: "Correo",
      value: COMPANY.contactEmail,
      href: `mailto:${COMPANY.contactEmail}`,
    },
    COMPANY.serviceHours && { icon: Clock, label: "Horario", value: COMPANY.serviceHours },
    COMPANY.address && { icon: MapPin, label: "Dirección", value: COMPANY.address },
  ].filter(Boolean) as { icon: typeof Mail; label: string; value: string; href?: string }[];

  return (
    <div className={styles.details}>
      <div>
        <h2 className={styles.heading}>Hablemos</h2>
        <p className={styles.text}>
          Resolvemos dudas sobre productos, pedidos y pagos. Si tu consulta es sobre un pedido,
          incluye su número para ubicarlo más rápido.
        </p>
      </div>

      {rows.length > 0 && (
        <ul className={styles.channels}>
          {rows.map((row) => (
            <li key={row.label} className={styles.channel}>
              <span className={styles.channelIcon} aria-hidden="true">
                <row.icon size={18} />
              </span>
              <span className={styles.channelBody}>
                <span className={styles.channelLabel}>{row.label}</span>
                {row.href ? (
                  <a
                    href={row.href}
                    className={styles.channelValue}
                    {...(row.href.startsWith("http")
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {row.value}
                  </a>
                ) : (
                  <span className={styles.channelValue}>{row.value}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {socials.length > 0 && (
        <ul className={styles.socials} aria-label="Redes sociales de Gamer Perú">
          {socials.map((link) => (
            <li key={link.id}>
              <a
                href={link.href}
                className={styles.social}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${link.label} de Gamer Perú`}
              >
                <BrandGlyph id={link.id} size={18} />
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className={styles.company}>
        <ShieldCheck size={16} aria-hidden="true" />
        <span>
          {COMPANY.tradeName} es operada por {COMPANY.legalName}
          {COMPANY.ruc ? `, RUC ${COMPANY.ruc}` : ""}.
        </span>
      </p>
    </div>
  );
}
