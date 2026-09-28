"use client";

import { useEffect, useRef, useState } from "react";
import { getQueryCodePointLength } from "@/lib/search/normalization";
import { MIN_SEARCH_QUERY_LENGTH } from "@/lib/search/types";

export interface PredictiveProduct {
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  brand: { name: string; slug: string };
  startingPriceCents: number;
  primaryMedia: {
    src: string | null;
    altText: string | null;
    width: number | null;
    height: number | null;
  } | null;
}

export interface PredictiveEntity {
  name: string;
  slug: string;
}

export type PredictiveSearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      products: PredictiveProduct[];
      brands: PredictiveEntity[];
      categories: PredictiveEntity[];
    };

const DEBOUNCE_MS = 200;

/**
 * Live suggestions from /api/search/predictive, the same catalog the /buscar page reads.
 * Requests are debounced, and a newer query aborts the older request so a slow response can
 * never overwrite fresher results.
 */
export function usePredictiveSearch(query: string): PredictiveSearchState {
  const [state, setState] = useState<PredictiveSearchState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const cleanQuery = query.trim();
    controllerRef.current?.abort();

    if (getQueryCodePointLength(cleanQuery) < MIN_SEARCH_QUERY_LENGTH) {
      // Resets synchronously so a cleared field never shows the previous results.
      setState({ status: "idle" });
      return;
    }

    setState({ status: "loading" });
    const controller = new AbortController();
    controllerRef.current = controller;

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/predictive?q=${encodeURIComponent(cleanQuery)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          setState({ status: "error" });
          return;
        }
        const data = (await response.json()) as {
          products?: PredictiveProduct[];
          brands?: PredictiveEntity[];
          categories?: PredictiveEntity[];
        };
        setState({
          status: "ready",
          products: data.products ?? [],
          brands: data.brands ?? [],
          categories: data.categories ?? [],
        });
      } catch (error) {
        if ((error as Error)?.name !== "AbortError") setState({ status: "error" });
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return state;
}
