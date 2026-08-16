import React from "react";
import type { LucideIcon, LucideProps } from "lucide-react";

export type IconSize = "sm" | "md" | "lg" | "xl";

export interface IconGeometry {
  size: number;
  strokeWidth: number;
}

export const CANONICAL_ICON_GEOMETRY: Record<IconSize, IconGeometry> = {
  sm: { size: 16, strokeWidth: 1.25 },
  md: { size: 20, strokeWidth: 1.5 },
  lg: { size: 24, strokeWidth: 1.5 },
  xl: { size: 32, strokeWidth: 1.5 },
};

export interface IconProps extends Omit<React.SVGAttributes<SVGSVGElement>, "size"> {
  icon: LucideIcon | React.ComponentType<LucideProps>;
  size?: IconSize;
  className?: string;
}

export function Icon({
  icon: IconComponent,
  size = "md",
  className,
  "aria-hidden": ariaHidden = true,
  ...rest
}: IconProps) {
  const geometry = CANONICAL_ICON_GEOMETRY[size] ?? CANONICAL_ICON_GEOMETRY.md;

  return (
    <IconComponent
      size={geometry.size}
      strokeWidth={geometry.strokeWidth}
      aria-hidden={ariaHidden}
      className={className}
      {...rest}
    />
  );
}
