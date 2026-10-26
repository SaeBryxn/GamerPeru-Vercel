import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

import { summarizeRatingCounts } from "@/lib/reviews/reader";
import { formatReviewAuthor } from "@/lib/reviews/types";

describe("summarizeRatingCounts", () => {
  it("averages approved ratings to one decimal and counts each star", () => {
    expect(
      summarizeRatingCounts([
        { rating: 5, count: 3 },
        { rating: 4, count: 1 },
        { rating: 1, count: 1 },
      ])
    ).toEqual({ average: 4, count: 5, distribution: [1, 0, 0, 1, 3] });

    expect(
      summarizeRatingCounts([
        { rating: 5, count: 2 },
        { rating: 4, count: 1 },
      ]).average
    ).toBe(4.7);
  });

  it("has no average without reviews and ignores ratings out of range", () => {
    expect(summarizeRatingCounts([])).toEqual({
      average: null,
      count: 0,
      distribution: [0, 0, 0, 0, 0],
    });
    expect(summarizeRatingCounts([{ rating: 7, count: 4 }]).count).toBe(0);
  });
});

describe("formatReviewAuthor", () => {
  it("shows the first name and the surname's initial", () => {
    expect(formatReviewAuthor("Bryan", "espejo")).toBe("Bryan E.");
    expect(formatReviewAuthor("  Ana ", "")).toBe("Ana");
    expect(formatReviewAuthor("", "")).toBe("Cliente");
  });
});
