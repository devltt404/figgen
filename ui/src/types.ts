export interface DiffIssue {
  category: "layout" | "color" | "typography" | "spacing" | "missing-element" | "extra-element" | "other";
  description: string;
}

export type PipelineEvent =
  | { type: "log"; message: string }
  | { type: "figma_screenshot"; screenshot: string }
  | { type: "codegen_done"; componentName: string; lines: number; tsx: string }
  | { type: "render_done"; iteration: number; screenshot: string }
  | { type: "diff_done"; iteration: number; fidelityScore: number; issues: DiffIssue[]; summary: string }
  | { type: "refine_done"; iteration: number }
  | { type: "done"; componentName: string; iterations: number; fidelityScore: number | null }
  | { type: "error"; message: string };

export interface IterationData {
  iteration: number;
  screenshot?: string;
  diff?: { fidelityScore: number; issues: DiffIssue[]; summary: string };
}
