/**
 * Isolated diff-prompt test harness.
 *
 * Usage:
 *   npx tsx scripts/test-diff.ts [runDir] [renderFile]
 *
 * Defaults:
 *   runDir     = output/debug/2026-04-09_03-05-13
 *   renderFile = render-0-initial.png
 *
 * Edit DIFF_SYSTEM_PROMPT below to iterate on the prompt.
 * Results are printed to stdout and saved as diff-test-<timestamp>.json in the run dir.
 */

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

// ─── Edit the prompt here ────────────────────────────────────────────────────

const DIFF_SYSTEM_PROMPT = `
You are a design-fidelity reviewer.

You will be given two screenshots:
  1. The DESIGN (first image)
  2. The IMPLEMENTATION (second image)


Your task is to compare them **visually and pixel-by-pixel** and return a JSON object with this exact shape:
{
  "fidelityScore": <number 0.0–1.0, where 1.0 = pixel-perfect match>,
  "summary": <one-sentence overall assessment>,
  "issues": [
    {
      "category": <"layout" | "typography" | "spacing" | "missing-element" | "extra-element" | "other">,
      "description": <concise description of the discrepancy>
    }
  ]
}

### Evaluation Guidelines

#### layout

* Alignment (left/right/center mismatches)
* Element positioning and order
* Size differences (width/height)
* Overlapping or shifted elements

#### spacing

* Padding and margins
* Gaps between elements. There may be no gaps between elements in the design, but the implementation may introduce gaps. Report any unintended gaps.
* Inconsistent vertical or horizontal rhythm

#### color

* Incorrect colors (text, background, borders, icons)
* Opacity differences
* Missing or incorrect gradients/background fills

#### typography

* Font family mismatches
* Font size, weight, or style differences
* Line height and letter spacing issues
* Text wrapping or truncation differences

#### missing-element

* Any element present in the DESIGN but absent in the IMPLEMENTATION
* Examples: divider lines, borders, icons, labels, shadows, decorations

#### extra-element

* Any element present in the IMPLEMENTATION but not in the DESIGN

#### other

* Border radius differences
* Shadows/elevation mismatches
* Icon style inconsistencies
* Any visual discrepancy not covered above

Rules:
- Output ONLY valid JSON. No markdown fences, no explanation.
- Do NOT omit subtle differences — report every visual discrepancy you find.
- If the images are identical, return fidelityScore: 1.0 and an empty issues array.`;

// ─────────────────────────────────────────────────────────────────────────────

const RUN_DIR = process.argv[2] ?? "output/debug/2026-04-10_03-47-31";
const RENDER_FILE = process.argv[3] ?? "render-0-initial.png";

async function main() {
  const runDir = path.resolve(RUN_DIR);
  const figmaPath = path.join(runDir, "figma-design.png");
  const renderPath = path.join(runDir, RENDER_FILE);

  console.log(`Run dir   : ${runDir}`);
  console.log(`Figma     : ${figmaPath}`);
  console.log(`Render    : ${renderPath}`);
  console.log();

  const [figmaBytes, renderBytes] = await Promise.all([
    fs.readFile(figmaPath),
    fs.readFile(renderPath),
  ]);

  const figmaB64 = figmaBytes.toString("base64");
  const renderB64 = renderBytes.toString("base64");

  const requestyKey = process.env.REQUESTY_API_KEY;
  if (!requestyKey) throw new Error("REQUESTY_API_KEY not set");

  const model =
    process.env.REQUESTY_DIFF_MODEL ??
    process.env.REQUESTY_MODEL ??
    "openai/gpt-4o";

  const client = new OpenAI({
    baseURL: "https://router.requesty.ai/v1",
    apiKey: requestyKey,
  });

  console.log(`Model     : ${model}`);
  console.log("Calling LLM…\n");

  const response = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    temperature: 0,
    messages: [
      { role: "system", content: DIFF_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Compare these two screenshots and return the JSON diff report.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${figmaB64}`,
              detail: "high",
            },
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${renderB64}`,
              detail: "high",
            },
          },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "";
  console.log("=== RAW RESPONSE ===");
  console.log(raw);
  console.log();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`No JSON object found in LLM response`);
  }

  const report = JSON.parse(raw.slice(start, end + 1));

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = path.join(runDir, `diff-test-${ts}.json`);
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\nSaved → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
