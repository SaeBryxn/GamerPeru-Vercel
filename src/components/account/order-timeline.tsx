import React from "react";
import { Check, Truck, X } from "lucide-react";
import type { OrderTimelineStep } from "@/lib/account/order-timeline";
import styles from "./order-timeline.module.css";

// Fixed zone so the server render and the hydrated client agree on the time shown.
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("es-PE", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Lima",
});

const STATE_CLASS: Record<OrderTimelineStep["state"], string | undefined> = {
  done: styles.done,
  current: styles.current,
  upcoming: styles.upcoming,
  closed: styles.closed,
};

const STATE_LABEL: Record<OrderTimelineStep["state"], string> = {
  done: "completado",
  current: "en curso",
  upcoming: "pendiente",
  closed: "cerrado",
};

/** Vertical stepper of an order's progress, newest step at the bottom. */
export function OrderTimeline({
  steps,
  trackingUrl,
}: {
  steps: readonly OrderTimelineStep[];
  trackingUrl: string | null;
}) {
  return (
    <ol className={styles.timeline} data-testid="order-timeline">
      {steps.map((step) => (
        <li
          key={step.key}
          className={`${styles.step} ${STATE_CLASS[step.state] ?? ""}`}
          aria-current={step.state === "current" ? "step" : undefined}
          data-testid={`order-timeline-${step.key}`}
          data-state={step.state}
        >
          <span className={styles.marker} aria-hidden="true">
            {step.state === "done" && <Check size={14} strokeWidth={3} />}
            {step.state === "closed" && <X size={14} strokeWidth={3} />}
          </span>
          <div className={styles.body}>
            <span className={styles.label}>
              {step.label}
              <span className={styles.visuallyHidden}> ({STATE_LABEL[step.state]})</span>
            </span>
            {step.at && (
              <time className={styles.time} dateTime={step.at}>
                {DATE_TIME_FORMAT.format(new Date(step.at))}
              </time>
            )}
            {step.detail && <span className={styles.detail}>{step.detail}</span>}
            {step.key === "shipped" && step.state === "done" && trackingUrl && (
              <a
                className={styles.trackingLink}
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Truck size={14} aria-hidden="true" />
                Rastrear envío
              </a>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
