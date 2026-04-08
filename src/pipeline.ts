/**
 * src/pipeline.ts
 * CLI entry point for the Figma-to-code pipeline.
 *
 * Usage:
 *   npx tsx src/pipeline.ts "https://www.figma.com/design/{fileKey}/...?node-id={nodeId}" [--max-iter N]
 *
 *   --max-iter 0  skip Phase 2 entirely (no render/diff/refine)
 *   --max-iter N  run up to N refinement iterations (default: 3)
 *
 * Phase 1 (Mastra workflow): Codegen → Write Sandbox
 * Phase 2 (direct calls):    Render → Diff → Refine (loop, max N iterations)
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
import { createRunDir, saveDebugRun, type IterationArtifacts } from "./utils/debug.js";
import type { GeneratedComponent } from "./types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_COMPONENT_PATH = path.resolve(
  __dirname,
  "../sandbox/src/GeneratedComponent.tsx",
);

const DEFAULT_MAX_ITER = 3;
const FIDELITY_THRESHOLD = 0.95;

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

/** Write component TSX to the sandbox, appending a default export if absent. */
async function writeSandbox(component: GeneratedComponent): Promise<void> {
  const tsx = component.tsx.includes("export default")
    ? component.tsx
    : `${component.tsx}\n\nexport default ${component.componentName};\n`;
  await fs.writeFile(SANDBOX_COMPONENT_PATH, tsx, "utf-8");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const figmaUrl = args.find((a) => !a.startsWith("--"));
  const maxIterArg = args.indexOf("--max-iter");
  const maxIter =
    maxIterArg !== -1 ? parseInt(args[maxIterArg + 1] ?? "", 10) : DEFAULT_MAX_ITER;
  const skipCodegen = args.includes("--skip-codegen");
  if (args.includes("--stop-after-figma")) process.env.STOP_AFTER_FIGMA = "1";

  if (!figmaUrl || !isFigmaUrl(figmaUrl)) {
    console.error(
      'Usage: npx tsx src/pipeline.ts "https://..." [--max-iter N] [--skip-codegen]',
    );
    process.exit(1);
  }

  if (isNaN(maxIter) || maxIter < 0) {
    console.error("--max-iter must be a non-negative integer");
    process.exit(1);
  }

  console.log(`\nfiggen — Figma-to-code pipeline`);
  console.log(`URL: ${figmaUrl}\n`);

  const runDir = await createRunDir();
  console.log(`  [Pipeline] run dir → ${runDir}\n`);

  // -------------------------------------------------------------------------
  // Phase 1: Codegen + Write Sandbox (via Mastra workflow)
  // -------------------------------------------------------------------------

  let codegenOutput: GeneratedComponent | undefined;

  if (skipCodegen) {
    const existing = await fs.readFile(SANDBOX_COMPONENT_PATH, "utf-8").catch(() => null);
    if (!existing) {
      console.error(`\n✗ --skip-codegen: no existing component at ${SANDBOX_COMPONENT_PATH}`);
      process.exit(1);
    }
    const nameMatch = existing.match(/export\s+(?:default\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9_]*)/);
    codegenOutput = {
      tsx: existing,
      componentName: nameMatch?.[1] ?? "GeneratedComponent",
      dependencies: ["react"],
      tailwindConfigPatch: null,
    };
    console.log(`[Codegen]       — skipped (using existing ${SANDBOX_COMPONENT_PATH})`);
  } else {
    const workflow = mastra.getWorkflow("figmaToCodeWorkflow");
    const run = await workflow.createRun();

    let result: Awaited<ReturnType<typeof run.start>>;
    try {
      result = await run.start({ inputData: { figmaUrl, debugDir: runDir } });
    } catch (err) {
      console.error(`\n✗ Pipeline failed: ${String(err)}`);
      process.exit(1);
    }

    if (result.status !== "success") {
      const stepEntries = Object.entries(result.steps ?? {});
      const failedStep = stepEntries.find(
        ([, s]) => (s as { status?: string }).status === "failed",
      );
      if (failedStep) {
        const [stepId, stepResult] = failedStep;
        const errorMsg =
          (stepResult as { error?: { message?: string } }).error?.message ??
          "unknown error";
        console.error(`\n✗ Step "${stepId}" failed: ${errorMsg}`);
      } else {
        console.error(
          `\n✗ Pipeline did not complete successfully (status: ${result.status})`,
        );
      }
      process.exit(1);
    }

    const steps = result.steps as Record<string, { output?: unknown }>;
    codegenOutput = steps["codegen"]?.output as GeneratedComponent | undefined;
    const sandboxOutput = steps["write-sandbox"]?.output as
      | { outputPath?: string; componentName?: string }
      | undefined;

    if (codegenOutput) {
      const lineCount = (codegenOutput.tsx ?? "").split("\n").length;
      console.log(
        `[Codegen]       — completed (component: ${codegenOutput.componentName ?? "unknown"}, ${lineCount} lines)`,
      );
    }
    if (sandboxOutput) {
      console.log(
        `[Write Sandbox] — completed\n               → ${sandboxOutput.outputPath ?? SANDBOX_COMPONENT_PATH}`,
      );
    }
  }

  if (!codegenOutput) {
    console.error("\n✗ No codegen output — aborting.");
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Phase 2: Render → Diff → Refine loop
  // -------------------------------------------------------------------------

  // Fetch Figma screenshot + node size once (diff agent re-fetches screenshot internally)
  let figmaScreenshot = "";
  try {
    figmaScreenshot = await fetchFigmaScreenshot(figmaUrl);
  } catch {
    console.warn("  [Pipeline] could not fetch Figma screenshot for debug save");
  }

  const nodeSize = await getFigmaNodeSize(figmaUrl);
  const viewportSize = nodeSize
    ? { width: nodeSize.width, height: Math.max(nodeSize.height, 400) }
    : { width: 1280, height: 800 };
  if (nodeSize) {
    console.log(`  [Pipeline] Figma node size: ${nodeSize.width}×${nodeSize.height}`);
  }

  const debugIterations: IterationArtifacts[] = [];
  let currentComponent: GeneratedComponent = codegenOutput;

  for (let iteration = 0; iteration <= maxIter; iteration++) {
    // Render
    let renderedScreenshot: string;
    try {
      renderedScreenshot = await runRender(currentComponent, viewportSize);
      console.log(`[Render ${iteration}]      — completed`);
    } catch (err) {
      console.error(`\n✗ Render failed (iteration ${iteration}): ${String(err)}`);
      break;
    }

    // Diff
    let diffReport: Awaited<ReturnType<typeof runDiff>>;
    try {
      diffReport = await runDiff(figmaUrl, renderedScreenshot, runDir, iteration);
      console.log(
        `[Diff ${iteration}]        — fidelity: ${(diffReport.fidelityScore * 100).toFixed(1)}% — ${diffReport.issues.length} issue(s)`,
      );
    } catch (err) {
      console.error(`\n✗ Diff failed (iteration ${iteration}): ${String(err)}`);
      debugIterations.push({ iteration, screenshot: renderedScreenshot });
      break;
    }

    debugIterations.push({ iteration, screenshot: renderedScreenshot, diff: diffReport });

    // Done if fidelity is high enough or no issues remain
    if (diffReport.fidelityScore >= FIDELITY_THRESHOLD || diffReport.issues.length === 0) {
      console.log(
        `[Pipeline]      — fidelity threshold reached (${(diffReport.fidelityScore * 100).toFixed(1)}%)`,
      );
      break;
    }

    // No more refinement iterations left (also skips refine when maxIter = 0)
    if (iteration >= maxIter) break;

    // Refine
    let refined: Awaited<ReturnType<typeof runRefinement>>;
    try {
      refined = await runRefinement(currentComponent, diffReport, runDir, iteration);
      console.log(`[Refine ${iteration}]      — completed (${refined.patchSummary})`);
    } catch (err) {
      console.error(`\n✗ Refinement failed (iteration ${iteration}): ${String(err)}`);
      break;
    }

    // Write refined component to sandbox for next render
    currentComponent = {
      tsx: refined.tsx,
      componentName: refined.componentName,
      dependencies: refined.dependencies,
      tailwindConfigPatch: refined.tailwindConfigPatch,
    };
    await writeSandbox(currentComponent);
  }

  // -------------------------------------------------------------------------
  // Save debug artifacts
  // -------------------------------------------------------------------------

  try {
    await saveDebugRun(runDir, figmaScreenshot, debugIterations);
  } catch (err) {
    console.warn(`  [Pipeline] debug save failed: ${String(err)}`);
  }

  // -------------------------------------------------------------------------
  // Final summary
  // -------------------------------------------------------------------------

  const finalDiff = debugIterations.at(-1)?.diff;
  const componentName = codegenOutput?.componentName ?? "GeneratedComponent";

  console.log(`
✓ Pipeline completed
  Component:      ${componentName}
  File:           ${SANDBOX_COMPONENT_PATH}
  Iterations:     ${debugIterations.length}
  Fidelity score: ${finalDiff ? `${(finalDiff.fidelityScore * 100).toFixed(1)}%` : "n/a"}
  Debug dir:      ${runDir}
`);

  if (finalDiff && finalDiff.issues.length > 0) {
    console.log(`Remaining issues (${finalDiff.issues.length}):`);
    for (const issue of finalDiff.issues) {
      console.log(`  [${issue.category}] ${issue.description}`);
    }
    console.log("");
  }

  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(`\n✗ Unexpected error: ${String(err)}`);
  process.exit(1);
});
