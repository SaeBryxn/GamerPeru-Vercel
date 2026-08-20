export type MotionPreference = "unknown" | "reduce" | "no-preference";

/**
 * Pure guard determining whether a motion preference update represents a runtime
 * user transition that requires immediately pausing active video playback.
 *
 * Rules:
 * 1. `no-preference` -> `reduce`: TRUE (User toggled prefers-reduced-motion on mid-session; pause immediately).
 * 2. `unknown` -> `reduce`: FALSE (Initial preference resolution on mount; must NOT cancel explicit manual playback).
 * 3. Any other transition: FALSE.
 */
export function shouldPauseForReducedMotionTransition(
  previous: MotionPreference,
  current: MotionPreference
): boolean {
  return previous === "no-preference" && current === "reduce";
}
