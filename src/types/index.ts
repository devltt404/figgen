/**
 * Shared message contracts between agents. Zod schemas with inferred types.
 */

import { z } from "zod";

/** Output of the codegen agent — the generated TSX and its detected component name. */
export const GeneratedComponentSchema = z.object({
  tsx: z.string(),
  componentName: z.string(),
});
export type GeneratedComponent = z.infer<typeof GeneratedComponentSchema>;

/** A single visual discrepancy found by the judge. */
export const DiffIssueSchema = z.object({
  category: z.enum([
    "layout",
    "color",
    "typography",
    "spacing",
    "missing-element",
    "extra-element",
    "other",
  ]),
  severity: z.enum(["critical", "moderate", "minor"]).optional(),
  description: z.string(),
});
export type DiffIssue = z.infer<typeof DiffIssueSchema>;

/**
 * Full judge output. No numeric fidelity score by design — iteration count is
 * the sole stop criterion, and the codegen agent only needs the issue list.
 */
export const DiffReportSchema = z.object({
  issues: z.array(DiffIssueSchema),
  summary: z.string(),
});
export type DiffReport = z.infer<typeof DiffReportSchema>;
