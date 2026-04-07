/**
 * Shared message contracts between agents in the Figma-to-code multi-agent system.
 * All agent inputs and outputs are defined here as Zod schemas with inferred TypeScript types.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Codegen Agent output / Render Agent input (Phase 2)
// ---------------------------------------------------------------------------

export const GeneratedComponentSchema = z.object({
  tsx: z.string(),              // full TSX file content
  componentName: z.string(),
  dependencies: z.array(z.string()),
  tailwindConfigPatch: z.string().nullable(),
});
export type GeneratedComponent = z.infer<typeof GeneratedComponentSchema>;

// ---------------------------------------------------------------------------
// Phase 2 agent message contracts — placeholder schemas
// Implement fully when Phase 2 begins
// ---------------------------------------------------------------------------

// PHASE 2: DiffIssue — a single visual discrepancy between the Figma design
// and the rendered component (e.g. wrong color, wrong spacing, missing element)
export const DiffIssueSchema = z.object({});
export type DiffIssue = z.infer<typeof DiffIssueSchema>;

// PHASE 2: DiffReport — the full set of diff issues + an overall fidelity score
export const DiffReportSchema = z.object({});
export type DiffReport = z.infer<typeof DiffReportSchema>;

// PHASE 2: RefinementResult — the patched component after applying diff fixes
export const RefinementResultSchema = z.object({});
export type RefinementResult = z.infer<typeof RefinementResultSchema>;
