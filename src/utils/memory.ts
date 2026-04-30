/**
 * Long-term memory — plain-text design guidelines accumulated across sessions.
 *
 * Storage: output/memory/guidelines.md (one bullet per line)
 * Capacity: MAX_GUIDELINES; oldest entries are evicted FIFO when full.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MEMORY_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../output/memory",
);
const GUIDELINES_PATH = path.join(MEMORY_DIR, "guidelines.md");
const MAX_GUIDELINES = 10;

export async function readGuidelines(): Promise<string[]> {
  try {
    const raw = await fs.readFile(GUIDELINES_PATH, "utf-8");
    return raw
      .split("\n")
      .map((line) => line.replace(/^-\s*/, "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Append new guidelines, deduping by substring overlap (case-insensitive).
 * Returns the number of newly-added entries. Caps total at MAX_GUIDELINES,
 * evicting oldest first.
 */
export async function writeGuidelines(
  newGuidelines: string[],
): Promise<number> {
  const existing = await readGuidelines();
  let added = 0;

  for (const text of newGuidelines) {
    const trimmed = text.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();
    const isDupe = existing.some((e) => {
      const el = e.toLowerCase();
      return el.includes(lower) || lower.includes(el);
    });
    if (isDupe) continue;

    existing.push(trimmed);
    added++;
  }

  while (existing.length > MAX_GUIDELINES) existing.shift();

  if (added > 0) {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
    const content = existing.map((g) => `- ${g}`).join("\n") + "\n";
    await fs.writeFile(GUIDELINES_PATH, content, "utf-8");
  }

  return added;
}
