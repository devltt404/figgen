/**
 * Diff Agent — src/agents/diff.ts
 *
 * Role in the multi-agent system:
 *   Fourth agent in the Phase 2 pipeline. Receives the original FigmaContext
 *   (from the Ingestion Agent) and a rendered screenshot (from the Render
 *   Agent), performs a two-pass comparison, and returns a structured
 *   DiffReport describing all visual discrepancies.
 *
 * Input:
 *   ctx        — FigmaContext with the original Figma screenshot
 *   screenshot — base64 PNG of the rendered component (from Render Agent)
 *
 * Output: DiffReport — structured list of diff issues + fidelity score
 *
 * IMPORTANT: This is a pure agent function. Zero imports from @mastra/core
 * or any orchestration framework. The Mastra wrapper lives in src/mastra/.
 *
 * PHASE 2: Implementation will:
 *   Pass 1 — pixel diff using jimp/sharp: highlight pixel-level differences,
 *             compute an overall fidelity score (0–1)
 *   Pass 2 — GPT-4o vision diff: send both images to GPT-4o and ask it to
 *             enumerate specific discrepancies (color, spacing, typography,
 *             missing elements) as structured DiffIssue objects
 *   Merge both passes into a DiffReport with a combined score
 */

import type { FigmaContext, DiffReport } from '../types/index.js';

/**
 * Diff Agent entry point.
 * Compares the Figma design screenshot against the rendered component screenshot.
 * @param ctx        - FigmaContext containing the original Figma screenshot
 * @param screenshot - base64 PNG of the rendered component
 * @returns DiffReport with issues and fidelity score
 */
export async function runDiff(
  _ctx: FigmaContext,
  _screenshot: string
): Promise<DiffReport> {
  // PHASE 2: implement pixel diff + GPT-4o vision diff here
  throw new Error('Not implemented — Phase 2');
}
