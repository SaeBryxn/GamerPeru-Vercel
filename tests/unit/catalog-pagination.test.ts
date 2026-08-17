import { describe, expect, it } from "vitest";
import { CATALOG_PAGE_SIZE, getPaginationBounds, parsePageParam } from "@/lib/catalog/pagination";

describe("Pagination Parameter Parser (parsePageParam)", () => {
  it("defaults to page 1 for undefined or empty string", () => {
    expect(parsePageParam(undefined)).toEqual({
      page: 1,
      isInvalid: false,
      isExplicitPageOne: false,
    });
    expect(parsePageParam("")).toEqual({
      page: 1,
      isInvalid: false,
      isExplicitPageOne: false,
    });
  });

  it("identifies explicit ?page=1 for canonical normalization redirect", () => {
    expect(parsePageParam("1")).toEqual({
      page: 1,
      isInvalid: false,
      isExplicitPageOne: true,
    });
    expect(parsePageParam(" 1 ")).toEqual({
      page: 1,
      isInvalid: false,
      isExplicitPageOne: true,
    });
  });

  it("parses valid integer pages >= 2", () => {
    expect(parsePageParam("2")).toEqual({
      page: 2,
      isInvalid: false,
      isExplicitPageOne: false,
    });
    expect(parsePageParam("10")).toEqual({
      page: 10,
      isInvalid: false,
      isExplicitPageOne: false,
    });
  });

  it("flags non-numeric or malformed values as invalid", () => {
    expect(parsePageParam("abc")).toEqual({
      page: 1,
      isInvalid: true,
      isExplicitPageOne: false,
    });
    expect(parsePageParam("1.5")).toEqual({
      page: 1,
      isInvalid: true,
      isExplicitPageOne: false,
    });
    expect(parsePageParam("0")).toEqual({
      page: 1,
      isInvalid: true,
      isExplicitPageOne: false,
    });
    expect(parsePageParam("-5")).toEqual({
      page: 1,
      isInvalid: true,
      isExplicitPageOne: false,
    });
    expect(parsePageParam("NaN")).toEqual({
      page: 1,
      isInvalid: true,
      isExplicitPageOne: false,
    });
    expect(parsePageParam("Infinity")).toEqual({
      page: 1,
      isInvalid: true,
      isExplicitPageOne: false,
    });
  });

  it("flags array parameters as invalid", () => {
    expect(parsePageParam(["1", "2"])).toEqual({
      page: 1,
      isInvalid: true,
      isExplicitPageOne: false,
    });
  });
});

describe("Pagination Bounds Calculator (getPaginationBounds)", () => {
  it("computes bounds for single page results", () => {
    const bounds = getPaginationBounds(8, 1, CATALOG_PAGE_SIZE);
    expect(bounds.totalPages).toBe(1);
    expect(bounds.isOutOfBounds).toBe(false);
    expect(bounds.hasNextPage).toBe(false);
    expect(bounds.hasPrevPage).toBe(false);
  });

  it("computes bounds for multi-page results", () => {
    const bounds = getPaginationBounds(25, 1, 12);
    expect(bounds.totalPages).toBe(3);
    expect(bounds.isOutOfBounds).toBe(false);
    expect(bounds.hasNextPage).toBe(true);
    expect(bounds.hasPrevPage).toBe(false);

    const boundsMiddle = getPaginationBounds(25, 2, 12);
    expect(boundsMiddle.hasNextPage).toBe(true);
    expect(boundsMiddle.hasPrevPage).toBe(true);
    expect(boundsMiddle.isOutOfBounds).toBe(false);

    const boundsLast = getPaginationBounds(25, 3, 12);
    expect(boundsLast.hasNextPage).toBe(false);
    expect(boundsLast.hasPrevPage).toBe(true);
    expect(boundsLast.isOutOfBounds).toBe(false);
  });

  it("flags out of bounds when page exceeds total pages", () => {
    const bounds = getPaginationBounds(25, 4, 12);
    expect(bounds.totalPages).toBe(3);
    expect(bounds.isOutOfBounds).toBe(true);
    expect(bounds.hasNextPage).toBe(false);
    expect(bounds.hasPrevPage).toBe(false);
  });

  it("handles zero total items", () => {
    const bounds = getPaginationBounds(0, 1, 12);
    expect(bounds.totalPages).toBe(0);
    expect(bounds.isOutOfBounds).toBe(false);
    expect(bounds.hasNextPage).toBe(false);
    expect(bounds.hasPrevPage).toBe(false);
  });
});
