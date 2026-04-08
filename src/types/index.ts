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

// DiffIssue — a single visual discrepancy between the Figma design and the rendered component
export const DiffIssueSchema = z.object({
  category: z.enum(['layout', 'color', 'typography', 'spacing', 'missing-element', 'extra-element', 'other']),
  description: z.string(),
});
export type DiffIssue = z.infer<typeof DiffIssueSchema>;

// DiffReport — the full set of diff issues + an overall fidelity score (0–1)
export const DiffReportSchema = z.object({
  fidelityScore: z.number().min(0).max(1),
  issues: z.array(DiffIssueSchema),
  summary: z.string(),
});
export type DiffReport = z.infer<typeof DiffReportSchema>;

// RefinementResult — the patched component after applying diff fixes
export const RefinementResultSchema = z.object({
  tsx: z.string(),
  componentName: z.string(),
  dependencies: z.array(z.string()),
  tailwindConfigPatch: z.string().nullable(),
  patchSummary: z.string(),
});
export type RefinementResult = z.infer<typeof RefinementResultSchema>;
