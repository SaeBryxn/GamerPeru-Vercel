"use client";

import React, { useState, type ComponentProps } from "react";
import NextLink from "next/link";

type AppLinkProps = ComponentProps<typeof NextLink>;

/**
 * next/link that prefetches on intent instead of on sight.
 *
 * On Workers every prefetch is a server render, and the first render of a route in an isolate
 * also loads and compiles that route's code (150–430 ms of CPU measured in production against a
 * 10 ms Free-plan budget). Prefetching every link in the viewport made one page view fan out
 * into 6–8 of those renders — the main source of Error 1102. Here a link starts with prefetch
 * off and turns Next's own prefetch on once the person points at it, focuses it or touches it;
 * `prefetch={false}` keeps it off for good.
 */
export default function AppLink({
  prefetch,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: AppLinkProps) {
  const [intent, setIntent] = useState(false);
  const signal = () => {
    if (!intent && prefetch !== false) setIntent(true);
  };

  return (
    <NextLink
      {...props}
      prefetch={intent ? prefetch : false}
      onMouseEnter={(event) => {
        signal();
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        signal();
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        signal();
        onTouchStart?.(event);
      }}
    />
  );
}
