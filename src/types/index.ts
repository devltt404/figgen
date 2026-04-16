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

// ---------------------------------------------------------------------------
// Long-term memory — design guidelines accumulated across sessions
// ---------------------------------------------------------------------------

export const GuidelineSchema = z.object({
  id: z.string(),
  text: z.string(),
  source: z.string(),       // e.g. "session-2026-04-16_14-30"
  addedAt: z.string(),      // ISO timestamp
  hitCount: z.number(),     // incremented each time guidelines are read
});
export type Guideline = z.infer<typeof GuidelineSchema>;

export const GuidelinesFileSchema = z.object({
  version: z.literal(1),
  guidelines: z.array(GuidelineSchema),
});
export type GuidelinesFile = z.infer<typeof GuidelinesFileSchema>;
