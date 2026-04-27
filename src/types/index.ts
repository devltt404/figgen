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
  patchSummary: z.string().optional(),  // present when in refinement mode
});
export type GeneratedComponent = z.infer<typeof GeneratedComponentSchema>;

// ---------------------------------------------------------------------------
// Phase 2 agent message contracts — placeholder schemas
// Implement fully when Phase 2 begins
// ---------------------------------------------------------------------------

// DiffIssue — a single visual discrepancy between the Figma design and the rendered component
export const DiffIssueSchema = z.object({
  category: z.enum(['layout', 'color', 'typography', 'spacing', 'missing-element', 'extra-element', 'other']),
  severity: z.enum(['critical', 'moderate', 'minor']).optional(),
  description: z.string(),
});
export type DiffIssue = z.infer<typeof DiffIssueSchema>;

// DiffReport — the full set of diff issues + a one-line summary.
// Note: there is no numeric fidelity score. Iteration count is the sole stop
// criterion; the judge produces only critiques (issues) for the codegen agent
// to act on.
export const DiffReportSchema = z.object({
  issues: z.array(DiffIssueSchema),
  summary: z.string(),
});
export type DiffReport = z.infer<typeof DiffReportSchema>;

