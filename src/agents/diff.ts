import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import type { DiffReport } from "../types/index.js";
import { fetchFigmaScreenshot } from "../utils/figma.js";
import { readCache, writeCache } from "../utils/llm-cache.js";

function createClient(): { client: OpenAI; model: string } {
  const requestyKey = process.env.REQUESTY_API_KEY;
  if (!requestyKey) {
    throw new Error("No LLM configured. Set REQUESTY_API_KEY.");
  }
  return {
    client: new OpenAI({
      baseURL: "https://router.requesty.ai/v1",
      apiKey: requestyKey,
    }),
    model:
      process.env.REQUESTY_DIFF_MODEL ??
      process.env.REQUESTY_MODEL ??
      "openai/gpt-4o",
  };
}

const DIFF_SYSTEM_PROMPT = `You are a design-fidelity reviewer.
You will be given two screenshots:
  1. The ORIGINAL Figma design (design)
  2. The RENDERED React component (implementation)

Your task is to compare them and return a JSON object with this exact shape:
{
  "fidelityScore": <number 0.0–1.0, where 1.0 = pixel-perfect match>,
  "summary": <one-sentence overall assessment>,
  "issues": [
    {
      "category": <"layout" | "color" | "typography" | "spacing" | "missing-element" | "extra-element" | "other">,
      "description": <concise description of the discrepancy>
    }
  ]
}

Rules:
- Output ONLY valid JSON. No markdown fences, no explanation.
- If the images are identical, return fidelityScore: 1.0 and an empty issues array.`;

export async function runDiff(
  figmaUrl: string,
  renderedScreenshot: string,
  debugDir?: string,
  iter = 0,
): Promise<DiffReport> {
  const { client, model } = createClient();
  console.log(`  [Diff] backend: Requesty (${model})`);

  console.log("  [Diff] fetching Figma screenshot…");
  const figmaScreenshot = await fetchFigmaScreenshot(figmaUrl);
  console.log(
    `  [Diff] Figma screenshot received (${Math.round(figmaScreenshot.length / 1024)} KB)`,
  );

  const cacheUserKey = `figma:${figmaScreenshot}|rendered:${renderedScreenshot}`;
  const cached = await readCache(model, DIFF_SYSTEM_PROMPT, cacheUserKey);
  let raw: string;
  if (cached) {
    console.log("  [Diff] cache hit — skipping LLM call");
    raw = cached;
  } else {
    console.log("  [Diff] calling LLM for visual comparison…");
    try {
      const response = await client.chat.completions.create({
        model,
        max_tokens: 4096,
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
                image_url: { url: `data:image/png;base64,${figmaScreenshot}`, detail: "high" },
              },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${renderedScreenshot}`, detail: "high" },
              },
            ],
          },
        ],
      });
      raw = response.choices[0]?.message?.content ?? "";
    } catch (err) {
      throw new Error(`Diff Agent — Requesty call failed: ${String(err)}`);
    }
    await writeCache(model, DIFF_SYSTEM_PROMPT, cacheUserKey, raw);
  }

  if (!raw.trim()) {
    throw new Error("Diff Agent — LLM returned an empty response.");
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Diff Agent — no JSON object found in LLM response:\n${raw}`);
  }

  let report: DiffReport;
  try {
    report = JSON.parse(raw.slice(start, end + 1)) as DiffReport;
  } catch {
    throw new Error(`Diff Agent — failed to parse LLM response as JSON:\n${raw}`);
  }

  console.log(
    `  [Diff] fidelity: ${(report.fidelityScore * 100).toFixed(1)}% — ${report.issues.length} issue(s)`,
  );

  if (debugDir) {
    await fs.writeFile(
      path.join(debugDir, `diff-${iter}-response.json`),
      JSON.stringify(report, null, 2),
      "utf-8",
    );
  }

  return report;
}
