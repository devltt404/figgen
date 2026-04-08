/**
 * Pipeline runner — callable function version of pipeline.ts.
 * Emits structured events instead of console.logging, and never calls process.exit().
 */

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mastra } from "./mastra/index.js";
import { runRender } from "./agents/render.js";
import { runDiff } from "./agents/diff.js";
import { runRefinement } from "./agents/refinement.js";
import { fetchFigmaScreenshot, getFigmaNodeSize } from "./utils/figma.js";
import { saveDebugRun, type IterationArtifacts } from "./utils/debug.js";
import type { GeneratedComponent, DiffIssue } from "./types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_COMPONENT_PATH = path.resolve(__dirname, "../sandbox/src/GeneratedComponent.tsx");
const DEFAULT_MAX_ITER = 3;
const FIDELITY_THRESHOLD = 0.95;

export type PipelineEvent =
  | { type: "log"; message: string }
  | { type: "figma_screenshot"; screenshot: string }
  | { type: "codegen_done"; componentName: string; lines: number; tsx: string }
  | { type: "render_done"; iteration: number; screenshot: string }
  | { type: "diff_done"; iteration: number; fidelityScore: number; issues: DiffIssue[]; summary: string }
  | { type: "refine_done"; iteration: number }
  | { type: "done"; componentName: string; iterations: number; fidelityScore: number | null }
  | { type: "error"; message: string };

export interface PipelineOptions {
  maxIter?: number;
  skipCodegen?: boolean;
}

function isFigmaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "www.figma.com" || parsed.hostname === "figma.com") &&
      /\/(file|design|proto|site|board)\//.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

async function writeSandbox(component: GeneratedComponent): Promise<void> {
  const tsx = component.tsx.includes("export default")
    ? component.tsx
    : `${component.tsx}\n\nexport default ${component.componentName};\n`;
  await fs.writeFile(SANDBOX_COMPONENT_PATH, tsx, "utf-8");
}

export async function runPipeline(
  figmaUrl: string,
  options: PipelineOptions,
  emit: (event: PipelineEvent) => void,
): Promise<void> {
  const maxIter = options.maxIter ?? DEFAULT_MAX_ITER;
  const skipCodegen = options.skipCodegen ?? false;

  if (!isFigmaUrl(figmaUrl)) {
    emit({ type: "error", message: "Invalid Figma URL" });
    return;
  }

  emit({ type: "log", message: `Starting pipeline…` });
  emit({ type: "log", message: `URL: ${figmaUrl}` });
  emit({ type: "log", message: `Max iterations: ${maxIter}` });

  // -------------------------------------------------------------------------
  // Phase 1: Codegen
  // -------------------------------------------------------------------------
  let codegenOutput: GeneratedComponent | undefined;

  if (skipCodegen) {
    const existing = await fs.readFile(SANDBOX_COMPONENT_PATH, "utf-8").catch(() => null);
    if (!existing) {
      emit({ type: "error", message: `No existing component at ${SANDBOX_COMPONENT_PATH}` });
      return;
    }
    const nameMatch = existing.match(/export\s+(?:default\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9_]*)/);
    codegenOutput = {
      tsx: existing,
      componentName: nameMatch?.[1] ?? "GeneratedComponent",
      dependencies: ["react"],
      tailwindConfigPatch: null,
    };
    emit({ type: "log", message: "Codegen skipped — using existing component" });
    emit({ type: "codegen_done", componentName: codegenOutput.componentName, lines: existing.split("\n").length, tsx: existing });
  } else {
    emit({ type: "log", message: "Phase 1 — running codegen…" });
    const workflow = mastra.getWorkflow("figmaToCodeWorkflow");
    const run = await workflow.createRun();
    let result: Awaited<ReturnType<typeof run.start>>;
    try {
      result = await run.start({ inputData: { figmaUrl } });
    } catch (err) {
      emit({ type: "error", message: `Codegen failed: ${String(err)}` });
      return;
    }

    if (result.status !== "success") {
      const stepEntries = Object.entries(result.steps ?? {});
      const failedStep = stepEntries.find(([, s]) => (s as { status?: string }).status === "failed");
      const errorMsg = failedStep
        ? ((failedStep[1] as { error?: { message?: string } }).error?.message ?? "unknown error")
        : `status: ${result.status}`;
      emit({ type: "error", message: `Codegen pipeline failed — ${errorMsg}` });
      return;
    }

    const steps = result.steps as Record<string, { output?: unknown }>;
    codegenOutput = steps["codegen"]?.output as GeneratedComponent | undefined;
    if (!codegenOutput) {
      emit({ type: "error", message: "No codegen output" });
      return;
    }

    const lineCount = codegenOutput.tsx.split("\n").length;
    emit({ type: "log", message: `Codegen done — ${codegenOutput.componentName} (${lineCount} lines)` });
    emit({ type: "codegen_done", componentName: codegenOutput.componentName, lines: lineCount, tsx: codegenOutput.tsx });
  }

  // -------------------------------------------------------------------------
  // Phase 2: Render → Diff → Refine
  // -------------------------------------------------------------------------
  emit({ type: "log", message: "Phase 2 — fetching Figma screenshot…" });
  let figmaScreenshot = "";
  try {
    figmaScreenshot = await fetchFigmaScreenshot(figmaUrl);
    emit({ type: "figma_screenshot", screenshot: figmaScreenshot });
    emit({ type: "log", message: `Figma screenshot ready (${Math.round(figmaScreenshot.length / 1024)} KB)` });
  } catch (err) {
    emit({ type: "log", message: `Warning: could not fetch Figma screenshot — ${String(err)}` });
  }

  const nodeSize = await getFigmaNodeSize(figmaUrl);
  const viewportSize = nodeSize
    ? { width: nodeSize.width, height: Math.max(nodeSize.height, 400) }
    : { width: 1280, height: 800 };
  if (nodeSize) {
    emit({ type: "log", message: `Figma node size: ${nodeSize.width}×${nodeSize.height}` });
  }

  const debugIterations: IterationArtifacts[] = [];
  let currentComponent: GeneratedComponent = codegenOutput;

  for (let iteration = 0; iteration <= maxIter; iteration++) {
    emit({ type: "log", message: `Rendering iteration ${iteration}…` });
    let renderedScreenshot: string;
    try {
      renderedScreenshot = await runRender(currentComponent, viewportSize);
      emit({ type: "log", message: `Render ${iteration} complete` });
      emit({ type: "render_done", iteration, screenshot: renderedScreenshot });
    } catch (err) {
      emit({ type: "error", message: `Render failed (iteration ${iteration}): ${String(err)}` });
      break;
    }

    emit({ type: "log", message: `Running diff ${iteration}…` });
    let diffReport: Awaited<ReturnType<typeof runDiff>>;
    try {
      diffReport = await runDiff(figmaUrl, renderedScreenshot);
      const pct = (diffReport.fidelityScore * 100).toFixed(1);
      emit({ type: "log", message: `Diff ${iteration} — fidelity: ${pct}% — ${diffReport.issues.length} issue(s)` });
      emit({ type: "diff_done", iteration, fidelityScore: diffReport.fidelityScore, issues: diffReport.issues, summary: diffReport.summary });
    } catch (err) {
      emit({ type: "error", message: `Diff failed (iteration ${iteration}): ${String(err)}` });
      debugIterations.push({ iteration, screenshot: renderedScreenshot });
      break;
    }

    debugIterations.push({ iteration, screenshot: renderedScreenshot, diff: diffReport });

    if (diffReport.fidelityScore >= FIDELITY_THRESHOLD || diffReport.issues.length === 0) {
      emit({ type: "log", message: `Fidelity threshold reached (${(diffReport.fidelityScore * 100).toFixed(1)}%) — done` });
      break;
    }

    if (iteration >= maxIter) break;

    emit({ type: "log", message: `Refining iteration ${iteration}…` });
    let refined: Awaited<ReturnType<typeof runRefinement>>;
    try {
      refined = await runRefinement(currentComponent, diffReport);
      emit({ type: "log", message: `Refine ${iteration} done — ${refined.patchSummary}` });
      emit({ type: "refine_done", iteration });
    } catch (err) {
      emit({ type: "error", message: `Refinement failed (iteration ${iteration}): ${String(err)}` });
      break;
    }

    currentComponent = {
      tsx: refined.tsx,
      componentName: refined.componentName,
      dependencies: refined.dependencies,
      tailwindConfigPatch: refined.tailwindConfigPatch,
    };
    await writeSandbox(currentComponent);
  }

  try {
    await saveDebugRun(figmaScreenshot, debugIterations);
  } catch {}

  const finalDiff = debugIterations.at(-1)?.diff;
  emit({
    type: "done",
    componentName: codegenOutput.componentName,
    iterations: debugIterations.length,
    fidelityScore: finalDiff?.fidelityScore ?? null,
  });
}
