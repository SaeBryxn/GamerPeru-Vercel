// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("deja de consultar cuando pasa stopAfterMs aunque el estado no cambie", async () => {
  const poll = vi.fn(async () => true);
  renderHook(() => useVisiblePolling("job", true, poll, 1000, 1000, 3500));
  await vi.advanceTimersByTimeAsync(3000);
  const beforeLimit = poll.mock.calls.length;
  expect(beforeLimit).toBe(3);
  await vi.advanceTimersByTimeAsync(10_000);
  // The run that was already scheduled before the limit may finish; nothing after it.
  expect(poll.mock.calls.length).toBeLessThanOrEqual(beforeLimit + 1);
});
