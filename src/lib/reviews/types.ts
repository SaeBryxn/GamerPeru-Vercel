/** An approved review as the product page shows it. */
export interface PublicReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  /** ISO date of when it was written. */
  createdAt: string;
}

export interface ReviewSummary {
  /** Mean of approved ratings, one decimal; null without reviews. */
  average: number | null;
  count: number;
  /** Approved reviews per star, index 0 = one star. */
  distribution: [number, number, number, number, number];
}

export const EMPTY_REVIEW_SUMMARY: ReviewSummary = {
  average: null,
  count: 0,
  distribution: [0, 0, 0, 0, 0],
};

export const REVIEW_BODY_MIN = 10;
export const REVIEW_BODY_MAX = 2000;
export const REVIEW_TITLE_MAX = 120;

/** What the signed-in visitor can do on a product's review form. */
export type ReviewEligibility =
  | { state: "ANONYMOUS" }
  | { state: "NOT_PURCHASED" }
  | { state: "ELIGIBLE" }
  | { state: "ALREADY_REVIEWED"; status: "PENDING" | "APPROVED" | "REJECTED" };

export type SubmitReviewResult =
  | { ok: true }
  | {
      ok: false;
      reason: "UNAUTHENTICATED" | "INVALID" | "NOT_PURCHASED" | "ALREADY_REVIEWED" | "ERROR";
      message: string;
    };

/** "Bryan Espejo" -> "Bryan E.": enough to read as a person, without the full surname. */
export function formatReviewAuthor(firstName: string, lastName: string): string {
  const first = firstName.trim() || "Cliente";
  const initial = lastName.trim().charAt(0).toUpperCase();
  return (initial ? `${first} ${initial}.` : first).slice(0, 80);
}
