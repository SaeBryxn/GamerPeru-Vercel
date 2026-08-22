"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface UseModalFocusOptions {
  isOpen: boolean;
  onClose: () => void;
  isPending?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Manages accessible focus containment, initial focus, and focus restoration for modal dialogs.
 *
 * Invariants:
 * 1. Focus Containment: Tab and Shift+Tab wrap strictly within modal focusable elements.
 * 2. Focus Isolation: Focus cannot move into background page, sidebar, or header.
 * 3. Initial Focus: Directs initial focus to initialFocusRef (or first focusable control).
 * 4. Focus Restoration: Returns focus to invoking control if mounted, or fallback target.
 * 5. Pending State Safety: Suppresses Escape key and backdrop dismissal while mutations are in-flight.
 */
export function useModalFocus<T extends HTMLElement = HTMLDivElement>({
  isOpen,
  onClose,
  isPending = false,
  initialFocusRef,
  returnFocusRef,
  fallbackFocusRef,
}: UseModalFocusOptions) {
  const modalRef = useRef<T>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  // Capture invoker and set initial focus on open
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedElementRef.current =
      returnFocusRef?.current ?? (document.activeElement as HTMLElement | null);

    const timer = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length > 0) {
          focusable[0]?.focus();
        } else {
          modalRef.current.focus();
        }
      }
    }, 10);

    return () => clearTimeout(timer);
  }, [isOpen, initialFocusRef, returnFocusRef]);

  // Handle Tab trapping and Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!modalRef.current) return;

      if (e.key === "Escape") {
        if (!isPending) {
          e.preventDefault();
          onClose();
        }
        return;
      }

      if (e.key === "Tab") {
        const focusable = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        );

        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: moving backwards
          if (
            document.activeElement === firstElement ||
            !modalRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          // Tab: moving forwards
          if (
            document.activeElement === lastElement ||
            !modalRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isPending, onClose]);

  // Restore focus on close / unmount
  useEffect(() => {
    return () => {
      if (isOpen) {
        const target = previouslyFocusedElementRef.current;
        if (target && document.body.contains(target)) {
          target.focus();
        } else if (fallbackFocusRef?.current && document.body.contains(fallbackFocusRef.current)) {
          fallbackFocusRef.current.focus();
        }
      }
    };
  }, [isOpen, fallbackFocusRef]);

  return { modalRef, previouslyFocusedElementRef };
}
