import { z } from "zod";

const HTML_TAG_REGEX = /<[^>]*>/;

/** Bounded plain text: rejects anything that looks like an HTML tag. */
export const SafeString = (minLen: number, maxLen: number) =>
  z
    .string()
    .min(minLen)
    .max(maxLen)
    .refine((val) => !HTML_TAG_REGEX.test(val), {
      message: "Forbidden HTML tags or characters in text payload",
    });
