/**
 * localStorage helpers — wrap browser storage with safe JSON encoding and
 * graceful fallbacks when storage is unavailable (private mode, quota, etc.).
 */

const KEY_URL = "figgen.figmaUrl";
const KEY_MAX_ITER = "figgen.maxIter";
const KEY_RECENT_URLS = "figgen.recentUrls";

const MAX_RECENT = 5;

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / disabled storage
  }
}

export function loadFigmaUrl(defaultUrl: string): string {
  return safeGet(KEY_URL, defaultUrl);
}
export function saveFigmaUrl(url: string): void {
  safeSet(KEY_URL, url);
}

export function loadMaxIter(defaultValue: number): number {
  const v = safeGet<number>(KEY_MAX_ITER, defaultValue);
  return typeof v === "number" && v >= 0 ? v : defaultValue;
}
export function saveMaxIter(maxIter: number): void {
  safeSet(KEY_MAX_ITER, maxIter);
}

export function loadRecentUrls(): string[] {
  const v = safeGet<string[]>(KEY_RECENT_URLS, []);
  return Array.isArray(v) ? v.filter((s) => typeof s === "string") : [];
}

/**
 * Insert `url` at the head of the recent list, dedup, and cap at MAX_RECENT.
 * Returns the new list.
 */
export function pushRecentUrl(url: string): string[] {
  const trimmed = url.trim();
  if (!trimmed) return loadRecentUrls();
  const existing = loadRecentUrls().filter((u) => u !== trimmed);
  const next = [trimmed, ...existing].slice(0, MAX_RECENT);
  safeSet(KEY_RECENT_URLS, next);
  return next;
}
