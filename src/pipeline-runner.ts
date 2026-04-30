/**
 * Pipeline runner — callable function version of pipeline.ts.
 * Emits structured events instead of console.logging, and never calls process.exit().
 *
 * Architecture: Codegen Agent ↔ Judge Agent loop with render as a tool.
 * Long-term memory: guidelines read at start, written on successful completion.
 */

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCodegen } from "./agents/codegen.js";
import { extractGuidelines, runJudge } from "./agents/judge.js";
import { runRender } from "./utils/render.js";
import type {
  DiffIssue,
  DiffReport,
  GeneratedComponent,
} from "./types/index.js";
import {
  createRunDir,
  saveDebugRun,
  type IterationArtifacts,
} from "./utils/debug.js";
import { fetchFigmaScreenshot, getFigmaNodeSize } from "./utils/figma.js";
import { readGuidelines, writeGuidelines } from "./utils/memory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_COMPONENT_PATH = path.resolve(
  __dirname,
  "../sandbox/src/GeneratedComponent.tsx",
);
const DEFAULT_MAX_ITER = 3;

export type PipelineEvent =
  | { type: "log"; message: string }
  | { type: "figma_screenshot"; screenshot: string }
  | {
      type: "codegen_done";
      componentName: string;
      lines: number;
      tsx: string;
      mode: "generate" | "refine";
      iteration: number;
    }
  | { type: "render_done"; iteration: number; screenshot: string }
  | {
      type: "judge_done";
      iteration: number;
      issues: DiffIssue[];
      summary: string;
    }
  | { type: "memory_updated"; guidelinesCount: number }
  | {
      type: "done";
      componentName: string;
      iterations: number;
      finalIssueCount: number | null;
    }
  | { type: "error"; message: string };

export interface PipelineOptions {
  maxIter?: number;
}

function isFigmaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "www.figma.com" ||
        parsed.hostname === "figma.com") &&
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

  if (!isFigmaUrl(figmaUrl)) {
    emit({ type: "error", message: "Invalid Figma URL" });
    return;
  }

  emit({ type: "log", message: `Starting pipeline...` });
  emit({ type: "log", message: `URL: ${figmaUrl}` });
  emit({ type: "log", message: `Max iterations: ${maxIter}` });

  const runDir = await createRunDir();

  // -------------------------------------------------------------------------
  // Read long-term memory (design guidelines from prior sessions)
  // -------------------------------------------------------------------------
  let guidelines: string[] = [];
  try {
    guidelines = await readGuidelines();
    if (guidelines.length > 0) {
      emit({
        type: "log",
        message: `Loaded ${guidelines.length} design guideline(s) from memory`,
      });
    }
  } catch {
    emit({
      type: "log",
      message: "Warning: could not read guidelines from memory",
    });
  }

  // -------------------------------------------------------------------------
  // Fetch Figma screenshot (used by Judge agent for comparison)
  // -------------------------------------------------------------------------
  emit({ type: "log", message: "Fetching Figma screenshot..." });
  let figmaScreenshot = "";
  try {
    figmaScreenshot = await fetchFigmaScreenshot(figmaUrl);
    emit({ type: "figma_screenshot", screenshot: figmaScreenshot });
    emit({
      type: "log",
      message: `Figma screenshot ready (${Math.round(figmaScreenshot.length / 1024)} KB)`,
    });
  } catch (err) {
    emit({
      type: "log",
      message: `Warning: could not fetch Figma screenshot — ${String(err)}`,
    });
  }

  const nodeSize = await getFigmaNodeSize(figmaUrl);
  const viewportSize = nodeSize
    ? { width: nodeSize.width, height: Math.max(nodeSize.height, 400) }
    : { width: 1280, height: 800 };
  if (nodeSize) {
    emit({
      type: "log",
      message: `Figma node size: ${nodeSize.width}×${nodeSize.height}`,
    });
  }

  // -------------------------------------------------------------------------
  // Main loop: Codegen → Write Sandbox → Render → Judge
  // -------------------------------------------------------------------------
  const debugIterations: IterationArtifacts[] = [];
  const sessionDiffs: DiffReport[] = [];
  let currentComponent: GeneratedComponent | undefined;
  let latestDiff: DiffReport | undefined;

  // iteration < maxIter: maxIter is the total number of render cycles.
  // maxIter=1 → iteration 1 only (initial codegen, no refinement).
  // maxIter=2 → iterations 1 and 2 (initial + 1 refinement), etc.
  for (let iteration = 0; iteration < maxIter; iteration++) {
    // --- Codegen / Refine ---
    const isRefinement = iteration > 0 && currentComponent && latestDiff;
    const mode = isRefinement ? "refine" : "generate";
    emit({
      type: "log",
      message: `${isRefinement ? "Refining" : "Generating"} iteration ${iteration + 1}...`,
    });

    try {
      currentComponent = await runCodegen(figmaUrl, {
        existingComponent: isRefinement ? currentComponent : undefined,
        diffReport: isRefinement ? latestDiff : undefined,
        guidelines,
        debugDir: runDir,
        iter: iteration,
      });
    } catch (err) {
      emit({
        type: "error",
        message: `Codegen failed (iteration ${iteration + 1}): ${String(err)}`,
      });
      return;
    }

    const lineCount = currentComponent.tsx.split("\n").length;
    emit({
      type: "log",
      message: `Codegen done — ${currentComponent.componentName} (${lineCount} lines)`,
    });
    emit({
      type: "codegen_done",
      componentName: currentComponent.componentName,
      lines: lineCount,
      tsx: currentComponent.tsx,
      mode,
      iteration: iteration + 1,
    });

    // --- Write Sandbox ---
    await writeSandbox(currentComponent);

    // --- Render (tool, not agent) ---
    emit({ type: "log", message: `Rendering iteration ${iteration + 1}...` });
    let renderedScreenshot: string;
    try {
      renderedScreenshot = await runRender(viewportSize);
      emit({ type: "log", message: `Render ${iteration + 1} complete` });
      emit({
        type: "render_done",
        iteration: iteration + 1,
        screenshot: renderedScreenshot,
      });
    } catch (err) {
      emit({
        type: "error",
        message: `Render failed (iteration ${iteration + 1}): ${String(err)}`,
      });
      break;
    }

    // --- Judge ---
    emit({ type: "log", message: `Judging iteration ${iteration + 1}...` });
    try {
      latestDiff = await runJudge(
        figmaUrl,
        renderedScreenshot,
        runDir,
        iteration,
      );
      emit({
        type: "log",
        message: `Judge ${iteration + 1} — ${latestDiff.issues.length} issue(s)`,
      });
      emit({
        type: "judge_done",
        iteration: iteration + 1,
        issues: latestDiff.issues,
        summary: latestDiff.summary,
      });

      // Retry the Figma screenshot fetch in case the initial attempt failed.
      if (!figmaScreenshot) {
        try {
          figmaScreenshot = await fetchFigmaScreenshot(figmaUrl);
          emit({ type: "figma_screenshot", screenshot: figmaScreenshot });
        } catch {}
      }
    } catch (err) {
      emit({
        type: "error",
        message: `Judge failed (iteration ${iteration + 1}): ${String(err)}`,
      });
      debugIterations.push({ iteration, screenshot: renderedScreenshot });
      break;
    }

    debugIterations.push({
      iteration,
      screenshot: renderedScreenshot,
      diff: latestDiff,
    });
    sessionDiffs.push(latestDiff);

    // --- Check for zero issues (early stop) ---
    if (latestDiff.issues.length === 0) {
      emit({ type: "log", message: "No issues found — stopping early" });
      break;
    }
  }

  // -------------------------------------------------------------------------
  // Extract and save guidelines to long-term memory (after final iteration)
  // -------------------------------------------------------------------------
  if (sessionDiffs.length > 0) {
    try {
      emit({ type: "log", message: "Extracting design guidelines..." });
      const newGuidelines = await extractGuidelines(
        sessionDiffs,
        runDir,
        guidelines,
      );
      emit({
        type: "log",
        message: `Extracted ${newGuidelines.length} guideline(s)`,
      });
      if (newGuidelines.length > 0) {
        const added = await writeGuidelines(newGuidelines);
        if (added > 0) {
          emit({
            type: "log",
            message: `Saved ${added} new design guideline(s) to memory`,
          });
          emit({ type: "memory_updated", guidelinesCount: added });
        }
      }
    } catch (err) {
      emit({
        type: "log",
        message: `Warning: could not save guidelines — ${String(err)}`,
      });
    }
  }

  try {
    await saveDebugRun(runDir, figmaScreenshot, debugIterations);
  } catch {}

  const finalDiff = debugIterations.at(-1)?.diff;
  emit({
    type: "done",
    componentName: currentComponent?.componentName ?? "Unknown",
    iterations: debugIterations.length,
    finalIssueCount: finalDiff?.issues.length ?? null,
  });
}
