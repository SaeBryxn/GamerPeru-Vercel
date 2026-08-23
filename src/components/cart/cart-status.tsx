"use client";

import React from "react";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { Icon } from "@/components/ui";

export interface CartStatusAlertProps {
  type: "error" | "warning" | "info";
  message: string;
  className?: string;
}

export function CartStatusAlert({
  type,
  message,
  className,
}: CartStatusAlertProps): React.JSX.Element {
  const icon = type === "error" ? AlertCircle : AlertTriangle;
  const color = type === "error" ? "#ff4d4f" : "#faad14";
  const bg = type === "error" ? "rgba(255, 77, 79, 0.1)" : "rgba(250, 173, 20, 0.1)";

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 12px",
        borderRadius: "var(--radius-sm, 6px)",
        backgroundColor: bg,
        border: `1px solid ${color}`,
        color: "var(--color-text-primary, #ffffff)",
        fontFamily: "var(--font-body)",
        fontSize: "13px",
      }}
      className={className}
      data-testid={`cart-status-alert-${type}`}
    >
      <Icon icon={icon} size="sm" style={{ color, flexShrink: 0 }} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
