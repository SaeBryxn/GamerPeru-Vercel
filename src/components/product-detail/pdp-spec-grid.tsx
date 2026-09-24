import React from "react";
import {
  Activity,
  BatteryMedium,
  CircleDot,
  Cpu,
  Crosshair,
  Headphones,
  Keyboard,
  Layers,
  Maximize2,
  Package,
  Square,
  MousePointerClick,
  Ruler,
  Scan,
  Shapes,
  Weight,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/ui";
import type { FormattedSpecRow } from "./hardware-specifications";
import styles from "./pdp-spec-grid.module.css";

// Matched against "key label" in order; the first hit picks the icon.
const SPEC_ICON_RULES: ReadonlyArray<[RegExp, LucideIcon]> = [
  [/audio|driver|impedan/i, Headphones],
  [/formato|layout/i, Keyboard],
  [/superficie|surface/i, Square],
  [/accessory|accesorio/i, Package],
  [/tama|size/i, Maximize2],
  [/material/i, Layers],
  [/mcu|chip|procesador/i, Cpu],
  [/polling|hz|frecuencia/i, Activity],
  [/switch/i, MousePointerClick],
  [/bater|battery/i, BatteryMedium],
  [/peso|weight/i, Weight],
  [/sensor/i, Scan],
  [/dpi|cpi/i, Crosshair],
  [/forma|shape/i, Shapes],
  [/largo|ancho|alto|length|width|height|dimens/i, Ruler],
];

function iconFor(row: FormattedSpecRow): LucideIcon {
  const haystack = `${row.key} ${row.label}`;
  return SPEC_ICON_RULES.find(([pattern]) => pattern.test(haystack))?.[1] ?? CircleDot;
}

export interface PdpSpecGridProps {
  rows: FormattedSpecRow[];
  /** Highlights shown in the grid; the full list lives in the specifications accordion. */
  limit?: number;
}

/** Two-column highlights box: gray icon + label + value per cell. */
export function PdpSpecGrid({ rows, limit = 8 }: PdpSpecGridProps) {
  if (rows.length === 0) return null;

  return (
    <dl className={styles.specGrid} data-testid="pdp-spec-grid">
      {rows.slice(0, limit).map((row) => (
        <div key={row.key} className={styles.specCell}>
          <dt className={styles.specLabel}>
            <Icon icon={iconFor(row)} size="md" className={styles.specIcon} aria-hidden="true" />
            {row.label}
          </dt>
          <dd className={styles.specValue}>{row.formattedValue}</dd>
        </div>
      ))}
    </dl>
  );
}
