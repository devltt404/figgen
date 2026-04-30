/**
 * Visual fidelity evaluation runner (MAE + VES).
 *
 * For each Figma URL in FIGMA_URLS:
 *   1. Run the full pipeline (codegen → render → judge → refine, up to MAX_ITER).
 *   2. Capture the original Figma screenshot, the first render (iteration 0,
 *      pre-refinement), and the final render (after all refinement iterations).
 *   3. Compute normalized MAE (pixel-level, lower is better) and VES (DINOv2
 *      cosine similarity, higher is better) for both renders against the design.
 *
 * Outputs: per-run screenshots + a JSON report under output/eval/<timestamp>/.
 *
 * Usage: npm run eval
 *
 * Assisted with Claude Code
 */

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPipeline, type PipelineEvent } from "../src/pipeline-runner.js";
import { computeMae } from "./mae.js";
import { computeVes, preloadVes } from "./ves.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = path.resolve(__dirname, "../output/eval");

const FIGMA_URLS = [
  "https://www.figma.com/design/8afvEJsnZbY8h3Kj9dQaeF/?node-id=1:331",
  "https://www.figma.com/design/Usg5C8qylCFlGWQrUBMxcF/?node-id=1:561",
  "https://www.figma.com/design/CBwdhbWkrXN4xkLA8N4w8R/?node-id=2:21",
  "https://www.figma.com/design/wHkEwU9qFA9aY2FRw87wEU/?node-id=6:1661",
  "https://www.figma.com/design/RYfF9yD7zhCExhRcy0w7ev/?node-id=24:73",
  "https://www.figma.com/design/GUqtPlj0vx2bcAB6QzD4OF/?node-id=1:1188",
  "https://www.figma.com/design/6RuBcYR9HL9P0tWnGjiYRP/?node-id=2:835",
  "https://www.figma.com/design/G6pmvFqOrpWKZsZycZiiiB/?node-id=133:1063",
];

const MAX_ITER = 2;

// ─────────────────────────────────────────────────────────────────────────────

interface CaseResult {
  index: number;
  url: string;
  ok: boolean;
  /** MAE of the first render (iteration 0, before any refinement). Lower is better. */
  maeFirst?: number;
  /** MAE of the final render (after all refinement iterations). Lower is better. */
  maeFinal?: number;
  /** maeFinal − maeFirst. Negative = refinement improved fidelity. */
  maeDelta?: number;
  /** VES of the first render. Higher is better. */
  vesFirst?: number;
  /** VES of the final render. Higher is better. */
  vesFinal?: number;
  /** vesFinal − vesFirst. Positive = refinement improved fidelity. */
  vesDelta?: number;
  width?: number;
  height?: number;
  iterations?: number;
  finalIssueCount?: number | null;
  error?: string;
  screenshots?: { figma: string; renderedFirst: string; renderedFinal: string };
}

/** Return true for sentinel entries that haven't been filled in yet. */
function isPlaceholder(url: string): boolean {
  return url.includes("PLACEHOLDER");
}

/**
 * Run the full pipeline for a single Figma URL, capture the relevant
 * screenshots, and compute MAE + VES for the first and final renders.
 *
 * @param url      Figma frame URL to evaluate.
 * @param index    Zero-based position in FIGMA_URLS (used in the result).
 * @param caseDir  Directory where screenshots for this case will be saved.
 */
async function evaluateOne(
  url: string,
  index: number,
  caseDir: string,
): Promise<CaseResult> {
  // Accumulate pipeline events into these mutable locals.
  let figmaScreenshot = ""; // base64 PNG from the Figma API
  let firstRender = ""; // base64 PNG of the iteration-1 render
  let finalRender = ""; // base64 PNG of the last render (may equal firstRender)
  let iterations = 0; // total render iterations completed
  let finalIssueCount: number | null = null;
  let pipelineError: string | undefined;

  await runPipeline(
    url,
    { maxIter: MAX_ITER },
    (event: PipelineEvent) => {
      switch (event.type) {
        case "figma_screenshot":
          figmaScreenshot = event.screenshot;
          break;
        case "render_done":
          // Capture iteration 1 as the pre-refinement baseline.
          // Always overwrite finalRender so it ends up as the last iteration.
          if (event.iteration === 1) firstRender = event.screenshot;
          finalRender = event.screenshot;
          iterations = event.iteration + 1;
          break;
        case "done":
          finalIssueCount = event.finalIssueCount;
          break;
        case "error":
          pipelineError = event.message;
          break;
        case "log":
          // Forward pipeline log lines to stdout with indentation.
          process.stdout.write(`    ${event.message}\n`);
          break;
      }
    },
  );

  if (pipelineError) {
    return { index, url, ok: false, error: pipelineError };
  }
  if (!figmaScreenshot || !firstRender || !finalRender) {
    return {
      index,
      url,
      ok: false,
      error: `missing screenshot (figma=${!!figmaScreenshot}, first=${!!firstRender}, final=${!!finalRender})`,
    };
  }

  // Persist screenshots so they can be inspected after the run.
  const figmaPath = path.join(caseDir, "figma.png");
  const firstPath = path.join(caseDir, "rendered-first.png");
  const finalPath = path.join(caseDir, "rendered-final.png");
  await fs.writeFile(figmaPath, Buffer.from(figmaScreenshot, "base64"));
  await fs.writeFile(firstPath, Buffer.from(firstRender, "base64"));
  await fs.writeFile(finalPath, Buffer.from(finalRender, "base64"));

  // MAE is synchronous (pure pixel math); compute both renders in sequence.
  const maeFirst = computeMae(figmaScreenshot, firstRender);
  const maeFinal = computeMae(figmaScreenshot, finalRender);
  // VES runs two DINOv2 inference passes; do them concurrently to save time.
  const [vesFirst, vesFinal] = await Promise.all([
    computeVes(figmaScreenshot, firstRender),
    computeVes(figmaScreenshot, finalRender),
  ]);

  return {
    index,
    url,
    ok: true,
    maeFirst: maeFirst.mae,
    maeFinal: maeFinal.mae,
    maeDelta: maeFinal.mae - maeFirst.mae,
    vesFirst: vesFirst.ves,
    vesFinal: vesFinal.ves,
    vesDelta: vesFinal.ves - vesFirst.ves,
    width: maeFinal.width,
    height: maeFinal.height,
    iterations,
    finalIssueCount,
    screenshots: {
      figma: figmaPath,
      renderedFirst: firstPath,
      renderedFinal: finalPath,
    },
  };
}

/** Arrow + sign for a delta where lower is better (e.g. MAE). */
function arrowLow(delta: number): string {
  if (delta < -0.0005) return "↓";
  if (delta > 0.0005) return "↑";
  return "·";
}

/** Arrow + sign for a delta where higher is better (e.g. VES). */
function arrowHigh(delta: number): string {
  if (delta > 0.0005) return "↑";
  if (delta < -0.0005) return "↓";
  return "·";
}

/**
 * Compute population mean and standard deviation for an array of numbers.
 * Returns NaN for both when the array is empty.
 */
function meanStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: NaN, std: NaN };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  // Population variance (not sample) — consistent with figma2code reporting.
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

async function main(): Promise<void> {
  const realUrls = FIGMA_URLS.filter((u) => !isPlaceholder(u));
  if (realUrls.length === 0) {
    console.error(
      "✗ All FIGMA_URLS are placeholders. Edit evaluate/run-mae-eval.ts and replace them with real Figma frame URLs.",
    );
    process.exit(1);
  }

  // ISO timestamp with colons/dots replaced so it's safe to use as a directory name.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(OUTPUT_ROOT, stamp);
  await fs.mkdir(runDir, { recursive: true });

  console.log(`Visual fidelity evaluation (MAE + VES)`);
  console.log(
    `  cases:   ${realUrls.length} (${FIGMA_URLS.length - realUrls.length} placeholder skipped)`,
  );
  console.log(`  maxIter: ${MAX_ITER}`);
  console.log(`  output:  ${runDir}\n`);

  console.log("  [VES] loading DINOv2...");
  const t0 = Date.now();
  await preloadVes();
  console.log(`  [VES] ready (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  const results: CaseResult[] = [];
  // Cases are run sequentially to avoid saturating the Figma API or the
  // renderer process with concurrent requests.
  for (let i = 0; i < FIGMA_URLS.length; i++) {
    const url = FIGMA_URLS[i];
    if (isPlaceholder(url)) continue;

    console.log(`\n[${i + 1}/${FIGMA_URLS.length}] ${url}`);
    // Zero-pad the case number so directories sort lexicographically.
    const caseDir = path.join(runDir, `case-${String(i + 1).padStart(2, "0")}`);
    await fs.mkdir(caseDir, { recursive: true });

    try {
      const r = await evaluateOne(url, i, caseDir);
      if (r.ok) {
        console.log(
          `  ✓ MAE ${r.maeFirst!.toFixed(4)} → ${r.maeFinal!.toFixed(4)} ` +
            `(Δ=${r.maeDelta! >= 0 ? "+" : ""}${r.maeDelta!.toFixed(4)} ${arrowLow(r.maeDelta!)})  ` +
            `VES ${r.vesFirst!.toFixed(4)} → ${r.vesFinal!.toFixed(4)} ` +
            `(Δ=${r.vesDelta! >= 0 ? "+" : ""}${r.vesDelta!.toFixed(4)} ${arrowHigh(r.vesDelta!)})  ` +
            `size=${r.width}×${r.height}  iters=${r.iterations}  issues=${r.finalIssueCount ?? "n/a"}`,
        );
      } else {
        console.log(`  ✗ ${r.error}`);
      }
      results.push(r);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ unexpected: ${message}`);
      results.push({ index: i, url, ok: false, error: message });
    }
  }

  // Only include cases where all four metric values are present — failed runs
  // will have ok=false and no metric fields, so they're excluded from stats.
  const succeeded = results.filter(
    (r) =>
      r.ok &&
      typeof r.maeFirst === "number" &&
      typeof r.maeFinal === "number" &&
      typeof r.vesFirst === "number" &&
      typeof r.vesFinal === "number",
  );

  console.log(`\nSummary`);
  console.log(`  succeeded: ${succeeded.length}/${results.length}`);
  if (succeeded.length > 0) {
    const maeFirstStats = meanStd(succeeded.map((r) => r.maeFirst!));
    const maeFinalStats = meanStd(succeeded.map((r) => r.maeFinal!));
    const maeDeltaStats = meanStd(succeeded.map((r) => r.maeDelta!));
    const vesFirstStats = meanStd(succeeded.map((r) => r.vesFirst!));
    const vesFinalStats = meanStd(succeeded.map((r) => r.vesFinal!));
    const vesDeltaStats = meanStd(succeeded.map((r) => r.vesDelta!));
    const maeImproved = succeeded.filter((r) => r.maeDelta! < 0).length;
    const vesImproved = succeeded.filter((r) => r.vesDelta! > 0).length;

    console.log(
      `  MAE first: mean=${maeFirstStats.mean.toFixed(4)}  std=${maeFirstStats.std.toFixed(4)}`,
    );
    console.log(
      `  MAE final: mean=${maeFinalStats.mean.toFixed(4)}  std=${maeFinalStats.std.toFixed(4)}`,
    );
    console.log(
      `  Δ MAE:     mean=${maeDeltaStats.mean >= 0 ? "+" : ""}${maeDeltaStats.mean.toFixed(4)}  ` +
        `improved=${maeImproved}/${succeeded.length}`,
    );
    console.log(
      `  VES first: mean=${vesFirstStats.mean.toFixed(4)}  std=${vesFirstStats.std.toFixed(4)}`,
    );
    console.log(
      `  VES final: mean=${vesFinalStats.mean.toFixed(4)}  std=${vesFinalStats.std.toFixed(4)}`,
    );
    console.log(
      `  Δ VES:     mean=${vesDeltaStats.mean >= 0 ? "+" : ""}${vesDeltaStats.mean.toFixed(4)}  ` +
        `improved=${vesImproved}/${succeeded.length}`,
    );
  }

  // Write a machine-readable JSON report that can be consumed by downstream
  // analysis scripts or committed to the repo for comparison across runs.
  const reportPath = path.join(runDir, "report.json");
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        timestamp: stamp,
        maxIter: MAX_ITER,
        succeeded: succeeded.length,
        total: results.length,
        // The summary block is omitted entirely when no cases succeeded, rather
        // than writing a block full of NaN values.
        ...(succeeded.length > 0 && {
          summary: {
            maeFirst: meanStd(succeeded.map((r) => r.maeFirst!)),
            maeFinal: meanStd(succeeded.map((r) => r.maeFinal!)),
            maeDelta: meanStd(succeeded.map((r) => r.maeDelta!)),
            vesFirst: meanStd(succeeded.map((r) => r.vesFirst!)),
            vesFinal: meanStd(succeeded.map((r) => r.vesFinal!)),
            vesDelta: meanStd(succeeded.map((r) => r.vesDelta!)),
            maeImprovedCount: succeeded.filter((r) => r.maeDelta! < 0).length,
            vesImprovedCount: succeeded.filter((r) => r.vesDelta! > 0).length,
          },
        }),
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\n  report: ${reportPath}`);
}

// Top-level error handler: surface the message and exit with a non-zero code
// so CI can detect failures without parsing stdout.
main().catch((err: unknown) => {
  console.error(`\n✗ Unexpected error: ${String(err)}`);
  process.exit(1);
});
