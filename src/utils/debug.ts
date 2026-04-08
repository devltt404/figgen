import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DiffReport } from "../types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../../output/debug");

export interface IterationArtifacts {
  iteration: number;
  screenshot: string;
  diff?: DiffReport;
}

export async function createRunDir(): Promise<string> {
  const runId = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const runDir = path.join(OUTPUT_DIR, runId);
  await fs.mkdir(runDir, { recursive: true });
  return runDir;
}

export async function saveDebugRun(
  runDir: string,
  figmaScreenshot: string,
  iterations: IterationArtifacts[],
): Promise<void> {

  if (figmaScreenshot) await writePng(runDir, "figma-design.png", figmaScreenshot);

  for (const iter of iterations) {
    const label = iter.iteration === 0 ? "render-0-initial" : `render-${iter.iteration}-refined`;
    await writePng(runDir, `${label}.png`, iter.screenshot);
    if (iter.diff) {
      await fs.writeFile(
        path.join(runDir, `diff-${iter.iteration}.json`),
        JSON.stringify(iter.diff, null, 2),
        "utf-8",
      );
    }
  }
}

async function writePng(dir: string, filename: string, base64: string): Promise<void> {
  const buffer = Buffer.from(base64, "base64");
  await fs.writeFile(path.join(dir, filename), buffer);
}
