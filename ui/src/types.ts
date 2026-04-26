export interface DiffIssue {
  category: "layout" | "color" | "typography" | "spacing" | "missing-element" | "extra-element" | "other";
  severity?: "critical" | "moderate" | "minor";
  description: string;
}

export type PipelineEvent =
  | { type: "log"; message: string }
  | { type: "figma_screenshot"; screenshot: string }
  | { type: "codegen_done"; componentName: string; lines: number; tsx: string; mode: "generate" | "refine"; iteration: number }
  | { type: "render_done"; iteration: number; screenshot: string }
  | { type: "judge_done"; iteration: number; fidelityScore: number; issues: DiffIssue[]; summary: string }
  | { type: "memory_updated"; guidelinesCount: number }
  | { type: "done"; componentName: string; iterations: number; fidelityScore: number | null }
  | { type: "error"; message: string };

export interface IterationData {
  iteration: number;
  tsx?: string;
  screenshot?: string;
  diff?: { fidelityScore: number; issues: DiffIssue[]; summary: string };
}
