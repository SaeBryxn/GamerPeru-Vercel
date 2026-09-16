"use client";

import React from "react";
import { AlertCircle } from "lucide-react";
import type { StoryValidationIssue } from "@/lib/admin/catalog/story-validation";
import {
  resolveTargetFromIssuePath,
  type EditorStoryBlock,
} from "@/lib/admin/catalog/story-builder-model";
import styles from "./story-builder.module.css";

interface ValidationSummaryProps {
  issues: readonly StoryValidationIssue[];
  document: readonly EditorStoryBlock[];
  onNavigateToIssue: (blockId: string | null, targetId: string) => void;
}

export function ValidationSummary({ issues, document, onNavigateToIssue }: ValidationSummaryProps) {
  if (issues.length === 0) return null;

  const count = issues.length;
  const headingText =
    count === 1
      ? "Hay 1 error que impide guardar la historia"
      : `Hay ${count} errores que impiden guardar la historia`;

  return (
    <div
      className={styles.validationSummary}
      role="alert"
      aria-live="assertive"
      data-testid="story-validation-summary"
    >
      <div className={styles.validationSummaryHeader}>
        <AlertCircle size={20} className={styles.validationSummaryIcon} aria-hidden="true" />
        <div>
          <h3>{headingText}</h3>
          <p>Haz clic en cualquier error para ir directamente al campo correspondiente:</p>
        </div>
      </div>
      <ul className={styles.validationSummaryList}>
        {issues.map((issue, index) => {
          const { blockId, targetId } = resolveTargetFromIssuePath(issue.path, document);
          return (
            <li key={`${issue.path}-${index}`}>
              <button
                type="button"
                className={styles.validationIssueLink}
                onClick={() => onNavigateToIssue(blockId, targetId)}
                data-testid={`validation-issue-${index}`}
              >
                <span className={styles.issuePath}>{issue.path}</span>: {issue.message}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
