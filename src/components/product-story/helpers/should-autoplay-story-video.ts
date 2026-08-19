export interface ShouldAutoplayStoryVideoParams {
  isIntersecting: boolean;
  intersectionRatio: number;
  prefersReducedMotion: boolean;
  hasError?: boolean;
}

/**
 * Pure decision helper for viewport-based story video autoplay.
 *
 * Automatic playback is allowed IF AND ONLY IF:
 * 1. prefersReducedMotion is false
 * 2. hasError is false
 * 3. isIntersecting is true
 * 4. intersectionRatio is >= 0.5 (meaningful viewport visibility)
 *
 * Anything else returns false (video must pause).
 */
export function shouldAutoplayStoryVideo({
  isIntersecting,
  intersectionRatio,
  prefersReducedMotion,
  hasError = false,
}: ShouldAutoplayStoryVideoParams): boolean {
  if (prefersReducedMotion || hasError) {
    return false;
  }
  return isIntersecting && intersectionRatio >= 0.5;
}
