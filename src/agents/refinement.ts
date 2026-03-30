/**
 * Refinement Agent — src/agents/refinement.ts
 *
 * Role in the multi-agent system:
 *   Fifth agent in the Phase 2 pipeline. Receives a GeneratedComponent and
 *   a DiffReport, applies targeted code patches to address each identified
 *   visual discrepancy, and returns an improved RefinementResult.
 *
 * Input:
 *   component — GeneratedComponent from the Codegen (or previous Refinement) Agent
 *   diff      — DiffReport from the Diff Agent describing what needs fixing
 *
 * Output: RefinementResult — patched component ready for another render/diff cycle
 *
 * IMPORTANT: This is a pure agent function. Zero imports from @mastra/core
 * or any orchestration framework. The Mastra wrapper lives in src/mastra/.
 *
 * PHASE 2: Implementation will:
 *   1. Build a targeted prompt from the DiffReport issues
 *   2. Call GPT-4o with the current TSX + the list of issues
 *   3. Apply minimal, surgical patches — never rewrite the whole component
 *   4. Validate the patched TSX parses correctly
 *   5. Return RefinementResult with updated TSX and a patch summary
 *   The orchestrator will loop this back into the Render Agent until
 *   DiffReport.score >= 0.95 or 3 iterations have been completed.
 */

import type { GeneratedComponent, DiffReport, RefinementResult } from '../types/index.js';

/**
 * Refinement Agent entry point.
 * Applies targeted patches to fix visual issues identified by the Diff Agent.
 * @param component - the current GeneratedComponent to refine
 * @param diff      - the DiffReport describing what needs fixing
 * @returns RefinementResult with the patched component
 */
export async function runRefinement(
  _component: GeneratedComponent,
  _diff: DiffReport
): Promise<RefinementResult> {
  // PHASE 2: implement GPT-4o targeted patching here
  throw new Error('Not implemented — Phase 2');
}
