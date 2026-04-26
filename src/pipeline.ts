/**
 * src/pipeline.ts
 * CLI entry point for the Figma-to-code pipeline.
 *
 * Usage:
 *   npx tsx src/pipeline.ts "https://www.figma.com/design/{fileKey}/...?node-id={nodeId}" [--max-iter N]
 *
 *   --max-iter 0  skip the render/judge loop entirely
 *   --max-iter N  run up to N refinement iterations (default: 3)
 *
 * Architecture: Codegen Agent ↔ Judge Agent loop with render as a tool.
 * Long-term memory: guidelines read at start, written on successful completion.
 */

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCodegen } from "./agents/codegen.js";
import { runJudge, extractGuidelines } from "./agents/judge.js";
import { runRender } from "./agents/render.js";
import { fetchFigmaScreenshot, getFigmaNodeSize } from "./utils/figma.js";
import { readGuidelines, writeGuidelines } from "./utils/memory.js";
import { createRunDir, saveDebugRun, type IterationArtifacts } from "./utils/debug.js";
import type { GeneratedComponent, DiffReport } from "./types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_COMPONENT_PATH = path.resolve(
  __dirname,
  "../sandbox/src/GeneratedComponent.tsx",
);

const DEFAULT_MAX_ITER = 3;
const FIDELITY_THRESHOLD = 0.90;

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
  // Read long-term memory
  // -------------------------------------------------------------------------
  let guidelines: string[] = [];
  try {
    guidelines = await readGuidelines();
    if (guidelines.length > 0) {
      console.log(`  [Pipeline] loaded ${guidelines.length} design guideline(s) from memory`);
    }
  } catch {
    console.warn("  [Pipeline] could not read guidelines from memory");
  }

  // -------------------------------------------------------------------------
  // Fetch Figma screenshot + node size
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Main loop: Codegen → Write Sandbox → Render → Judge
  // -------------------------------------------------------------------------
  const debugIterations: IterationArtifacts[] = [];
  const sessionDiffs: DiffReport[] = [];
  let currentComponent: GeneratedComponent | undefined;
  let latestDiff: DiffReport | undefined;

  // Handle skipCodegen
  if (skipCodegen) {
    const existing = await fs.readFile(SANDBOX_COMPONENT_PATH, "utf-8").catch(() => null);
    if (!existing) {
      console.error(`\n✗ --skip-codegen: no existing component at ${SANDBOX_COMPONENT_PATH}`);
      process.exit(1);
    }
    const nameMatch = existing.match(/export\s+(?:default\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9_]*)/);
    currentComponent = {
      tsx: existing,
      componentName: nameMatch?.[1] ?? "GeneratedComponent",
      dependencies: ["react"],
      tailwindConfigPatch: null,
    };
    console.log(`[Codegen]       — skipped (using existing ${SANDBOX_COMPONENT_PATH})`);
  }

  for (let iteration = 0; iteration <= maxIter; iteration++) {
    // --- Codegen / Refine ---
    if (!skipCodegen || iteration > 0) {
      const isRefinement = iteration > 0 && currentComponent && latestDiff;
      console.log(`\n--- Iteration ${iteration} (${isRefinement ? "refine" : "generate"}) ---`);

      try {
        currentComponent = await runCodegen(figmaUrl, {
          existingComponent: isRefinement ? currentComponent : undefined,
          diffReport: isRefinement ? latestDiff : undefined,
          guidelines,
          debugDir: runDir,
          iter: iteration,
        });
      } catch (err) {
        console.error(`\n✗ Codegen failed (iteration ${iteration}): ${String(err)}`);
        process.exit(1);
      }

      const lineCount = currentComponent.tsx.split("\n").length;
      console.log(
        `[Codegen]       — completed (component: ${currentComponent.componentName}, ${lineCount} lines)`,
      );
    }

    // --- Write Sandbox ---
    await writeSandbox(currentComponent!);
    console.log(`[Write Sandbox] — completed`);

    // --- Render ---
    let renderedScreenshot: string;
    try {
      renderedScreenshot = await runRender(currentComponent!, viewportSize);
      console.log(`[Render ${iteration}]      — completed`);
    } catch (err) {
      console.error(`\n✗ Render failed (iteration ${iteration}): ${String(err)}`);
      break;
    }

    // --- Judge ---
    try {
      latestDiff = await runJudge(figmaUrl, renderedScreenshot, runDir, iteration);
      console.log(
        `[Judge ${iteration}]       — fidelity: ${(latestDiff.fidelityScore * 100).toFixed(1)}% — ${latestDiff.issues.length} issue(s)`,
      );
    } catch (err) {
      console.error(`\n✗ Judge failed (iteration ${iteration}): ${String(err)}`);
      debugIterations.push({ iteration, screenshot: renderedScreenshot });
      break;
    }

    debugIterations.push({ iteration, screenshot: renderedScreenshot, diff: latestDiff });
    sessionDiffs.push(latestDiff);

    // --- Check threshold ---
    if (latestDiff.fidelityScore >= FIDELITY_THRESHOLD || latestDiff.issues.length === 0) {
      console.log(
        `[Pipeline]      — fidelity threshold reached (${(latestDiff.fidelityScore * 100).toFixed(1)}%)`,
      );

      // Extract and save guidelines to long-term memory
      try {
        const newGuidelines = await extractGuidelines(sessionDiffs, runDir, guidelines);
        if (newGuidelines.length > 0) {
          const added = await writeGuidelines(newGuidelines);
          if (added > 0) {
            console.log(`[Memory]        — saved ${added} new design guideline(s)`);
          }
        }
      } catch (err) {
        console.warn(`  [Pipeline] could not save guidelines: ${String(err)}`);
      }

      break;
    }

    if (iteration >= maxIter) break;
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
  const componentName = currentComponent?.componentName ?? "GeneratedComponent";

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
