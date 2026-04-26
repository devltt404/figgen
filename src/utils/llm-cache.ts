/**
 * File-based LLM response cache.
 *
 * Cache key: SHA-256 of (model + system prompt + user prompt)
 * Cache location: output/llm-cache/<hash>.json
 *
 * Usage:
 *   const cached = await readCache(model, systemPrompt, userPrompt);
 *   if (cached) return cached;
 *   const response = await callLLM(...);
 *   await writeCache(model, systemPrompt, userPrompt, response);
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CACHE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../output/llm-cache",
);

function cacheKey(model: string, systemPrompt: string, userPrompt: string): string {
  return crypto
    .createHash("sha256")
    .update(model + "\0" + systemPrompt + "\0" + userPrompt)
    .digest("hex");
}

function cachePath(key: string): string {
  return path.join(CACHE_DIR, `${key}.json`);
}

export async function readCache(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> {
  const file = cachePath(cacheKey(model, systemPrompt, userPrompt));
  try {
    const raw = await fs.readFile(file, "utf-8");
    return (JSON.parse(raw) as { response: string }).response;
  } catch {
    return null;
  }
}

export async function clearLLMCache(): Promise<number> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    for (const f of files) await fs.unlink(path.join(CACHE_DIR, f));
    return files.length;
  } catch {
    return 0;
  }
}

export async function writeCache(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  response: string,
): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = cachePath(cacheKey(model, systemPrompt, userPrompt));
  await fs.writeFile(file, JSON.stringify({ model, response }, null, 2), "utf-8");
}
