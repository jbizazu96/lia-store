/*
 * Client Data Cache
 *
 * A small in-memory cache for safe read models. Entries are scoped to the
 * current Firebase UID (or to the public catalog) and never persist to disk,
 * so a later browser session cannot read a previous account's cached data.
 */

import {
  auth,
} from "@/lib/firebase";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const entries = new Map<string, CacheEntry<unknown>>();

function scopedKey(
  key: string,
  scope: "current-user" | "public",
): string {
  const identity = scope === "public"
    ? "public"
    : auth.currentUser?.uid ?? "anonymous";

  return `${identity}:${key}`;
}

export function readCached<T>(
  key: string,
  options: {
    scope?: "current-user" | "public";
  } = {},
): T | null {
  const entry = entries.get(
    scopedKey(key, options.scope ?? "current-user"),
  ) as CacheEntry<T> | undefined;

  if (!entry || entry.expiresAt <= Date.now()) {
    return null;
  }

  return entry.value;
}

export function writeCached<T>(
  key: string,
  value: T,
  options: {
    ttlMs: number;
    scope?: "current-user" | "public";
  },
): T {
  entries.set(scopedKey(key, options.scope ?? "current-user"), {
    value,
    expiresAt: Date.now() + options.ttlMs,
  });

  return value;
}

export async function loadCached<T>(
  key: string,
  loader: () => Promise<T>,
  options: {
    ttlMs: number;
    scope?: "current-user" | "public";
  },
): Promise<T> {
  const cached = readCached<T>(key, options);
  if (cached !== null) {
    /* Keep navigation instant, then refresh the short-lived view model. */
    void loader()
      .then((value) => writeCached(key, value, options))
      .catch(() => undefined);
    return cached;
  }

  return writeCached(key, await loader(), options);
}

export function invalidateCached(
  key: string,
  options: {
    scope?: "current-user" | "public";
  } = {},
): void {
  entries.delete(scopedKey(key, options.scope ?? "current-user"));
}

export function clearCurrentUserCache(): void {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  for (const key of entries.keys()) {
    if (key.startsWith(`${uid}:`)) entries.delete(key);
  }
}

export function clearClientDataCache(): void {
  entries.clear();
}
