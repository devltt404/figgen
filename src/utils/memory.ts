/**
 * Long-term memory — plain-text design guidelines accumulated across sessions.
 *
 * Storage: output/memory/guidelines.md
 * Format: one bullet point per line ("- guideline text")
 * Capacity: 30 lines max, oldest removed first when full.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MEMORY_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../output/memory",
);
const GUIDELINES_PATH = path.join(MEMORY_DIR, "guidelines.md");
const MAX_GUIDELINES = 30;

/**
 * Read all guideline texts from the plain-text file.
 */
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
 * Clear all guidelines from memory.
 */
export async function clearMemory(): Promise<void> {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
  await fs.writeFile(GUIDELINES_PATH, "", "utf-8");
}

/**
 * Append new guidelines to memory. Simple substring dedup, cap at MAX_GUIDELINES.
 */
export async function writeGuidelines(
  newGuidelines: string[],
): Promise<number> {
  const existing = await readGuidelines();
  let added = 0;

  for (const text of newGuidelines) {
    const trimmed = text.trim();
    if (!trimmed) continue;

    // Simple dedup: skip if existing guideline contains this or vice versa
    const lower = trimmed.toLowerCase();
    const isDupe = existing.some((e) => {
      const el = e.toLowerCase();
      return el.includes(lower) || lower.includes(el);
    });
    if (isDupe) continue;

    existing.push(trimmed);
    added++;
  }

  // Cap at MAX_GUIDELINES — remove oldest (top of file) first
  while (existing.length > MAX_GUIDELINES) {
    existing.shift();
  }

  if (added > 0) {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
    const content = existing.map((g) => `- ${g}`).join("\n") + "\n";
    await fs.writeFile(GUIDELINES_PATH, content, "utf-8");
  }

  return added;
}
