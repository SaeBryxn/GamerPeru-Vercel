"use client";

import React from "react";
import { m, type Variants } from "framer-motion";
import { AlertTriangle, ArrowRight, XCircle } from "lucide-react";
import {
  getReadinessGuidance,
  type ProductEditorSection,
} from "@/lib/admin/catalog/readiness-guidance";
import styles from "./quality-checklist.module.css";

export interface QualityIssue {
  code: string;
  message: string;
}

interface QualityChecklistProps {
  title: string;
  tone: "blocker" | "warning";
  issues: QualityIssue[];
  onJump: (section: ProductEditorSection) => void;
  testId: string;
  itemTestIdPrefix: string;
}

const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};

const rowVariants: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } },
};

const arrowVariants: Variants = {
  rest: { x: 0 },
  hover: { x: 3, transition: { type: "spring", stiffness: 500, damping: 28 } },
};

export function QualityChecklist({
  title,
  tone,
  issues,
  onJump,
  testId,
  itemTestIdPrefix,
}: QualityChecklistProps) {
  const Icon = tone === "blocker" ? XCircle : AlertTriangle;

  return (
    <div className={styles.group} data-testid={testId}>
      <div className={styles.heading}>
        <strong>{title}</strong>
        <span className={styles.count}>{issues.length}</span>
      </div>
      <m.ul className={styles.list} variants={listVariants} initial="hidden" animate="visible">
        {issues.map((issue) => {
          const guidance = getReadinessGuidance(issue.code);
          return (
            <m.li
              key={issue.code}
              className={styles.row}
              variants={rowVariants}
              data-testid={`${itemTestIdPrefix}-${issue.code}`}
            >
              <Icon
                size={16}
                className={tone === "blocker" ? styles.iconBlocker : styles.iconWarning}
                aria-hidden="true"
              />
              <div className={styles.body}>
                <span className={styles.action}>{guidance.action}</span>
                <span className={styles.detail}>{issue.message}</span>
              </div>
              <m.a
                href={`#${guidance.section}`}
                onClick={(event) => {
                  event.preventDefault();
                  onJump(guidance.section);
                }}
                className={styles.jump}
                initial="rest"
                animate="rest"
                whileHover="hover"
                whileFocus="hover"
                aria-label={`Ir a resolver: ${guidance.action}`}
                data-testid={`${itemTestIdPrefix}-jump-${issue.code}`}
              >
                <span>Ir</span>
                <m.span variants={arrowVariants} className={styles.arrow}>
                  <ArrowRight size={13} aria-hidden="true" />
                </m.span>
              </m.a>
            </m.li>
          );
        })}
      </m.ul>
    </div>
  );
}
