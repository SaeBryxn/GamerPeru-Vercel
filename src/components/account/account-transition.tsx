"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "framer-motion";

const ENTER_TRANSITION: Transition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] };
const LEAVE_TRANSITION: Transition = { duration: 0.14, ease: [0.4, 0, 1, 1] };

interface AccountTransitionValue {
  /** Fades the current section out, then navigates; the next section fades in on arrival. */
  navigate: (href: string) => void;
  leavingFrom: string | null;
  completeLeave: () => void;
}

const AccountTransitionContext = createContext<AccountTransitionValue | null>(null);

function useAccountTransition(): AccountTransitionValue {
  const value = useContext(AccountTransitionContext);
  if (!value) throw new Error("Account transitions need an AccountTransitionProvider");
  return value;
}

export function useAccountNavigate(): AccountTransitionValue["navigate"] {
  return useAccountTransition().navigate;
}

/**
 * Section switching for the account hub.
 *
 * Each section is its own route, so its data and authorization stay on the server. An exiting
 * route element already renders the incoming page, so a section cannot simply animate out on
 * unmount: a nav click fades it out first and navigates once it is gone. Arrivals that skip the
 * nav (back/forward, links inside a section) still get the entrance.
 */
export function AccountTransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const [leave, setLeave] = useState<{ from: string; to: string } | null>(null);

  // Once the route has moved on, the leave is over; returning to that section later must show it.
  if (leave && leave.from !== pathname) {
    setLeave(null);
  }

  const navigate = useCallback(
    (href: string) => {
      if (href === pathname) return;
      // Already faded out (or reduced motion): there is no exit left to wait for.
      if (prefersReducedMotion || leave) {
        if (leave) setLeave({ from: leave.from, to: href });
        router.push(href);
        return;
      }
      setLeave({ from: pathname, to: href });
    },
    [leave, pathname, prefersReducedMotion, router]
  );

  const leaveTarget = leave?.to ?? null;
  const completeLeave = useCallback(() => {
    if (leaveTarget) router.push(leaveTarget);
  }, [leaveTarget, router]);

  return (
    <AccountTransitionContext.Provider
      value={{ navigate, leavingFrom: leave?.from ?? null, completeLeave }}
    >
      {children}
    </AccountTransitionContext.Provider>
  );
}

/** The animated section slot: fade out with a slight lift, fade in rising from y: 10. */
export function AccountSection({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const { leavingFrom, completeLeave } = useAccountTransition();
  const isLeaving = leavingFrom === pathname;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={isLeaving ? { opacity: 0, y: -6 } : { opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0 } }}
        transition={isLeaving ? LEAVE_TRANSITION : ENTER_TRANSITION}
        onAnimationComplete={() => {
          if (isLeaving) completeLeave();
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
