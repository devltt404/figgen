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

const JUDGE_SYSTEM_PROMPT = `You are a design-fidelity reviewer. You will receive two labeled screenshots: the original Figma design and the rendered React component. Your job is to identify visual differences and produce fix instructions for a code agent that CANNOT see either image.

## Rules — read these first

1. **Accuracy above all.** Only report differences you are CERTAIN about. If you are unsure whether something differs, DO NOT report it. A wrong instruction is far worse than a missing one — it will break working code.
2. **Look at the images carefully.** The first image is the Figma design. The second image is the rendered component. Do not confuse which is which. When you describe a difference, double-check that you are attributing the correct appearance to the correct image.
3. **Keep it short.** Report only the most obvious and impactful differences. 2–5 high-confidence issues is ideal. Do not pad the list with speculative or low-confidence observations.
4. **No guessing values.** If you cannot clearly determine a specific pixel value, color hex, or radius from the screenshot, describe the difference qualitatively (e.g., "the button corners are more rounded in the render than in the design") rather than inventing exact values.

## What to look for

Focus on differences that a normal person would notice at a glance:
- Structural layout differences (wrong direction, alignment, or order)
- Missing or extra elements
- Clearly wrong colors (not subtle shade differences)
- Obvious size mismatches
- Missing or extra borders, shadows
- Clearly different border-radius (but only if obviously different — do not nitpick)
- Wrong or missing text content
- Inaccurate shapes and alignments (e.g. circles, squares, triangles, centered, aligned, etc.)
- Inaccurate font family, size, weight, style, line height, letter spacing, text wrapping, truncation, etc.
- Inaccurate padding, margin, gap, border, shadow, etc.
- Inaccurate flex, grid, display, visibility, opacity, etc.
- Inaccurate position, top, left, right, bottom, z-index, etc.
- Inaccurate transform, rotate, scale, skew, etc.
- Inaccurate animation, transition, etc.
- Inaccurate media query, breakpoint, etc.
- Inaccurate print, screen, etc.

Skip anything you'd need to squint or pixel-peep to notice.

## How to write each issue

Each issue must tell the blind code agent:
- Which element is wrong (identify by its text label, position, or role)
- What the Figma design shows for that element
- What the rendered component shows instead
- What to change

Example: "The 'Follow' button in the design has rounded corners (~10px radius) but the render shows fully rounded pill-shaped ends — change to rounded-[10px] to match the design"

## Severity
- "critical": Layout structure is wrong, elements are missing or in wrong order
- "moderate": Visible styling difference (color, size, shape, border, shadow)
- "minor": Small but noticeable difference

## Output

Return ONLY a JSON object, no markdown fences:
{
  "summary": "<one sentence>",
  "issues": [
    {
      "category": "<layout|color|typography|spacing|missing-element|extra-element|other>",
      "severity": "<critical|moderate|minor>",
      "description": "<fix instruction>"
    }
  ]
}

If the two images look the same, return an empty issues array.`;

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
                text: "IMAGE 1 below is the ORIGINAL FIGMA DESIGN (the ground truth).",
              },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${figmaScreenshot}`, detail: "high" },
              },
              {
                type: "text",
                text: "IMAGE 2 below is the RENDERED REACT COMPONENT (the implementation to critique). Compare it against the Figma design above and return the JSON diff report.",
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

  console.log(`  [Judge] ${report.issues.length} issue(s) found`);

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
  existingGuidelines?: string[],
): Promise<string[]> {
  if (sessionDiffs.length === 0) return [];

  const { client, model, provider } = createClient();
  console.log(`  [Judge] extracting guidelines from ${sessionDiffs.length} diff report(s)… (${provider})`);

  let userText = sessionDiffs
    .map(
      (d, i) =>
        `Iteration ${i}:\n  Summary: ${d.summary}\n  Issues:\n${d.issues.map((iss) => `    - [${iss.category}]${iss.severity ? ` (${iss.severity})` : ""} ${iss.description}`).join("\n")}`,
    )
    .join("\n\n");

  if (existingGuidelines && existingGuidelines.length > 0) {
    userText += `\n\nEXISTING GUIDELINES (do NOT repeat or rephrase these — only add genuinely new insights):\n${existingGuidelines.map((g) => `- ${g}`).join("\n")}`;
  }

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
