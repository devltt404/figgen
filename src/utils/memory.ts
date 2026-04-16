/**
 * Long-term memory — file-based design guidelines accumulated across sessions.
 *
 * Storage: output/memory/guidelines.json
 * Capacity: 30 guidelines max (evict lowest hitCount, tie-break by oldest addedAt)
 * Managed exclusively by the Judge agent.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GuidelinesFileSchema, type GuidelinesFile, type Guideline } from "../types/index.js";

const MEMORY_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../output/memory",
);
const GUIDELINES_PATH = path.join(MEMORY_DIR, "guidelines.json");
const MAX_GUIDELINES = 30;

async function loadFile(): Promise<GuidelinesFile> {
  try {
    const raw = await fs.readFile(GUIDELINES_PATH, "utf-8");
    return GuidelinesFileSchema.parse(JSON.parse(raw));
  } catch {
    return { version: 1, guidelines: [] };
  }
}

async function saveFile(data: GuidelinesFile): Promise<void> {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
  await fs.writeFile(GUIDELINES_PATH, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Read all guideline texts. Increments hitCount for every guideline on each read.
 */
export async function readGuidelines(): Promise<string[]> {
  const data = await loadFile();
  if (data.guidelines.length === 0) return [];

  for (const g of data.guidelines) {
    g.hitCount += 1;
  }
  await saveFile(data);

  return data.guidelines.map((g) => g.text);
}

/**
 * Check if a new guideline is a duplicate of an existing one (substring match).
 */
function isDuplicate(existing: Guideline[], text: string): boolean {
  const lower = text.toLowerCase();
  return existing.some((g) => {
    const gl = g.text.toLowerCase();
    return gl.includes(lower) || lower.includes(gl);
  });
}

/**
 * Evict the least-useful guideline: lowest hitCount, then oldest addedAt.
 */
function evictOne(guidelines: Guideline[]): Guideline[] {
  if (guidelines.length === 0) return guidelines;

  let worstIdx = 0;
  for (let i = 1; i < guidelines.length; i++) {
    const worst = guidelines[worstIdx];
    const curr = guidelines[i];
    if (
      curr.hitCount < worst.hitCount ||
      (curr.hitCount === worst.hitCount && curr.addedAt < worst.addedAt)
    ) {
      worstIdx = i;
    }
  }
  guidelines.splice(worstIdx, 1);
  return guidelines;
}

/**
 * Append new guidelines to memory. Handles deduplication and capacity eviction.
 */
export async function writeGuidelines(
  newGuidelines: string[],
  source: string,
): Promise<number> {
  const data = await loadFile();
  const now = new Date().toISOString();
  let added = 0;

  for (const text of newGuidelines) {
    if (!text.trim()) continue;
    if (isDuplicate(data.guidelines, text)) continue;

    while (data.guidelines.length >= MAX_GUIDELINES) {
      evictOne(data.guidelines);
    }

    data.guidelines.push({
      id: `g-${crypto.randomBytes(4).toString("hex")}`,
      text: text.trim(),
      source,
      addedAt: now,
      hitCount: 0,
    });
    added++;
  }

  if (added > 0) {
    await saveFile(data);
  }
  return added;
}
