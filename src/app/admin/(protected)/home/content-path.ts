import type { FieldPath } from "./section-fields";

type Container = Record<string, unknown> | unknown[];

export function getAt(value: unknown, path: FieldPath): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

/** Returns a copy of `value` with `next` written at `path`, copying only the containers on it. */
export function setAt<T>(value: T, path: FieldPath, next: unknown): T {
  if (path.length === 0) return next as T;
  const [key, ...rest] = path;
  const container: Container = Array.isArray(value)
    ? [...(value as unknown[])]
    : { ...((value ?? {}) as Record<string, unknown>) };
  const child = (container as Record<string | number, unknown>)[key as string | number];
  (container as Record<string | number, unknown>)[key as string | number] = setAt(
    child,
    rest,
    next
  );
  return container as T;
}

export function joinPath(path: FieldPath): string {
  return path.join(".");
}
