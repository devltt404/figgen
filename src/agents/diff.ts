/**
 * Diff Agent — src/agents/diff.ts
 *
 * Role in the multi-agent system:
 *   Fourth agent in the Phase 2 pipeline. Receives the original Figma URL,
 *   a screenshot of the original design, and a rendered screenshot (from the
 *   Render Agent), performs a two-pass comparison, and returns a structured
 *   DiffReport describing all visual discrepancies.
 *
 * Input:
 *   figmaUrl   — the original Figma design URL
 *   screenshot — base64 PNG of the rendered component (from Render Agent)
 *
 * Output: DiffReport — structured list of diff issues + fidelity score
 *
 * PHASE 2: Implementation will use pixel diff + GPT-4o vision comparison.
 */

import type { DiffReport } from '../types/index.js';

export async function runDiff(
  _figmaUrl: string,
  _screenshot: string
): Promise<DiffReport> {
  // PHASE 2: implement pixel diff + GPT-4o vision diff here
  throw new Error('Not implemented — Phase 2');
}
