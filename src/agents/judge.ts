/**
 * Judge Agent — src/agents/judge.ts
 *
 * Renamed from the Diff Agent. Two responsibilities:
 * 1. runJudge  — visual comparison of Figma screenshot vs rendered screenshot
 * 2. extractGuidelines — summarize session critiques into reusable design guidelines
 *
 * The Judge agent is the sole manager of long-term memory.
 */

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import type { DiffReport } from "../types/index.js";
import { fetchFigmaScreenshot } from "../utils/figma.js";
import { readCache, writeCache } from "../utils/llm-cache.js";
import { createLLMClient, type LLMClient } from "../utils/llm-client.js";

function createClient(): LLMClient {
  return createLLMClient(process.env.REQUESTY_DIFF_MODEL);
}

// ---------------------------------------------------------------------------
// Visual comparison
// ---------------------------------------------------------------------------

const JUDGE_SYSTEM_PROMPT = `You are a design-fidelity reviewer.
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

export async function runJudge(
  figmaUrl: string,
  renderedScreenshot: string,
  debugDir?: string,
  iter = 0,
): Promise<DiffReport> {
  const { client, model, provider } = createClient();
  console.log(`  [Judge] backend: ${provider} (${model})`);

  console.log("  [Judge] fetching Figma screenshot…");
  const figmaScreenshot = await fetchFigmaScreenshot(figmaUrl);
  console.log(
    `  [Judge] Figma screenshot received (${Math.round(figmaScreenshot.length / 1024)} KB)`,
  );

  const cacheUserKey = `figma:${figmaScreenshot}|rendered:${renderedScreenshot}`;
  const cached = await readCache(model, JUDGE_SYSTEM_PROMPT, cacheUserKey);
  let raw: string;
  if (cached) {
    console.log("  [Judge] cache hit — skipping LLM call");
    raw = cached;
  } else {
    console.log("  [Judge] calling LLM for visual comparison…");
    try {
      const response = await client.chat.completions.create({
        model,
        max_completion_tokens: 4096,
        temperature: 0,
        messages: [
          { role: "system", content: JUDGE_SYSTEM_PROMPT },
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
      throw new Error(`Judge Agent — ${provider} call failed: ${String(err)}`);
    }
    await writeCache(model, JUDGE_SYSTEM_PROMPT, cacheUserKey, raw);
  }

  if (!raw.trim()) {
    throw new Error("Judge Agent — LLM returned an empty response.");
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Judge Agent — no JSON object found in LLM response:\n${raw}`);
  }

  let report: DiffReport;
  try {
    report = JSON.parse(raw.slice(start, end + 1)) as DiffReport;
  } catch {
    throw new Error(`Judge Agent — failed to parse LLM response as JSON:\n${raw}`);
  }

  console.log(
    `  [Judge] fidelity: ${(report.fidelityScore * 100).toFixed(1)}% — ${report.issues.length} issue(s)`,
  );

  if (debugDir) {
    await fs.writeFile(
      path.join(debugDir, `judge-${iter}-prompt.txt`),
      `=== SYSTEM ===\n${JUDGE_SYSTEM_PROMPT}\n\n=== USER ===\nCompare these two screenshots and return the JSON diff report.\n[figma screenshot: base64 PNG]\n[rendered screenshot: base64 PNG]`,
      "utf-8",
    );
    await fs.writeFile(
      path.join(debugDir, `judge-${iter}-response.json`),
      JSON.stringify(report, null, 2),
      "utf-8",
    );
  }

  return report;
}

// ---------------------------------------------------------------------------
// Guideline extraction — called after a successful session
// ---------------------------------------------------------------------------

const GUIDELINES_SYSTEM_PROMPT = `You are a design-system quality analyst. You have just completed reviewing a Figma-to-code generation session. Below are the diff reports from each iteration.

Your task: extract 1–5 concise, generalizable design guidelines that the code generation agent should follow in future sessions. Each guideline should be:
- Actionable (tells the agent what to DO, not what went wrong)
- General (applies beyond this specific component)
- Concise (one sentence, imperative mood)

Do NOT include guidelines that are specific to this component's content.
Only include patterns that would help with OTHER components too.

Output a JSON array of strings. If no generalizable lessons exist, return [].`;

export async function extractGuidelines(
  sessionDiffs: DiffReport[],
  debugDir?: string,
): Promise<string[]> {
  if (sessionDiffs.length === 0) return [];

  const { client, model, provider } = createClient();
  console.log(`  [Judge] extracting guidelines from ${sessionDiffs.length} diff report(s)… (${provider})`);

  const userText = sessionDiffs
    .map(
      (d, i) =>
        `Iteration ${i}:\n  Fidelity: ${(d.fidelityScore * 100).toFixed(1)}%\n  Summary: ${d.summary}\n  Issues:\n${d.issues.map((iss) => `    - [${iss.category}] ${iss.description}`).join("\n")}`,
    )
    .join("\n\n");

  const cached = await readCache(model, GUIDELINES_SYSTEM_PROMPT, userText);
  let raw: string;
  if (cached) {
    console.log("  [Judge] guidelines cache hit");
    raw = cached;
  } else {
    try {
      const response = await client.chat.completions.create({
        model,
        max_completion_tokens: 1024,
        temperature: 0,
        messages: [
          { role: "system", content: GUIDELINES_SYSTEM_PROMPT },
          { role: "user", content: userText },
        ],
      });
      raw = response.choices[0]?.message?.content ?? "";
    } catch (err) {
      const msg = `[Judge] guideline extraction failed: ${String(err)}`;
      console.warn(`  ${msg}`);
      throw new Error(msg);
    }
    await writeCache(model, GUIDELINES_SYSTEM_PROMPT, userText, raw);
  }

  if (debugDir) {
    await fs.writeFile(
      path.join(debugDir, "guidelines-extraction.json"),
      raw,
      "utf-8",
    );
  }

  // Parse JSON array from response
  const arrStart = raw.indexOf("[");
  const arrEnd = raw.lastIndexOf("]");
  if (arrStart === -1 || arrEnd === -1) return [];

  try {
    const parsed = JSON.parse(raw.slice(arrStart, arrEnd + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}
