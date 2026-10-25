"use client";

import React from "react";
import { LazyMotion } from "framer-motion";

const loadFeatures = () => import("./motion-features").then((module) => module.default);

/**
 * Components animate through framer-motion's `m`, which leaves the animation engine out of the
 * first-load bundle; this loads it as a separate chunk right after hydration. domMax because the
 * site uses drag (home rails) and shared layout (account and admin nav markers).
 *
 * `strict` throws if a `motion.*` component slips back in, since one would pull the whole engine
 * into every page again.
 */
export function MotionProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}
